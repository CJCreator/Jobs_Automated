import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { emptyFacts, normalizeFacts } from "../src/lib/facts.mjs";

const open = [];
async function freshDb() {
  const db = await createDb();
  open.push(db);
  return db;
}

let db;
let A;
let B;
let aFacts;
let aJob;
let aTailoring;
const suggestion = (decision) => ({
  id: crypto.randomUUID(), ref: "summary", kind: "summary", context: "Summary",
  before: "old", after: "new", rationale: "fits", check: { verdict: "pass", issues: [], advisory: [], engineRan: true },
  decision, finalText: "new",
});

before(async () => {
  db = await freshDb();
  A = (await repo.upsertUserByEmail(db, { email: "  Asha@Example.com " })).id;
  B = (await repo.upsertUserByEmail(db, { email: "bala@example.com" })).id;

  aFacts = normalizeFacts({
    contact: { name: "Asha Rao", email: "asha@example.com", confirmed: true },
    summary: { text: "Backend engineer.", confirmed: true },
    experience: [{ company: "Acme", title: "Engineer", confirmed: true, bullets: [{ text: "Built an API.", confirmed: true }] }],
  }, { trustConfirmed: true });
  await repo.saveFacts(db, A, aFacts);
  await repo.saveResume(db, A, { filename: "asha.pdf", rawText: "Asha Rao Backend engineer" });
  aJob = (await repo.createJob(db, A, { title: "Backend Engineer", company: "Zeta", jdText: "x".repeat(250) })).id;
  aTailoring = (await repo.createTailoring(db, A, {
    jobId: aJob, suggestions: [suggestion("pending"), suggestion("accepted"), suggestion("accepted")], provider: "mock", model: "m",
  })).id;
});

after(async () => {
  for (const d of open) await d.close();
});

test("emails are lower-cased and trimmed, and the user is found either way", async () => {
  const byEmail = await repo.getUserByEmail(db, "ASHA@example.com  ");
  assert.equal(byEmail.id, A);
  assert.equal(byEmail.email, "asha@example.com");
  const again = await repo.upsertUserByEmail(db, { email: "asha@example.com", name: "Asha" });
  assert.equal(again.id, A);
  assert.equal(again.name, "Asha");
  assert.equal((await repo.getUserById(db, "not-a-uuid")), null);
});

test("owner can read back what they saved", async () => {
  assert.deepEqual(await repo.getFacts(db, A), aFacts);
  const t = await repo.getTailoring(db, A, aTailoring);
  assert.equal(t.title, "Backend Engineer");
  assert.equal(t.company, "Zeta");
  assert.equal(t.jdText.length, 250);
  assert.equal(t.suggestions.length, 3);
  const list = await repo.listTailorings(db, A);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].pending, list[0].accepted, list[0].rejected], [1, 2, 0]);
});

test("facts upsert replaces rather than duplicating", async () => {
  const next = { ...aFacts, skills: normalizeFacts({ skills: ["SQL"] }).skills };
  await repo.saveFacts(db, A, next);
  assert.equal((await repo.getFacts(db, A)).skills.length, 1);
  await repo.saveFacts(db, A, aFacts);
  assert.equal((await repo.getFacts(db, A)).skills.length, 0);
});

test("another user sees none of it through the repo functions", async () => {
  assert.deepEqual(await repo.getFacts(db, B), emptyFacts());
  assert.deepEqual(await repo.listTailorings(db, B), []);
  assert.equal(await repo.getTailoring(db, B, aTailoring), null);
  assert.equal(await repo.getTailoring(db, A, "nope"), null);

  const before = await repo.getTailoring(db, A, aTailoring);
  const changed = await repo.updateTailoringSuggestions(db, B, aTailoring, [suggestion("rejected")]);
  assert.equal(changed, false);
  assert.deepEqual(await repo.getTailoring(db, A, aTailoring), before);

  await assert.rejects(
    repo.createTailoring(db, B, { jobId: aJob, suggestions: [] }),
    /not found/,
  );
});

test("raw SQL inside another user's scope is blocked by the database", async () => {
  await assert.rejects(
    db.withUser(B, (tx) =>
      tx.query("INSERT INTO jobs (id, user_id, title) VALUES ($1, $2, 'planted')", [crypto.randomUUID(), A])),
    /row-level security/,
  );
  const rows = await db.withUser(B, async (tx) => (await tx.query("SELECT * FROM jobs")).rows);
  assert.equal(rows.length, 0);
  await assert.rejects(db.withUser(B, (tx) => tx.query("SELECT * FROM users")), /permission denied/);
  await assert.rejects(db.withUser(B, (tx) => tx.query("SELECT * FROM verification_tokens")), /permission denied/);
  // B cannot rewrite or delete A's rows either: they are simply invisible.
  const touched = await db.withUser(B, async (tx) => (await tx.query("DELETE FROM jobs RETURNING id")).rows);
  assert.equal(touched.length, 0);
  assert.ok(await repo.getTailoring(db, A, aTailoring));
});

test("the scope runs as the app role, not the connecting superuser", async () => {
  const who = await db.withUser(A, async (tx) => (await tx.query("SELECT current_user AS u")).rows[0].u);
  assert.equal(who, "rolewright_app");
  const superuser = (await db.system.query("SELECT current_user AS u")).rows[0].u;
  assert.notEqual(superuser, "rolewright_app");
});

test("negative control: with permissive policies the same read DOES leak", async () => {
  const leaky = await freshDb();
  const a = (await repo.upsertUserByEmail(leaky, { email: "a@example.com" })).id;
  const b = (await repo.upsertUserByEmail(leaky, { email: "b@example.com" })).id;
  await repo.createJob(leaky, a, { title: "secret", company: "Z", jdText: "t" });

  // Sanity: the policies hold before we break them.
  assert.equal((await leaky.withUser(b, async (tx) => (await tx.query("SELECT * FROM jobs")).rows)).length, 0);

  await leaky.system.query("DROP POLICY jobs_isolation ON jobs");
  await leaky.system.query("CREATE POLICY jobs_isolation ON jobs USING (true) WITH CHECK (true)");
  const seen = await leaky.withUser(b, async (tx) => (await tx.query("SELECT title FROM jobs")).rows);
  assert.equal(seen.length, 1, "the isolation tests can fail: a permissive policy exposes A's job to B");
  assert.equal(seen[0].title, "secret");
});

test("withUser rejects a non-UUID id before any query runs", async () => {
  let ran = false;
  for (const bad of ["x'; DROP TABLE users; --", "", null, undefined, 42, "11111111-1111-1111-1111-11111111111"]) {
    await assert.rejects(db.withUser(bad, async () => { ran = true; }), TypeError);
  }
  assert.equal(ran, false);
  const { rows } = await db.system.query("SELECT count(*)::int AS n FROM users");
  assert.ok(rows[0].n >= 2);
});

test("a failed callback rolls the whole scope back", async () => {
  const tmp = crypto.randomUUID();
  await assert.rejects(db.withUser(A, async (tx) => {
    await tx.query("INSERT INTO jobs (id, user_id, title) VALUES ($1, $2, 'half')", [tmp, A]);
    throw new Error("boom");
  }), /boom/);
  const rows = await db.withUser(A, async (tx) => (await tx.query("SELECT id FROM jobs WHERE id = $1", [tmp])).rows);
  assert.equal(rows.length, 0);
});

test("running the schema again does not throw and keeps the policies working", async () => {
  const again = await freshDb();
  const u = (await repo.upsertUserByEmail(again, { email: "c@example.com" })).id;
  const v = (await repo.upsertUserByEmail(again, { email: "d@example.com" })).id;
  await repo.createJob(again, u, { title: "t", company: "c", jdText: "j" });
  await again.applySchema();
  await again.applySchema();
  assert.equal((await again.withUser(v, async (tx) => (await tx.query("SELECT * FROM jobs")).rows)).length, 0);
  assert.equal((await again.withUser(u, async (tx) => (await tx.query("SELECT * FROM jobs")).rows)).length, 1);
});

test("verification tokens are single use", async () => {
  const expires = new Date(Date.now() + 60_000);
  await repo.createVerificationToken(db, { identifier: "Asha@example.com", token: "tok123", expires });
  const first = await repo.useVerificationToken(db, { identifier: "asha@example.com", token: "tok123" });
  assert.equal(first.token, "tok123");
  assert.equal(await repo.useVerificationToken(db, { identifier: "asha@example.com", token: "tok123" }), null);
});

test("accounts link and resolve to the user", async () => {
  await repo.linkAccount(db, { userId: A, provider: "google", providerAccountId: 1234 });
  await repo.linkAccount(db, { userId: A, provider: "google", providerAccountId: 1234 });
  assert.equal((await repo.getUserByAccount(db, "google", "1234")).id, A);
  assert.equal(await repo.getUserByAccount(db, "google", "9999"), null);
});

test("deleteUserData removes one user's data and leaves the other's", async () => {
  await repo.saveFacts(db, B, normalizeFacts({ summary: { text: "Designer.", confirmed: true } }, { trustConfirmed: true }));
  const bJob = (await repo.createJob(db, B, { title: "Designer", company: "Y", jdText: "t" })).id;
  const bTailoring = (await repo.createTailoring(db, B, { jobId: bJob, suggestions: [suggestion("pending")] })).id;

  assert.equal(await repo.deleteUserData(db, A), true);

  assert.equal(await repo.getUserById(db, A), null);
  assert.deepEqual(await repo.getFacts(db, A), emptyFacts());
  assert.deepEqual(await repo.listTailorings(db, A), []);
  const leftovers = (await db.system.query(
    `SELECT (SELECT count(*) FROM resumes WHERE user_id = $1)::int AS r,
            (SELECT count(*) FROM jobs WHERE user_id = $1)::int AS j,
            (SELECT count(*) FROM tailorings WHERE user_id = $1)::int AS t,
            (SELECT count(*) FROM fact_bases WHERE user_id = $1)::int AS f`, [A])).rows[0];
  // The owner role sees through RLS only if it is a superuser; this checks the cascade either way.
  assert.deepEqual(leftovers, { r: 0, j: 0, t: 0, f: 0 });

  assert.equal((await repo.getFacts(db, B)).summary.text, "Designer.");
  assert.ok(await repo.getTailoring(db, B, bTailoring));
  assert.equal((await repo.listTailorings(db, B)).length, 1);
});
