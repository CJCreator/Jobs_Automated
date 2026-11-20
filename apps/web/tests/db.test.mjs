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
//
// ROLEWRIGHT_REQUIRE_PG=1 (set in CI) makes the run fail, rather than quietly
// fall back to PGlite, when no Postgres URL is set.
//
// Non-owner mode (the deployed shape, P1-17): also set
//
//   ROLEWRIGHT_TEST_OWNER_URL=postgres://<owner login>:<pw>@host:port/postgres
//
// Each test database is then owned by that login and migrated through it
// (migrateDatabase, as `npm run db:migrate` does), and every test runs through
// ROLEWRIGHT_TEST_DATABASE_URL as a login that owns nothing and starts without
// running any DDL (createDb with migrate: false, which runs the role check).
// Statements a test needs as the owner (DDL) go through the owner URL.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb, migrateDatabase } from "../src/lib/db/index.mjs";
import { UnsafeEnvironmentError } from "../src/lib/server/env-guard.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { emptyFacts, normalizeFacts } from "../src/lib/facts.mjs";

const PG_URL = process.env.ROLEWRIGHT_TEST_DATABASE_URL || "";
const PG_ADMIN_URL = process.env.ROLEWRIGHT_TEST_ADMIN_URL || PG_URL;
const PG = Boolean(PG_URL);
const REQUIRE_PG = process.env.ROLEWRIGHT_REQUIRE_PG === "1";
const OWNER_URL = process.env.ROLEWRIGHT_TEST_OWNER_URL || "";
const NON_OWNER = PG && Boolean(OWNER_URL);
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
const createdRoles = [];
const databaseNames = new WeakMap();

/** The same server URL pointed at another database. */
function inDatabase(base, name) {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

async function freshDb() {
  let db;
  if (PG) {
    const name = `rw_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const owner = decodeURIComponent(new URL(NON_OWNER ? OWNER_URL : PG_URL).username);
    await adminQuery(`CREATE DATABASE ${quoteIdent(name)} OWNER ${quoteIdent(owner)}`);
    createdDatabases.push(name);
    if (NON_OWNER) await migrateDatabase({ connectionString: inDatabase(OWNER_URL, name) });
    db = await createDb({ connectionString: inDatabase(PG_URL, name), migrate: !NON_OWNER });
    databaseNames.set(db, name);
  } else {
    db = await createDb();
  }
  open.push(db);
  return db;
}

/** Run a statement as the tables' owner: the owner login in non-owner mode, else the app's own connection. */
async function asOwner(d, sql) {
  if (!NON_OWNER) return d.system.query(sql);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: inDatabase(OWNER_URL, databaseNames.get(d)) });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

/** Apply the schema again, the way this mode applies it. */
const reapplySchema = (d) => (NON_OWNER
  ? migrateDatabase({ connectionString: inDatabase(OWNER_URL, databaseNames.get(d)) })
  : d.applySchema());

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
  for (const role of createdRoles) await adminQuery(`DROP ROLE IF EXISTS ${quoteIdent(role)}`);
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

  await asOwner(leaky, "DROP POLICY jobs_isolation ON jobs");
  await asOwner(leaky, "CREATE POLICY jobs_isolation ON jobs USING (true) WITH CHECK (true)");
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
  await reapplySchema(again);
  await reapplySchema(again);
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

// ---- real-Postgres requirement ------------------------------------------------

test("ROLEWRIGHT_REQUIRE_PG=1 fails the run when there is no Postgres to test against", () => {
  if (!REQUIRE_PG) return;
  assert.ok(PG, "ROLEWRIGHT_REQUIRE_PG=1 but ROLEWRIGHT_TEST_DATABASE_URL is not set: refusing to fall back to PGlite");
  assert.equal(db.driver, "pg");
});

test("on Postgres the login is neither a superuser nor able to bypass row-level security", { skip: !PG && "PGlite always runs as a superuser" }, async () => {
  const { rows } = await db.system.query(
    "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user");
  assert.deepEqual(rows[0], { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
  const app = (await db.system.query(
    "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'rolewright_app'")).rows[0];
  assert.deepEqual(app, { rolsuper: false, rolbypassrls: false, rolcanlogin: false });
});

// ---- the start-up role check and the owner split (P1-17) ------------------------

test("ROLEWRIGHT_TEST_OWNER_URL needs ROLEWRIGHT_TEST_DATABASE_URL too", () => {
  assert.ok(!OWNER_URL || PG, "ROLEWRIGHT_TEST_OWNER_URL is set but ROLEWRIGHT_TEST_DATABASE_URL is not: the non-owner leg would silently run on PGlite");
  if (REQUIRE_PG && OWNER_URL) assert.equal(NON_OWNER, true);
});

test("a deployed host is refused before any DDL if asked to migrate in the app", async () => {
  const saved = process.env.K_SERVICE;
  process.env.K_SERVICE = "web";
  try {
    // Port 1 on loopback: nothing listens, so a connection attempt would fail with ECONNREFUSED instead.
    await assert.rejects(
      createDb({ connectionString: "postgres://nobody@127.0.0.1:1/none", migrate: true }),
      (e) => e instanceof UnsafeEnvironmentError && /db:migrate/.test(e.message),
    );
  } finally {
    if (saved === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = saved;
  }
});

const ownedRelations = async (d) => (await d.system.query(`
  SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND pg_has_role(current_user, c.relowner, 'MEMBER')`)).rows[0].n;

test("the login's ownership matches the mode; as a non-owner it cannot change any table's security", { skip: !PG && "PGlite always runs as a superuser" }, async () => {
  // The app role never inherits the system role, so a user scope cannot reach the identity tables.
  const { rows: [m] } = await db.system.query("SELECT pg_has_role('rolewright_app', 'rolewright_system', 'MEMBER') AS m");
  assert.equal(m.m, false);
  const name = databaseNames.get(db);
  if (NON_OWNER) {
    assert.equal(await ownedRelations(db), 0, "the app login owns a relation");
    await assert.rejects(db.system.query("DROP POLICY jobs_isolation ON jobs"), /must be owner/);
    await assert.rejects(db.system.query("ALTER TABLE jobs NO FORCE ROW LEVEL SECURITY"), /must be owner/);
    await assert.rejects(db.system.query("ALTER TABLE jobs DISABLE ROW LEVEL SECURITY"), /must be owner/);
    await assert.rejects(db.system.query("ALTER TABLE users ENABLE ROW LEVEL SECURITY"), /must be owner/);
    await assert.rejects(db.system.query("CREATE TABLE planted (x int)"), /permission denied/);
    await assert.rejects(db.applySchema(), /migrat/);
    // The identity tables are reached through rolewright_system, not ownership.
    const { rows: [u] } = await db.system.query("SELECT count(*)::int AS n FROM users");
    assert.ok(u.n >= 1);
  } else {
    assert.ok(await ownedRelations(db) > 0, "owner mode: the login owns the tables it migrated");
    // The same login is refused when it starts as a deployed host would, without migrating.
    await assert.rejects(
      createDb({ connectionString: inDatabase(PG_URL, name), migrate: false }),
      (e) => e instanceof UnsafeEnvironmentError && /owns/.test(e.message) && /jobs/.test(e.message),
    );
  }
});

/** Wait until no session of `role` is left on the server (the refused pool was closed). */
async function sessionsOf(role) {
  for (let i = 0; i < 40; i++) {
    const { rows: [r] } = await adminQuery(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = '${role}'`);
    if (r.n === 0) return 0;
    await pause(50);
  }
  return (await adminQuery(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = '${role}'`)).rows[0].n;
}

test("a login with BYPASSRLS, or a superuser, is refused at start; the same login without BYPASSRLS starts", { skip: !PG && "needs a real Postgres server and its admin login" }, async () => {
  const name = databaseNames.get(db);
  const role = `rw_bypass_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const password = crypto.randomUUID();
  createdRoles.push(role);
  await adminQuery(`CREATE ROLE ${quoteIdent(role)} LOGIN BYPASSRLS PASSWORD '${password}'`);
  await adminQuery(`GRANT rolewright_app, rolewright_system TO ${quoteIdent(role)}`);
  const url = new URL(inDatabase(PG_URL, name));
  url.username = role;
  url.password = password;

  await assert.rejects(createDb({ connectionString: url.toString(), migrate: false }), (e) => {
    assert.ok(e instanceof UnsafeEnvironmentError, String(e));
    assert.match(e.message, /BYPASSRLS/);
    assert.ok(!e.message.includes(password) && !e.message.includes(role), "the refusal names no credential");
    return true;
  });
  assert.equal(await sessionsOf(role), 0, "the refused pool was closed");

  // Positive control: nothing else about this login is wrong.
  await adminQuery(`ALTER ROLE ${quoteIdent(role)} NOBYPASSRLS`);
  const ok = await createDb({ connectionString: url.toString(), migrate: false });
  open.push(ok);
  assert.ok((await ok.system.query("SELECT count(*)::int AS n FROM users")).rows[0].n >= 1);

  // The admin login is a superuser: refused the same way.
  await assert.rejects(
    createDb({ connectionString: inDatabase(PG_ADMIN_URL, name), migrate: false }),
    (e) => e instanceof UnsafeEnvironmentError && /superuser/.test(e.message),
  );
});

test("a database that was never migrated is refused at start, naming the missing tables", { skip: !PG && "needs a real Postgres server" }, async () => {
  const name = `rw_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const owner = decodeURIComponent(new URL(NON_OWNER ? OWNER_URL : PG_URL).username);
  await adminQuery(`CREATE DATABASE ${quoteIdent(name)} OWNER ${quoteIdent(owner)}`);
  createdDatabases.push(name);
  await assert.rejects(
    createDb({ connectionString: inDatabase(PG_URL, name), migrate: false }),
    (e) => e instanceof UnsafeEnvironmentError && /users/.test(e.message) && /tailorings/.test(e.message),
  );
  // Nothing was created by the refused start.
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: inDatabase(PG_ADMIN_URL, name) });
  await client.connect();
  try {
    assert.equal((await client.query("SELECT to_regclass('public.users') AS t")).rows[0].t, null);
  } finally {
    await client.end();
  }
});

// ---- per-table isolation, structure and privileges -----------------------------

const USER_TABLES = ["resumes", "fact_bases", "jobs", "tailorings", "consents", "trial_counters"];
const IDENTITY_TABLES = ["users", "accounts", "verification_tokens"];
const newId = () => crypto.randomUUID();

/** One row per user-data table for `user`, written inside that user's own scope. Returns the ids. */
async function seedUser(d, user) {
  const ids = { resume: newId(), job: newId(), tailoring: newId(), consent: newId() };
  await d.withUser(user, async (tx) => {
    await tx.query("INSERT INTO resumes (id, user_id, filename, raw_text) VALUES ($1, $2, 'f.pdf', 'text')", [ids.resume, user]);
    await tx.query("INSERT INTO fact_bases (user_id, facts) VALUES ($1, '{\"marker\":\"original\"}'::jsonb)", [user]);
    await tx.query("INSERT INTO jobs (id, user_id, title) VALUES ($1, $2, 'original')", [ids.job, user]);
    await tx.query(
      "INSERT INTO tailorings (id, user_id, job_id, suggestions) VALUES ($1, $2, $3, '[]'::jsonb)", [ids.tailoring, user, ids.job]);
    await tx.query("INSERT INTO consents (id, user_id, notice_version, purpose) VALUES ($1, $2, 'v1', 'ai_processing')", [ids.consent, user]);
    await tx.query("INSERT INTO trial_counters (user_id, tailorings_used) VALUES ($1, 1)", [user]);
  });
  return ids;
}

/** Counts rows of a table for a user while bypassing row-level security (a superuser connection). */
async function rawCount(d, table, userId) {
  const sql = `SELECT count(*)::int AS n FROM ${table} WHERE ${table === "users" ? "id" : "user_id"} = $1`;
  if (!PG) return (await d.system.query(sql, [userId])).rows[0].n;
  const { default: pg } = await import("pg");
  const url = new URL(PG_ADMIN_URL);
  url.pathname = `/${databaseNames.get(d)}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return (await client.query(sql, [userId])).rows[0].n;
  } finally {
    await client.end();
  }
}

async function everyRawCount(d, userId) {
  const out = {};
  for (const t of [...USER_TABLES, "accounts"]) out[t] = await rawCount(d, t, userId);
  out.users = await rawCount(d, "users", userId);
  return out;
}

test("per table, B's scope cannot select, update or delete A's rows, nor insert one with A's user_id", async () => {
  const d = await freshDb();
  const a = (await repo.upsertUserByEmail(d, { email: "iso-a@example.com" })).id;
  const b = (await repo.upsertUserByEmail(d, { email: "iso-b@example.com" })).id;
  const ids = await seedUser(d, a);
  await seedUser(d, b);
  const insertAs = (table, owner, id, job) => ({
    resumes: [`INSERT INTO resumes (id, user_id) VALUES ($1, $2)`, [id, owner]],
    fact_bases: [`INSERT INTO fact_bases (user_id, facts) VALUES ($1, '{}'::jsonb)`, [owner]],
    jobs: [`INSERT INTO jobs (id, user_id) VALUES ($1, $2)`, [id, owner]],
    tailorings: [`INSERT INTO tailorings (id, user_id, job_id, suggestions) VALUES ($1, $2, $3, '[]'::jsonb)`, [id, owner, job]],
    consents: [`INSERT INTO consents (id, user_id, notice_version, purpose) VALUES ($1, $2, 'v2', 'x')`, [id, owner]],
    trial_counters: [`INSERT INTO trial_counters (user_id) VALUES ($1)`, [owner]],
  })[table];
  // Each statement runs in its own scope: a refused one aborts its transaction.
  const inB = (sql, params = []) => d.withUser(b, async (tx) => (await tx.query(sql, params)).rows);
  const aRowKey = { resumes: ids.resume, fact_bases: a, jobs: ids.job, tailorings: ids.tailoring, consents: ids.consent, trial_counters: a };
  const keyCol = { resumes: "id", fact_bases: "user_id", jobs: "id", tailorings: "id", consents: "id", trial_counters: "user_id" };
  const setClause = { resumes: "filename = 'hijacked'", fact_bases: "facts = '{}'::jsonb", jobs: "title = 'hijacked'", tailorings: "provider = 'hijacked'", consents: "purpose = 'hijacked'", trial_counters: "tailorings_used = 0" };

  for (const table of USER_TABLES) {
    const where = `${keyCol[table]} = $1`;
    assert.equal((await inB(`SELECT 1 FROM ${table} WHERE ${where}`, [aRowKey[table]])).length, 0, `${table}: select by A's key`);
    assert.deepEqual((await inB(`SELECT user_id FROM ${table}`)).map((r) => r.user_id), [b], `${table}: scan shows only B`);

    if (table === "consents") {
      // The app role is append-only here: it has no UPDATE or DELETE at all.
      await assert.rejects(inB(`UPDATE ${table} SET ${setClause[table]} WHERE ${where}`, [aRowKey[table]]), /permission denied/, `${table}: update`);
      await assert.rejects(inB(`DELETE FROM ${table} WHERE ${where}`, [aRowKey[table]]), /permission denied/, `${table}: delete`);
    } else {
      assert.equal((await inB(`UPDATE ${table} SET ${setClause[table]} WHERE ${where} RETURNING 1`, [aRowKey[table]])).length, 0, `${table}: update touched A's row`);
      if (table === "trial_counters") {
        // The app role may not delete counters (an account's counter goes only with the account).
        await assert.rejects(inB(`DELETE FROM ${table} WHERE ${where}`, [aRowKey[table]]), /permission denied/, `${table}: delete`);
      } else {
        assert.equal((await inB(`DELETE FROM ${table} WHERE ${where} RETURNING 1`, [aRowKey[table]])).length, 0, `${table}: delete touched A's row`);
      }
      assert.deepEqual(
        (await inB(`UPDATE ${table} SET ${setClause[table]} RETURNING user_id`)).map((r) => r.user_id), [b], `${table}: unqualified update`);
      await assert.rejects(inB(`UPDATE ${table} SET user_id = $1`, [a]), /row-level security/, `${table}: reassign to A`);
    }
    const [sql, params] = insertAs(table, a, newId(), ids.job);
    await assert.rejects(inB(sql, params), /row-level security/, `${table}: insert as A`);
  }

  // A's data is exactly as seeded, and A can still read it (positive control).
  assert.equal(await rawCount(d, "consents", a), 1);
  assert.equal(await rawCount(d, "resumes", a), 1);
  const inA = (sql) => d.withUser(a, async (tx) => (await tx.query(sql)).rows);
  assert.deepEqual((await inA("SELECT facts FROM fact_bases")).map((r) => r.facts), [{ marker: "original" }]);
  assert.deepEqual((await inA("SELECT title FROM jobs")).map((r) => r.title), ["original"]);
  assert.deepEqual((await inA("SELECT provider FROM tailorings")).map((r) => r.provider), [null]);
  assert.deepEqual((await inA("SELECT filename FROM resumes")).map((r) => r.filename), ["f.pdf"]);
  assert.deepEqual((await inA("SELECT purpose FROM consents")).map((r) => r.purpose), ["ai_processing"]);
});

/** Tables in the public schema with a user_id column but no forced row-level security or no policy. */
async function unprotectedUserTables(d) {
  const { rows } = await d.system.query(`
    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped)
      AND c.relname <> 'accounts'
    ORDER BY c.relname`);
  return { all: rows.map((r) => r.name), bad: rows.filter((r) => !r.enabled || !r.forced || r.policies < 1).map((r) => r.name) };
}

test("every table with a user_id column (except accounts) has forced row-level security and a policy", async () => {
  const { all, bad } = await unprotectedUserTables(db);
  assert.deepEqual(all, [...USER_TABLES].sort(), "the set of user-data tables changed: update USER_TABLES and the per-table isolation test");
  assert.deepEqual(bad, [], `tables without enabled+forced RLS and a policy: ${bad}`);
});

test("negative control: the structural check flags a new user table that skips row-level security", async () => {
  const d = await freshDb();
  await asOwner(d, "CREATE TABLE notes (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users (id))");
  assert.deepEqual((await unprotectedUserTables(d)).bad, ["notes"]);
  await asOwner(d, "ALTER TABLE notes ENABLE ROW LEVEL SECURITY");
  assert.deepEqual((await unprotectedUserTables(d)).bad, ["notes"], "enabled but not forced and without a policy is still flagged");
  await asOwner(d, "ALTER TABLE notes FORCE ROW LEVEL SECURITY");
  assert.deepEqual((await unprotectedUserTables(d)).bad, ["notes"], "forced but without a policy is still flagged");
  await asOwner(d, "CREATE POLICY notes_isolation ON notes USING (user_id = current_setting('app.user_id')::uuid)");
  assert.deepEqual((await unprotectedUserTables(d)).bad, []);
});

test("rolewright_app has no privilege at all on users, accounts or verification_tokens", async () => {
  for (const t of IDENTITY_TABLES) {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const { rows } = await db.system.query("SELECT has_table_privilege('rolewright_app', $1, $2) AS ok", [t, priv]);
      assert.equal(rows[0].ok, false, `rolewright_app has ${priv} on ${t}`);
    }
    const { rows } = await db.system.query(
      "SELECT has_any_column_privilege('rolewright_app', $1, 'SELECT, INSERT, UPDATE, REFERENCES') AS ok", [t]);
    assert.equal(rows[0].ok, false, `rolewright_app has a column privilege on ${t}`);
    await assert.rejects(db.withUser(A, (tx) => tx.query(`SELECT 1 FROM ${t}`)), /permission denied/);
    await assert.rejects(db.withUser(A, (tx) => tx.query(`DELETE FROM ${t}`)), /permission denied/);
  }
});

test("rolewright_app holds exactly the intended privileges on the user-data tables", async () => {
  const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
  for (const t of USER_TABLES) {
    const granted = [];
    for (const priv of privs) {
      const { rows } = await db.system.query("SELECT has_table_privilege('rolewright_app', $1, $2) AS ok", [t, priv]);
      if (rows[0].ok) granted.push(priv);
    }
    const expected = t === "consents" ? ["SELECT", "INSERT"] : t === "trial_counters" ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT", "INSERT", "UPDATE", "DELETE"];
    assert.deepEqual(granted, expected, `${t}`);
  }
});

// ---- account deletion and the inactivity purge, as the non-superuser login ----

/** Everything a user can own: the five user tables, a linked account and an email-link token. */
async function seedEverything(d, email) {
  const user = (await repo.upsertUserByEmail(d, { email })).id;
  await seedUser(d, user);
  await repo.linkAccount(d, { userId: user, provider: "google", providerAccountId: `g-${user}` });
  await repo.createVerificationToken(d, { identifier: email, token: `tok-${user}`, expires: new Date(Date.now() + 3_600_000) });
  return user;
}
const tokenCount = async (d, email) =>
  (await d.system.query("SELECT count(*)::int AS n FROM verification_tokens WHERE identifier = $1", [email])).rows[0].n;
const ALL_ONE = { resumes: 1, fact_bases: 1, jobs: 1, tailorings: 1, consents: 1, trial_counters: 1, accounts: 1, users: 1 };
const ALL_ZERO = Object.fromEntries(Object.keys(ALL_ONE).map((k) => [k, 0]));

test("deleteUserData cascades through every table under forced RLS (checked on a connection that bypasses it)", async () => {
  const d = await freshDb();
  const a = await seedEverything(d, "del-a@example.com");
  const b = await seedEverything(d, "del-b@example.com");
  // The checking connection really does see rows (it is not just blind).
  assert.deepEqual(await everyRawCount(d, a), ALL_ONE);
  assert.deepEqual(await everyRawCount(d, b), ALL_ONE);

  assert.equal(await repo.deleteUserData(d, a), true);

  assert.deepEqual(await everyRawCount(d, a), ALL_ZERO, "rows of the deleted user remain");
  assert.equal(await tokenCount(d, "del-a@example.com"), 0);
  assert.deepEqual(await everyRawCount(d, b), ALL_ONE, "the other user lost data");
  assert.equal(await tokenCount(d, "del-b@example.com"), 1);
  assert.equal(await repo.deleteUserData(d, a), false, "deleting again is a no-op");
});

test("purgeInactiveUsers cascades through every table under forced RLS and spares active users", async () => {
  const d = await freshDb();
  const stale = await seedEverything(d, "old@example.com");
  const active = await seedEverything(d, "new@example.com");
  const now = new Date("2026-11-19T00:00:00Z");
  await d.system.query("UPDATE users SET last_seen_at = $2 WHERE id = $1", [stale, "2025-11-18T00:00:00Z"]);
  await d.system.query("UPDATE users SET last_seen_at = $2 WHERE id = $1", [active, "2025-11-20T00:00:00Z"]);
  await repo.createVerificationToken(d, { identifier: "nobody@example.com", token: "expired", expires: new Date(Date.now() - 3_600_000) });

  assert.equal(await repo.purgeInactiveUsers(d, { now }), 1);

  assert.deepEqual(await everyRawCount(d, stale), ALL_ZERO);
  assert.equal(await tokenCount(d, "old@example.com"), 0);
  assert.equal(await tokenCount(d, "nobody@example.com"), 0, "an expired token is purged");
  assert.deepEqual(await everyRawCount(d, active), ALL_ONE);
  assert.equal(await tokenCount(d, "new@example.com"), 1);
  assert.equal(await repo.purgeInactiveUsers(d, { now }), 0);
});

// ---- row locks, observed directly ----------------------------------------------

test("changeTailoring holds row locks on the tailoring and the Fact Base while its callback runs", { skip: !PG && "PGlite runs one transaction at a time, so a second connection cannot probe a lock" }, async () => {
  const { d, u, t } = await reviewFixture();
  const probe = (sql, params) => d.withUser(u, (tx) => tx.query(sql, params));
  let tailoringBlocked = false;
  let factsBlocked = false;
  await repo.changeTailoring(d, u, t, async () => {
    await probe("SELECT 1 FROM tailorings WHERE id = $1 FOR UPDATE NOWAIT", [t]).catch((e) => { tailoringBlocked = e.code === "55P03"; });
    await probe("SELECT 1 FROM fact_bases WHERE user_id = $1 FOR UPDATE NOWAIT", [u]).catch((e) => { factsBlocked = e.code === "55P03"; });
    return {};
  });
  assert.ok(tailoringBlocked, "the tailoring row was not locked");
  assert.ok(factsBlocked, "the Fact Base row was not locked");
  await probe("SELECT 1 FROM tailorings WHERE id = $1 FOR UPDATE NOWAIT", [t]);
  await probe("SELECT 1 FROM fact_bases WHERE user_id = $1 FOR UPDATE NOWAIT", [u]);
});

test("changeFacts holds a row lock on the Fact Base while its callback runs, even for a first save", { skip: !PG && "PGlite runs one transaction at a time, so a second connection cannot probe a lock" }, async () => {
  const d = await freshDb();
  const u = (await repo.upsertUserByEmail(d, { email: "lock@example.com" })).id;
  let blocked = false;
  await repo.changeFacts(d, u, async (facts) => {
    // The first save's row is not yet committed, so a second connection cannot see it to lock it. Its own
    // insert of the same key has to wait for the first transaction, and gives up at the lock timeout.
    await d.withUser(u, async (tx) => {
      await tx.query("SET LOCAL lock_timeout = '200ms'");
      await tx.query("INSERT INTO fact_bases (user_id, facts) VALUES ($1, '{}'::jsonb) ON CONFLICT (user_id) DO NOTHING", [u]);
    }).catch((e) => { blocked = e.code === "55P03"; });
    return facts;
  });
  assert.ok(blocked, "the Fact Base row was not locked");
});

// ---- rate_events and account deletion / purge (P1-29) -------------------------

const rateRows = async (d, subject) =>
  (await d.system.query("SELECT count(*)::int AS n FROM rate_events WHERE subject = $1", [subject])).rows[0].n;

test("deleteUserData removes that user's id-subject rate_events rows, not another user's or a hashed subject's", async () => {
  const d = await freshDb();
  const a = await seedEverything(d, "rate-a@example.com");
  const b = await seedEverything(d, "rate-b@example.com");
  for (const [bucket, subject] of [["ai", a], ["export", a], ["ai", b], ["signInIp", "f".repeat(64)]]) {
    await d.system.query("INSERT INTO rate_events (bucket, subject) VALUES ($1, $2)", [bucket, subject]);
  }
  assert.equal(await repo.deleteUserData(d, a), true);
  assert.equal(await rateRows(d, a), 0);
  assert.equal(await rateRows(d, b), 1);
  assert.equal(await rateRows(d, "f".repeat(64)), 1);

  // An uppercase id still removes the id-keyed rows (the id is normalised to lower-case text).
  const c = await seedEverything(d, "rate-c@example.com");
  await d.system.query("INSERT INTO rate_events (bucket, subject) VALUES ('ai', $1)", [c]);
  assert.equal(await repo.deleteUserData(d, c.toUpperCase()), true);
  assert.equal(await rateRows(d, c), 0);
});

test("purgeInactiveUsers sweeps expired rate_events rows and keeps recent ones", async () => {
  const d = await freshDb();
  const now = new Date("2026-11-19T00:00:00Z");
  await d.system.query("INSERT INTO rate_events (bucket, subject, at) VALUES ('ai', 'purge-old', $1), ('trialIp', 'purge-old2', $2), ('ai', 'purge-new', $3)",
    ["2026-11-10T00:00:00Z", "2026-11-17T00:00:00Z", "2026-11-18T12:00:00Z"]);
  assert.equal(await repo.purgeInactiveUsers(d, { now }), 0);
  assert.equal(await rateRows(d, "purge-old"), 0);
  assert.equal(await rateRows(d, "purge-old2"), 0);
  assert.equal(await rateRows(d, "purge-new"), 1);
});

test("rolewright_app has no privilege on rate_events, and rolewright_system can delete from it", async () => {
  for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    const { rows } = await db.system.query("SELECT has_table_privilege('rolewright_app', 'rate_events', $1) AS ok", [priv]);
    assert.equal(rows[0].ok, false, `rolewright_app has ${priv} on rate_events`);
  }
  await assert.rejects(db.withUser(A, (tx) => tx.query("DELETE FROM rate_events")), /permission denied/);
});
