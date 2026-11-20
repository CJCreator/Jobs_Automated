// Database access: one small interface, two drivers (embedded PGlite for
// development and tests, `pg` for production).
//
//   db.system.query(sql, params)   identity tables only (users, accounts, tokens)
//   db.withUser(userId, fn)        everything else, inside a row-level-security scope
//   db.close()
//
// The isolation guarantee lives in withUser: it opens a transaction, drops to the
// non-superuser role `rolewright_app` and records the user id for the policies.
// Querying user data any other way would run as a superuser and see every row.
//
// Migrations and the start-up role check (P1-17, ADR 0009). On a deployed host
// the app runs no DDL: the schema is applied beforehand by `npm run db:migrate`
// as the owner login (migrateDatabase), and the app connects as a login that
// owns nothing. At start it checks that login (role-check.mjs) and that every
// table exists, and refuses to serve otherwise. Off a deployed host (development,
// CI owner mode) the app still applies the schema itself, then runs the checks
// that do not depend on ownership.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { SCHEMA_SQL } from "./schema.mjs";
import { ROLE_QUERY, roleProblems, tablesInSchema } from "./role-check.mjs";
import { UnsafeEnvironmentError, isDeployed } from "../server/env-guard.mjs";

const APP_ROLE = "rolewright_app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Arbitrary constant so two app processes starting at once do not run DDL concurrently.
const SCHEMA_LOCK_KEY = 727274;

const loadSchema = async () => SCHEMA_SQL;

/** Every table the app needs: the ones the schema creates, so a block appended later is included. */
const REQUIRED_TABLES = tablesInSchema(SCHEMA_SQL);
const MISSING_TABLES = `SELECT t AS name FROM unnest($1::text[]) AS t
  WHERE to_regclass('public.' || quote_ident(t)) IS NULL ORDER BY t`;

/** Apply the schema on one connection, holding the advisory lock so two starts never run DDL at once. */
async function applySchemaOn(client) {
  await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_KEY]);
  try {
    await client.query(await loadSchema());
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_KEY]);
  }
}

/**
 * Apply the schema as the owner login and disconnect (`npm run db:migrate`).
 * Runs no role check: the owner is meant to own the tables.
 * @param {{ connectionString: string }} opts
 */
export async function migrateDatabase({ connectionString }) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  // A broken connection after connect() is reported by the query that hits it.
  client.on("error", () => {});
  await client.connect();
  try {
    await applySchemaOn(client);
  } finally {
    await client.end();
  }
}

/**
 * The problems with the connecting login and the schema, in plain words.
 * Never includes the connection string or the login's name.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} q
 * @param {{ deployed: boolean }} opts
 */
async function startupProblems(q, { deployed }) {
  const { rows: [role] } = await q.query(ROLE_QUERY);
  const problems = roleProblems(role, { deployed });
  const { rows: missing } = await q.query(MISSING_TABLES, [REQUIRED_TABLES]);
  if (missing.length) {
    problems.push(`The database has not been migrated: these tables are missing: ${missing.map((r) => r.name).join(", ")}. Run \`npm run db:migrate\` with the owner login, then start the app.`);
  }
  return problems;
}

/** Throws before any database call if the id is not a UUID. */
function assertUserId(userId) {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    throw new TypeError("withUser needs a user id in UUID form.");
  }
}

// The role name is a constant, never user input, because SET ROLE takes no parameters.
// The user id is always a bound parameter.
const ENTER_SCOPE = `SET LOCAL ROLE ${APP_ROLE}`;
const SET_USER = "SELECT set_config('app.user_id', $1, true)";

// PGlite always applies the schema and skips the role check: it runs as a
// superuser by design (single-user embedded database for development and
// tests), and assertDbEnv keeps it off a deployed host.
async function createPgliteDb({ dataDir } = {}) {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) await mkdir(path.dirname(dataDir), { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const applySchema = async () => {
    await pg.exec(await loadSchema());
  };
  await applySchema();

  return {
    driver: "pglite",
    applySchema,
    system: { query: async (sql, params) => ({ rows: (await pg.query(sql, params)).rows }) },
    async withUser(userId, fn) {
      assertUserId(userId);
      // PGlite rolls back automatically when the callback throws.
      return pg.transaction(async (tx) => {
        await tx.query(ENTER_SCOPE);
        await tx.query(SET_USER, [userId]);
        return fn({ query: async (sql, params) => ({ rows: (await tx.query(sql, params)).rows }) });
      });
    },
    close: () => pg.close(),
  };
}

/**
 * @param {{ connectionString: string, migrate?: boolean }} opts migrate defaults
 *   to true off a deployed host and false on one. With migrate false no DDL runs
 *   and the login must own nothing.
 */
async function createPgDb({ connectionString, migrate = !isDeployed(process.env) }) {
  if (migrate && isDeployed(process.env)) {
    // The deployed app login must own nothing, so it must never run DDL.
    throw new UnsafeEnvironmentError("Rolewright does not apply the schema itself on a deployed host. Run `npm run db:migrate` with the owner login before deploying.");
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString });

  // Swallow idle-client errors; the pool replaces the client itself.
  pool.on("error", () => {});

  const applySchema = migrate
    ? async () => {
      const client = await pool.connect();
      let broken = false;
      try {
        await applySchemaOn(client);
      } catch (err) {
        broken = true;
        throw err;
      } finally {
        client.release(broken ? true : undefined);
      }
    }
    : async () => {
      throw new Error("This connection does not run migrations: apply the schema with `npm run db:migrate` as the owner login.");
    };

  try {
    if (migrate) await applySchema();
    // Without a migration the app is in the deployed shape, so the ownership rules apply.
    const problems = await startupProblems(pool, { deployed: !migrate });
    if (problems.length) {
      throw new UnsafeEnvironmentError(`Rolewright will not use this database: ${problems.join(" ")}`);
    }
  } catch (err) {
    // A refused or failed start must not leave connections open.
    await pool.end().catch(() => {});
    throw err;
  }

  return {
    driver: "pg",
    applySchema,
    system: { query: async (sql, params) => ({ rows: (await pool.query(sql, params)).rows }) },
    async withUser(userId, fn) {
      assertUserId(userId);
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query("BEGIN");
        await client.query(ENTER_SCOPE);
        await client.query(SET_USER, [userId]);
        const result = await fn({ query: async (sql, params) => ({ rows: (await client.query(sql, params)).rows }) });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        // A refused action (a 409 thrown by the callback) lands here too; after a
        // clean ROLLBACK the role and user id are gone (both were LOCAL), so the
        // connection is safe to reuse.
        try {
          await client.query("ROLLBACK");
        } catch {
          // Rollback itself failed: the connection may still be inside the
          // scope, so it is destroyed below and never returns to the pool.
          broken = true;
        }
        throw err;
      } finally {
        // Passing an error to release() discards the connection instead of reusing it.
        client.release(broken ? true : undefined);
      }
    },
    close: () => pool.end(),
  };
}

/**
 * A fresh, non-singleton database.
 * @param {{ dataDir?: string, connectionString?: string, migrate?: boolean }} [opts]
 *   with neither dataDir nor connectionString set, an in-memory PGlite is used
 *   (tests). migrate applies to Postgres only (see createPgDb).
 */
export async function createDb({ dataDir, connectionString, migrate } = {}) {
  return connectionString ? createPgDb({ connectionString, migrate }) : createPgliteDb({ dataDir });
}

const KEY = Symbol.for("rolewright.db");
const WARNED = Symbol.for("rolewright.db.embeddedWarned");

/**
 * Refuse the embedded database on a deployed host; say so once when a
 * production-mode server that is not deployed uses it.
 * @param {Record<string, string | undefined>} env
 * @param {string} dataDir the embedded database directory that would be used
 * @param {(message: string) => void} [warn]
 */
export function assertDbEnv(env, dataDir, warn = console.warn) {
  if ((env.DATABASE_URL ?? "").trim()) return;
  if (isDeployed(env)) {
    throw new UnsafeEnvironmentError(
      "DATABASE_URL is not set on a deployed host, so Rolewright will not open the embedded database. Set DATABASE_URL to your Postgres connection string and restart.",
    );
  }
  if (env.NODE_ENV === "production" && !globalThis[WARNED]) {
    globalThis[WARNED] = true;
    warn(`DATABASE_URL is not set: using the embedded database in ${dataDir}. That is for development and single-machine trials only.`);
  }
}

/**
 * The process-wide database. Held on globalThis so Next.js dev hot-reload does
 * not open the PGlite directory a second time. The promise is stored, not the
 * instance, so concurrent first calls share one start-up.
 */
export function getDb() {
  if (!globalThis[KEY]) {
    const url = process.env.DATABASE_URL;
    // ROLEWRIGHT_DATA_DIR lets a test run point the embedded database at a temp directory.
    const dataDir = process.env.ROLEWRIGHT_DATA_DIR
      ? path.resolve(process.env.ROLEWRIGHT_DATA_DIR)
      : path.join(process.cwd(), ".data", "pglite");
    assertDbEnv(process.env, dataDir);
    const opening = url ? createDb({ connectionString: url }) : createDb({ dataDir });
    globalThis[KEY] = opening;
    // A failed start must not be cached forever.
    opening.catch(() => {
      if (globalThis[KEY] === opening) delete globalThis[KEY];
    });
  }
  return globalThis[KEY];
}
