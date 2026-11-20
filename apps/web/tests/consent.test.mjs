import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import { NOTICE_VERSION } from "../src/lib/notice.mjs";
import { readFileSync } from "node:fs";
import { AI_PURPOSE, STORAGE_PURPOSE, hasConsent, recordConsent } from "../src/lib/db/consents.mjs";

let db;
let A;
let B;
const addUser = async (email) =>
  (await db.system.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [email])).rows[0].id;
const v = { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE };

before(async () => {
  db = await createDb();
  A = await addUser("a@example.com");
  B = await addUser("b@example.com");
});
after(() => db.close());

test("the purpose constant is ai_processing", () => {
  assert.equal(AI_PURPOSE, "ai_processing");
});

test("no consent until recorded, then it reads back", async () => {
  assert.equal(await hasConsent(db, A, v), false);
  await recordConsent(db, A, v);
  assert.equal(await hasConsent(db, A, v), true);
  assert.equal(await hasConsent(db, A, { noticeVersion: "older", purpose: AI_PURPOSE }), false);
  assert.equal(await hasConsent(db, B, v), false);
});

test("recording twice is idempotent and keeps the first timestamp", async () => {
  const first = (await db.system.query("SELECT accepted_at FROM consents WHERE user_id = $1", [A])).rows;
  await recordConsent(db, A, v);
  await recordConsent(db, A, v);
  const rows = (await db.system.query("SELECT accepted_at FROM consents WHERE user_id = $1", [A])).rows;
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].accepted_at), String(first[0].accepted_at));
});

test("user B cannot read A's consent", async () => {
  const seen = await db.withUser(B, (q) => q.query("SELECT * FROM consents"));
  assert.equal(seen.rows.length, 0);
  const own = await db.withUser(A, (q) => q.query("SELECT * FROM consents"));
  assert.equal(own.rows.length, 1);
});

test("B cannot insert a row carrying A's user id", async () => {
  await assert.rejects(
    db.withUser(B, (q) =>
      q.query("INSERT INTO consents (id, user_id, notice_version, purpose) VALUES (gen_random_uuid(), $1, 'x', 'ai_processing')", [A]),
    ),
  );
});

test("the app role cannot update or delete a consent", async () => {
  await assert.rejects(db.withUser(A, (q) => q.query("UPDATE consents SET notice_version = 'x'")), /permission denied/);
  await assert.rejects(db.withUser(A, (q) => q.query("DELETE FROM consents")), /permission denied/);
  assert.equal(await hasConsent(db, A, v), true);
});

test("deleting the user removes the consent row", async () => {
  await recordConsent(db, B, v);
  await db.system.query("DELETE FROM users WHERE id = $1", [B]);
  const { rows } = await db.system.query("SELECT 1 FROM consents WHERE user_id = $1", [B]);
  assert.equal(rows.length, 0);
});

test("consents has forced row-level security", async () => {
  const { rows } = await db.system.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'consents'");
  assert.deepEqual(rows[0], { relrowsecurity: true, relforcerowsecurity: true });
});

// P1-15: consent names the provider; storing facts needs its own consent.
const gemini = { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE, provider: "gemini" };
const anthropic = { ...gemini, provider: "anthropic" };

test("the storage purpose constant is storage", () => {
  assert.equal(STORAGE_PURPOSE, "storage");
});

test("a row for gemini does not satisfy anthropic", async () => {
  const U = await addUser("p1@example.com");
  await recordConsent(db, U, gemini);
  assert.equal(await hasConsent(db, U, gemini), true);
  assert.equal(await hasConsent(db, U, anthropic), false);
  await recordConsent(db, U, anthropic);
  assert.equal(await hasConsent(db, U, anthropic), true);
  const { rows } = await db.system.query("SELECT 1 FROM consents WHERE user_id = $1", [U]);
  assert.equal(rows.length, 2);
});

test("legacy rows (provider '') do not satisfy a named provider", async () => {
  const U = await addUser("legacy@example.com");
  await recordConsent(db, U, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE });
  assert.equal(await hasConsent(db, U, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE }), true);
  assert.equal(await hasConsent(db, U, gemini), false);
});

test("the trial provider is allowed; bad provider values are refused", async () => {
  const U = await addUser("trial@example.com");
  await recordConsent(db, U, { ...gemini, provider: "trial" });
  assert.equal(await hasConsent(db, U, { ...gemini, provider: "trial" }), true);
  for (const provider of ["Gemini", "g", "has space", "x".repeat(21), "a-b", "1234"]) {
    await assert.rejects(recordConsent(db, U, { ...gemini, provider }), /provider/i, provider);
    await assert.rejects(hasConsent(db, U, { ...gemini, provider }), /provider/i, provider);
  }
});

test("storage consent is separate from AI consent", async () => {
  const U = await addUser("storage@example.com");
  const storage = { noticeVersion: NOTICE_VERSION, purpose: STORAGE_PURPOSE };
  assert.equal(await hasConsent(db, U, storage), false);
  await recordConsent(db, U, gemini);
  assert.equal(await hasConsent(db, U, storage), false);
  await recordConsent(db, U, storage);
  await recordConsent(db, U, storage);
  assert.equal(await hasConsent(db, U, storage), true);
  const { rows } = await db.system.query("SELECT 1 FROM consents WHERE user_id = $1 AND purpose = 'storage'", [U]);
  assert.equal(rows.length, 1);
});

test("user B cannot see user A's provider-specific rows", async () => {
  const X = await addUser("x@example.com");
  const Y = await addUser("y@example.com");
  await recordConsent(db, X, gemini);
  assert.equal(await hasConsent(db, Y, gemini), false);
  const seen = await db.withUser(Y, (q) => q.query("SELECT * FROM consents"));
  assert.equal(seen.rows.length, 0);
});

test("PUT /api/facts refuses without storage consent, before reading the body", () => {
  const src = readFileSync(new URL("../src/app/api/facts/route.ts", import.meta.url), "utf8");
  const put = src.slice(src.indexOf("export const PUT"));
  const gate = put.indexOf("requireStorageConsent(userId)");
  assert.ok(gate > 0, "PUT must call requireStorageConsent(userId)");
  assert.ok(gate < put.indexOf("readJsonObject"), "the consent check must come before the body is read");
  const get = src.slice(src.indexOf("export const GET"), src.indexOf("export const PUT"));
  assert.ok(!get.includes("requireStorageConsent"), "GET is unchanged");
});

test("requireStorageConsent answers 403 storage_consent_required and checks the storage purpose", () => {
  const src = readFileSync(new URL("../src/lib/server/consent.ts", import.meta.url), "utf8");
  assert.match(src, /export async function requireStorageConsent\(userId: string\)/);
  assert.match(src, /403,\s*"storage_consent_required"/);
  assert.match(src, /STORAGE_PURPOSE/);
  assert.match(src, /export async function requireConsent\(userId: string, provider\?: string\)/);
});
