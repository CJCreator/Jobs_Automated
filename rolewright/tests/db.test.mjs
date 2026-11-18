// Runs on an in-memory PGlite by default. To run the same tests against a
// real Postgres server through the `pg` driver:
//
//   ROLEWRIGHT_TEST_DATABASE_URL=postgres://<app login>:<pw>@host:port/postgres
//   ROLEWRIGHT_TEST_ADMIN_URL=postgres://<admin>:<pw>@host:port/postgres   (optional)
//
// Every database a test asks for is then a brand-new Postgres database, owned
// by the login in ROLEWRIGHT_TEST_DATABASE_URL and dropped at the end. The
// admin URL (default: the same URL) is only used to create and drop those
// databases, so the app login needs no CREATEDB; see README.md for the
// production role set-up these tests assume.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { emptyFacts, normalizeFacts } from "../src/lib/facts.mjs";

const PG_URL = process.env.ROLEWRIGHT_TEST_DATABASE_URL || "";
const PG_ADMIN_URL = process.env.ROLEWRIGHT_TEST_ADMIN_URL || PG_URL;
const PG = Boolean(PG_URL);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function adminQuery(sql) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: PG_ADMIN_URL });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;
const open = [];
const createdDatabases = [];

async function freshDb() {
  let db;
  if (PG) {
    const name = `rw_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const owner = decodeURIComponent(new URL(PG_URL).username);
    await adminQuery(`CREATE DATABASE ${quoteIdent(name)} OWNER ${quoteIdent(owner)}`);
    createdDatabases.push(name);
    const url = new URL(PG_URL);
    url.pathname = `/${name}`;
    db = await createDb({ connectionString: url.toString() });
  } else {
    db = await createDb();
  }
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
  for (const name of createdDatabases) await adminQuery(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
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

test("the scope runs as the app role, not the connecting login", async () => {
  const who = await db.withUser(A, async (tx) => (await tx.query("SELECT current_user AS u")).rows[0].u);
  assert.equal(who, "rolewright_app");
  const login = (await db.system.query("SELECT current_user AS u")).rows[0].u;
  assert.notEqual(login, "rolewright_app");
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

// ---- concurrency and locked updates ----------------------------------------

/** A database with one user, confirmed facts, and a tailoring of two pending suggestions. */
async function reviewFixture() {
  const d = await freshDb();
  const u = (await repo.upsertUserByEmail(d, { email: "review@example.com" })).id;
  await repo.saveFacts(d, u, normalizeFacts({ summary: { text: "Analyst.", confirmed: true } }, { trustConfirmed: true }));
  const job = (await repo.createJob(d, u, { title: "Analyst", company: "Q", jdText: "j" })).id;
  const s1 = suggestion("pending");
  const s2 = suggestion("pending");
  const t = (await repo.createTailoring(d, u, { jobId: job, suggestions: [s1, s2] })).id;
  return { d, u, t, s1, s2 };
}

test("concurrent scopes for two users on one pool never see each other's rows", async () => {
  const d = await freshDb();
  const u = (await repo.upsertUserByEmail(d, { email: "u@example.com" })).id;
  const v = (await repo.upsertUserByEmail(d, { email: "v@example.com" })).id;

  // 20 transactions, alternating users, each yielding several times so that on
  // a pool they really do run side by side on different connections.
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => {
    const me = i % 2 ? v : u;
    return d.withUser(me, async (tx) => {
      const seen = [];
      for (let round = 0; round < 3; round++) {
        await tx.query("INSERT INTO jobs (id, user_id, title) VALUES ($1, $2, $3)", [crypto.randomUUID(), me, `call ${i} round ${round}`]);
        await pause(Math.floor(Math.random() * 15));
        const { rows } = await tx.query(
          "SELECT user_id, current_setting('app.user_id') AS scope, current_user AS role FROM jobs",
        );
        seen.push(...rows);
      }
      return { me, seen };
    });
  }));

  for (const { me, seen } of results) {
    assert.ok(seen.length >= 3);
    for (const row of seen) {
      assert.equal(row.user_id, me, "a scope saw another user's row");
      assert.equal(row.scope, me, "a scope ran with another user's id");
      assert.equal(row.role, "rolewright_app");
    }
  }
  const count = (user) => d.withUser(user, async (tx) => (await tx.query("SELECT count(*)::int AS n FROM jobs")).rows[0].n);
  assert.equal(await count(u), 30);
  assert.equal(await count(v), 30);

  // Every connection went back to the pool with the role and user id cleared.
  const outside = await Promise.all(Array.from({ length: 12 }, () =>
    d.system.query("SELECT current_user AS role, current_setting('app.user_id', true) AS scope")));
  for (const { rows: [row] } of outside) {
    assert.notEqual(row.role, "rolewright_app");
    assert.ok(!row.scope, `a pooled connection kept app.user_id=${row.scope}`);
  }
});

test("changeTailoring: two review actions at once on one tailoring both land", async () => {
  const { d, u, t, s1, s2 } = await reviewFixture();
  const decide = (sid, decision, claim) => repo.changeTailoring(d, u, t, async ({ tailoring, facts }) => {
    // Hold the locks while the other request tries to read.
    await pause(40);
    return {
      suggestions: tailoring.suggestions.map((s) => (s.id === sid ? { ...s, decision } : s)),
      facts: { ...facts, cannotConfirm: [...facts.cannotConfirm, claim] },
    };
  });
  const [first, second] = await Promise.all([decide(s1.id, "accepted", "first"), decide(s2.id, "rejected", "second")]);
  assert.equal(first.tailoring.id, t);
  assert.equal(second.suggestions.length, 2);

  const after = await repo.getTailoring(d, u, t);
  assert.deepEqual(after.suggestions.map((s) => s.decision), ["accepted", "rejected"]);
  assert.deepEqual([...(await repo.getFacts(d, u)).cannotConfirm].sort(), ["first", "second"]);
});

test("negative control: the same read-modify-write without the row locks DOES lose an update", { skip: !PG && "PGlite runs one transaction at a time, so nothing can interleave" }, async () => {
  const { d, u, t, s1, s2 } = await reviewFixture();
  const unlocked = (sid, decision) => d.withUser(u, async (tx) => {
    const { rows } = await tx.query("SELECT suggestions FROM tailorings WHERE id = $1", [t]);
    await pause(40);
    const next = rows[0].suggestions.map((s) => (s.id === sid ? { ...s, decision } : s));
    await tx.query("UPDATE tailorings SET suggestions = $2::jsonb WHERE id = $1", [t, JSON.stringify(next)]);
  });
  await Promise.all([unlocked(s1.id, "accepted"), unlocked(s2.id, "rejected")]);
  const decisions = (await repo.getTailoring(d, u, t)).suggestions.map((s) => s.decision);
  assert.equal(decisions.filter((x) => x === "pending").length, 1, `one change should be lost without locks: ${decisions}`);
});

test("negative control: the old route shape (read in one transaction, write in another) loses an update, on any driver", async () => {
  const { d, u, t, s1, s2 } = await reviewFixture();
  const twoStep = async (sid, decision) => {
    const current = await repo.getTailoring(d, u, t);
    await pause(40);
    const next = current.suggestions.map((s) => (s.id === sid ? { ...s, decision } : s));
    await repo.updateTailoringSuggestions(d, u, t, next);
  };
  await Promise.all([twoStep(s1.id, "accepted"), twoStep(s2.id, "rejected")]);
  const decisions = (await repo.getTailoring(d, u, t)).suggestions.map((s) => s.decision);
  assert.equal(decisions.filter((x) => x === "pending").length, 1, `one change should be lost: ${decisions}`);
});

test("changeFacts: concurrent changes both land, including the very first save", async () => {
  const d = await freshDb();
  const u = (await repo.upsertUserByEmail(d, { email: "first@example.com" })).id;
  const add = (claim) => repo.changeFacts(d, u, async (facts) => {
    await pause(40);
    return { ...facts, cannotConfirm: [...facts.cannotConfirm, claim] };
  });
  await Promise.all([add("one"), add("two"), add("three")]);
  assert.deepEqual([...(await repo.getFacts(d, u)).cannotConfirm].sort(), ["one", "three", "two"]);
});

test("changeTailoring: not found for another user or a bad id; a throw rolls everything back", async () => {
  const { d, u, t } = await reviewFixture();
  const other = (await repo.upsertUserByEmail(d, { email: "other@example.com" })).id;
  const factRows = (user) => d.withUser(user, async (tx) => (await tx.query("SELECT count(*)::int AS n FROM fact_bases")).rows[0].n);
  let called = false;
  const mark = () => {
    called = true;
    return { suggestions: [] };
  };
  assert.equal(await repo.changeTailoring(d, other, t, mark), null);
  assert.equal(await repo.changeTailoring(d, u, "not-a-uuid", mark), null);
  assert.equal(called, false, "the change never runs for a tailoring the user cannot see");
  assert.equal(await factRows(other), 0, "and the other user got no Fact Base row out of it");

  // A refused action (a 409 in the route) writes nothing.
  const before = await repo.getTailoring(d, u, t);
  const factsBefore = await repo.getFacts(d, u);
  const refuse = () => {
    throw Object.assign(new Error("refused"), { status: 409 });
  };
  await assert.rejects(repo.changeTailoring(d, u, t, refuse), /refused/);
  assert.deepEqual(await repo.getTailoring(d, u, t), before);
  assert.deepEqual(await repo.getFacts(d, u), factsBefore);

  // For a user with no Fact Base yet, the empty row made for the lock goes with the rollback.
  const job = (await repo.createJob(d, other, { title: "T", company: "C", jdText: "j" })).id;
  const otherTailoring = (await repo.createTailoring(d, other, { jobId: job, suggestions: [suggestion("pending")] })).id;
  await assert.rejects(repo.changeTailoring(d, other, otherTailoring, refuse), /refused/);
  assert.equal(await factRows(other), 0);
  await assert.rejects(repo.changeFacts(d, other, refuse), /refused/);
  assert.equal(await factRows(other), 0);
});

test("createJobWithTailoring writes both rows, or neither", async () => {
  const d = await freshDb();
  const u = (await repo.upsertUserByEmail(d, { email: "jobs@example.com" })).id;
  const { id, jobId } = await repo.createJobWithTailoring(d, u, {
    title: "Analyst", company: "Q", jdText: "j", suggestions: [suggestion("pending")], provider: "mock", model: "m",
  });
  const made = await repo.getTailoring(d, u, id);
  assert.equal(made.jobId, jobId);
  assert.equal(made.title, "Analyst");
  assert.equal(made.suggestions.length, 1);

  // A value Postgres refuses for the jsonb column makes the second insert fail.
  const jobs = () => d.withUser(u, async (tx) => (await tx.query("SELECT count(*)::int AS n FROM jobs")).rows[0].n);
  const before = await jobs();
  await assert.rejects(repo.createJobWithTailoring(d, u, { title: "Half", company: "Q", jdText: "j", suggestions: [{ bad: "\u0000" }] }));
  assert.equal(await jobs(), before, "the job was rolled back with the failed tailoring");
});

test("deleteUserData removes one user's data and leaves the other's", async () => {
  await repo.saveFacts(db, B, normalizeFacts({ summary: { text: "Designer.", confirmed: true } }, { trustConfirmed: true }));
  const bJob = (await repo.createJob(db, B, { title: "Designer", company: "Y", jdText: "t" })).id;
  const bTailoring = (await repo.createTailoring(db, B, { jobId: bJob, suggestions: [suggestion("pending")] })).id;

  // Counted inside A's own scope: row-level security shows exactly A's rows
  // there. (Outside a scope a non-superuser login cannot count them at all:
  // the tables force their policies even on their owner, and the policies
  // need app.user_id.)
  const countsFor = (user) => db.withUser(user, async (tx) => (await tx.query(
    `SELECT (SELECT count(*) FROM resumes)::int AS r,
            (SELECT count(*) FROM jobs)::int AS j,
            (SELECT count(*) FROM tailorings)::int AS t,
            (SELECT count(*) FROM fact_bases)::int AS f`)).rows[0]);
  const beforeDelete = await countsFor(A);
  assert.ok(beforeDelete.r > 0 && beforeDelete.j > 0 && beforeDelete.t > 0 && beforeDelete.f > 0, JSON.stringify(beforeDelete));

  assert.equal(await repo.deleteUserData(db, A), true);

  assert.equal(await repo.getUserById(db, A), null);
  assert.deepEqual(await repo.getFacts(db, A), emptyFacts());
  assert.deepEqual(await repo.listTailorings(db, A), []);
  assert.deepEqual(await countsFor(A), { r: 0, j: 0, t: 0, f: 0 });

  assert.equal((await repo.getFacts(db, B)).summary.text, "Designer.");
  assert.ok(await repo.getTailoring(db, B, bTailoring));
  assert.equal((await repo.listTailorings(db, B)).length, 1);
});
