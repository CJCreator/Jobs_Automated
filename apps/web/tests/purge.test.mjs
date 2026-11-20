// The 12-month deletion promise on the privacy screen: purgeInactiveUsers.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { normalizeFacts } from "../src/lib/facts.mjs";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const TABLES = ["resumes", "fact_bases", "jobs", "tailorings"];
let db;

before(async () => {
  db = await createDb();
});
after(async () => {
  await db.close();
});

async function userSeen(email, lastSeen) {
  const user = await repo.upsertUserByEmail(db, { email });
  await repo.linkAccount(db, { userId: user.id, provider: "google", providerAccountId: `g-${email}` });
  await repo.saveResume(db, user.id, { filename: "r.pdf", rawText: "Some resume text" });
  await repo.saveFacts(db, user.id, normalizeFacts({ summary: { text: "A summary", confirmed: true } }, { trustConfirmed: true }));
  await repo.createJobWithTailoring(db, user.id, { title: "T", company: "C", jdText: "x".repeat(250), suggestions: [], provider: "gemini", model: "m" });
  await db.system.query("UPDATE users SET last_seen_at = $2 WHERE id = $1", [user.id, lastSeen.toISOString()]);
  return user;
}

const rowCount = async (table, userId) => (await db.system.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId])).rows[0].n;
const exists = async (id) => (await db.system.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [id])).rows[0].n === 1;

test("a user idle for 13 months is deleted with every row, one idle for 11 months is kept", async () => {
  const old = await userSeen("old@example.com", new Date("2025-10-18T10:00:00.000Z"));
  const recent = await userSeen("recent@example.com", new Date("2025-12-18T10:00:00.000Z"));
  const deleted = await repo.purgeInactiveUsers(db, { months: 12, now: NOW });
  assert.equal(deleted, 1);
  assert.equal(await exists(old.id), false);
  for (const table of TABLES) assert.equal(await rowCount(table, old.id), 0, `no ${table} rows left for the deleted user`);
  const accounts = (await db.system.query("SELECT count(*)::int AS n FROM accounts WHERE user_id = $1", [old.id])).rows[0].n;
  assert.equal(accounts, 0);
  assert.equal(await exists(recent.id), true);
  for (const table of TABLES) assert.equal(await rowCount(table, recent.id), 1, `${table} kept for the active user`);
});

test("the boundary: exactly 12 months idle is kept, one second past it is deleted", async () => {
  const exact = await userSeen("exact@example.com", new Date("2025-11-18T10:00:00.000Z"));
  const justOver = await userSeen("justover@example.com", new Date("2025-11-18T09:59:59.000Z"));
  const deleted = await repo.purgeInactiveUsers(db, { months: 12, now: NOW });
  assert.equal(deleted, 1);
  assert.equal(await exists(exact.id), true);
  assert.equal(await exists(justOver.id), false);
});

test("month arithmetic does not overflow at the end of a month", async () => {
  await db.system.query("DELETE FROM users");
  // 12 months before 29 Feb 2028 is 28 Feb 2027, not 1 Mar 2027.
  const leapNow = new Date("2028-02-29T00:00:00.000Z");
  const kept = await userSeen("feb-kept@example.com", new Date("2027-02-28T00:00:00.000Z"));
  const gone = await userSeen("feb-gone@example.com", new Date("2027-02-27T23:59:59.000Z"));
  assert.equal(await repo.purgeInactiveUsers(db, { months: 12, now: leapNow }), 1);
  assert.equal(await exists(kept.id), true);
  assert.equal(await exists(gone.id), false);
});

test("months below 1, fractions and non-numbers are refused and delete nothing", async () => {
  const user = await userSeen("safe@example.com", new Date("2000-01-01T00:00:00.000Z"));
  for (const months of [0, -1, 0.5, Number.NaN, "12", null, Infinity]) {
    await assert.rejects(() => repo.purgeInactiveUsers(db, { months, now: NOW }), RangeError, `months=${String(months)}`);
  }
  assert.equal(await exists(user.id), true);
  await assert.rejects(() => repo.purgeInactiveUsers(db, { months: 12, now: new Date("nope") }), RangeError);
});

test("the default is 12 months and a purge with nobody idle returns 0", async () => {
  // The user from the previous test is far past the cutoff, so remove it first.
  await db.system.query("DELETE FROM users");
  const user = await userSeen("default@example.com", new Date(Date.now() - 30 * 24 * 3600 * 1000));
  assert.equal(await repo.purgeInactiveUsers(db), 0);
  assert.equal(await exists(user.id), true);
});

const tokenCount = async (email) => (await db.system.query("SELECT count(*)::int AS n FROM verification_tokens WHERE identifier = $1", [email])).rows[0].n;
const future = new Date(Date.now() + 3600 * 1000);

test("purging a user removes their email-link tokens, keeps other users' tokens, and removes expired tokens", async () => {
  await db.system.query("DELETE FROM users");
  await db.system.query("DELETE FROM verification_tokens");
  await userSeen("tok-old@example.com", new Date("2000-01-01T00:00:00.000Z"));
  await userSeen("tok-keep@example.com", new Date());
  await repo.createVerificationToken(db, { identifier: "tok-old@example.com", token: "t1", expires: future });
  await repo.createVerificationToken(db, { identifier: "tok-keep@example.com", token: "t2", expires: future });
  await repo.createVerificationToken(db, { identifier: "stranger@example.com", token: "t3", expires: new Date(Date.now() - 1000) });
  assert.equal(await repo.purgeInactiveUsers(db, { months: 12 }), 1);
  assert.equal(await tokenCount("tok-old@example.com"), 0);
  assert.equal(await tokenCount("tok-keep@example.com"), 1);
  assert.equal(await tokenCount("stranger@example.com"), 0, "expired token removed");
});

test("deleteUserData removes the user's tokens and leaves another user's", async () => {
  await db.system.query("DELETE FROM users");
  await db.system.query("DELETE FROM verification_tokens");
  const a = await userSeen("tok-a@example.com", new Date());
  await userSeen("tok-b@example.com", new Date());
  await repo.createVerificationToken(db, { identifier: "tok-a@example.com", token: "a1", expires: future });
  await repo.createVerificationToken(db, { identifier: "tok-b@example.com", token: "b1", expires: future });
  assert.equal(await repo.deleteUserData(db, a.id), true);
  assert.equal(await tokenCount("tok-a@example.com"), 0);
  assert.equal(await tokenCount("tok-b@example.com"), 1);
});
