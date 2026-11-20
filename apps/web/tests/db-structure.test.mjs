// Every table in the public schema is either a user-data table protected by
// forced row-level security, or a system table the app role cannot touch
// (P1-17). Runs on the embedded database with the whole schema applied, so a
// table added by any later block is checked without editing this file.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import { SYSTEM_TABLES } from "../src/lib/db/schema.mjs";

const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const open = [];
after(async () => {
  for (const d of open) await d.close();
});
async function freshDb() {
  const d = await createDb();
  open.push(d);
  return d;
}

/** Every table in public, and why each one is unsafe (an empty list means it passes). */
async function structureProblems(d) {
  const { rows } = await d.system.query(`
    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped) AS has_user_id
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname`);
  const out = {};
  for (const r of rows) {
    const problems = [];
    if (SYSTEM_TABLES.includes(r.name)) {
      for (const priv of PRIVILEGES) {
        const { rows: [p] } = await d.system.query("SELECT has_table_privilege('rolewright_app', $1, $2) AS ok", [`public.${r.name}`, priv]);
        if (p.ok) problems.push(`rolewright_app has ${priv}`);
      }
      const { rows: [col] } = await d.system.query(
        "SELECT has_any_column_privilege('rolewright_app', $1, 'SELECT, INSERT, UPDATE, REFERENCES') AS ok", [`public.${r.name}`]);
      if (col.ok) problems.push("rolewright_app has a column privilege");
    } else {
      if (!r.enabled) problems.push("row-level security is not enabled");
      if (!r.forced) problems.push("row-level security is not forced");
      if (r.policies < 1) problems.push("no policy");
      if (!r.has_user_id) problems.push("no user_id column");
    }
    out[r.name] = problems;
  }
  return out;
}
const failing = (report) => Object.fromEntries(Object.entries(report).filter(([, p]) => p.length));

test("SYSTEM_TABLES names the identity tables and the rate-limit table", () => {
  assert.deepEqual(SYSTEM_TABLES, ["users", "accounts", "verification_tokens", "rate_events"]);
  assert.ok(Object.isFrozen(SYSTEM_TABLES), "nobody can add a table to the exemption list at runtime");
});

test("every table in public is a forced-RLS user table with a policy and user_id, or a system table rolewright_app cannot touch", async () => {
  const d = await freshDb();
  const report = await structureProblems(d);
  // The tables this check must at least see, so an empty catalog cannot pass it.
  for (const t of ["users", "accounts", "verification_tokens", "resumes", "fact_bases", "jobs", "tailorings", "consents"]) {
    assert.ok(t in report, `${t} is missing from the schema`);
  }
  assert.deepEqual(failing(report), {});
});

test("negative control: the check flags a user table without forced RLS, a policy or user_id, and a system table granted to the app", async () => {
  const d = await freshDb();
  await d.system.query("CREATE TABLE notes (id uuid PRIMARY KEY, owner uuid)");
  await d.system.query("GRANT SELECT ON verification_tokens TO rolewright_app");
  await d.system.query("ALTER TABLE jobs NO FORCE ROW LEVEL SECURITY");
  const bad = failing(await structureProblems(d));
  assert.deepEqual(bad, {
    jobs: ["row-level security is not forced"],
    notes: ["row-level security is not enabled", "row-level security is not forced", "no policy", "no user_id column"],
    verification_tokens: ["rolewright_app has SELECT", "rolewright_app has a column privilege"],
  });
});
