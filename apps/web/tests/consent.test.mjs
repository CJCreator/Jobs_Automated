import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import { NOTICE_VERSION } from "../src/lib/notice.mjs";
import { AI_PURPOSE, hasConsent, recordConsent } from "../src/lib/db/consents.mjs";

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
