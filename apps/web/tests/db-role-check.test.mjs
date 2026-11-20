// The start-up role check (P1-17): the pure rules, and ROLE_QUERY run against a
// real catalog (PGlite) as roles with and without the dangerous attributes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_QUERY, roleProblems, tablesInSchema } from "../src/lib/db/role-check.mjs";
import { SCHEMA_SQL } from "../src/lib/db/schema.mjs";

const CLEAN = { rolsuper: false, rolbypassrls: false, memberOfApp: true, memberOfSystem: true, ownedUserTables: [] };

test("a clean login has no problems, deployed or not", () => {
  assert.deepEqual(roleProblems(CLEAN, { deployed: true }), []);
  assert.deepEqual(roleProblems(CLEAN, { deployed: false }), []);
});

test("a superuser login is refused, deployed or not", () => {
  for (const deployed of [true, false]) {
    const problems = roleProblems({ ...CLEAN, rolsuper: true }, { deployed });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /superuser/);
  }
});

test("a BYPASSRLS login is refused, deployed or not", () => {
  for (const deployed of [true, false]) {
    const problems = roleProblems({ ...CLEAN, rolbypassrls: true }, { deployed });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /BYPASSRLS/);
  }
});

test("a login that cannot switch to rolewright_app is refused, deployed or not", () => {
  for (const deployed of [true, false]) {
    const problems = roleProblems({ ...CLEAN, memberOfApp: false }, { deployed });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /rolewright_app/);
  }
});

test("when deployed, a login without rolewright_system is refused; off a deployed host it is not", () => {
  const problems = roleProblems({ ...CLEAN, memberOfSystem: false }, { deployed: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /rolewright_system/);
  assert.deepEqual(roleProblems({ ...CLEAN, memberOfSystem: false }, { deployed: false }), []);
});

test("when deployed, a login that owns a row-level-security table is refused and the tables are named", () => {
  const problems = roleProblems({ ...CLEAN, ownedUserTables: ["jobs", "resumes"] }, { deployed: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /owns/);
  assert.match(problems[0], /jobs, resumes/);
  // Owner mode (development, CI) migrates as the owner, so owning is expected there.
  assert.deepEqual(roleProblems({ ...CLEAN, ownedUserTables: ["jobs"] }, { deployed: false }), []);
});

test("every problem is reported at once, and a missing field counts as unsafe", () => {
  const all = roleProblems(
    { rolsuper: true, rolbypassrls: true, memberOfApp: false, memberOfSystem: false, ownedUserTables: ["jobs"] },
    { deployed: true },
  );
  assert.equal(all.length, 5);
  // A row the query did not fill in (no such role, a driver surprise) fails closed.
  assert.equal(roleProblems({}, { deployed: true }).length, 5);
  assert.equal(roleProblems(undefined, { deployed: true }).length, 5);
  assert.equal(roleProblems({ ...CLEAN, rolsuper: null }, { deployed: false }).length, 1);
});

test("tablesInSchema lists every CREATE TABLE in the schema, including tables appended later", () => {
  const names = tablesInSchema(SCHEMA_SQL);
  for (const t of ["users", "accounts", "verification_tokens", "resumes", "fact_bases", "jobs", "tailorings", "consents"]) {
    assert.ok(names.includes(t), t);
  }
  assert.deepEqual(
    tablesInSchema("CREATE TABLE IF NOT EXISTS rate_events (id bigserial);\n  create table if not exists \"Odd\" (x int);\nCREATE TABLE plain (x int);"),
    ["rate_events", "Odd", "plain"],
  );
  assert.equal(new Set(names).size, names.length, "no duplicates");
});

// ---- ROLE_QUERY against a real catalog -------------------------------------------

async function pglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.waitReady;
  return pg;
}
const roleRow = async (pg) => (await pg.query(ROLE_QUERY)).rows[0];

test("ROLE_QUERY does not throw on a database where the roles do not exist yet", async () => {
  const pg = await pglite();
  try {
    const row = await roleRow(pg);
    assert.equal(row.rolsuper, true, "PGlite connects as a superuser");
    assert.equal(row.memberOfApp, false);
    assert.equal(row.memberOfSystem, false);
    assert.deepEqual(row.ownedUserTables, []);
  } finally {
    await pg.close();
  }
});

test("ROLE_QUERY reports BYPASSRLS, membership and ownership (direct and through a role) for current_user", async () => {
  const pg = await pglite();
  try {
    await pg.exec(SCHEMA_SQL);
    await pg.exec(`
      CREATE ROLE probe NOLOGIN BYPASSRLS;
      CREATE ROLE owner_group NOLOGIN;
      CREATE TABLE plain_table (x int);`);

    await pg.exec("SET ROLE probe");
    let row = await roleRow(pg);
    await pg.exec("RESET ROLE");
    assert.deepEqual(row, { rolsuper: false, rolbypassrls: true, memberOfApp: false, memberOfSystem: false, ownedUserTables: [] });

    await pg.exec(`
      ALTER ROLE probe NOBYPASSRLS;
      GRANT rolewright_app, rolewright_system TO probe;
      ALTER TABLE jobs OWNER TO probe;
      ALTER TABLE resumes OWNER TO owner_group;
      ALTER TABLE plain_table OWNER TO probe;`);
    await pg.exec("SET ROLE probe");
    row = await roleRow(pg);
    await pg.exec("RESET ROLE");
    assert.deepEqual(row, { rolsuper: false, rolbypassrls: false, memberOfApp: true, memberOfSystem: true, ownedUserTables: ["jobs"] },
      "a table with neither row-level security nor a user_id column is not counted");
    assert.equal(roleProblems(row, { deployed: true }).length, 1);

    // Membership in a role that owns a table gives the owner's rights, so it counts as owning.
    await pg.exec("GRANT owner_group TO probe");
    await pg.exec("SET ROLE probe");
    row = await roleRow(pg);
    await pg.exec("RESET ROLE");
    assert.deepEqual(row.ownedUserTables, ["jobs", "resumes"]);

    // A user-data table whose row-level security was switched off still counts (it has user_id).
    await pg.exec("ALTER TABLE jobs DISABLE ROW LEVEL SECURITY");
    await pg.exec("SET ROLE probe");
    row = await roleRow(pg);
    await pg.exec("RESET ROLE");
    assert.deepEqual(row.ownedUserTables, ["jobs", "resumes"]);
  } finally {
    await pg.close();
  }
});
