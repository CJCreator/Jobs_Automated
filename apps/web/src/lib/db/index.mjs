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

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { SCHEMA_SQL } from "./schema.mjs";

const APP_ROLE = "rolewright_app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Arbitrary constant so two app processes starting at once do not run DDL concurrently.
const SCHEMA_LOCK_KEY = 727274;

const loadSchema = async () => SCHEMA_SQL;

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

async function createPgDb({ connectionString }) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString });

  // Swallow idle-client errors; the pool replaces the client itself.
  pool.on("error", () => {});

  const applySchema = async () => {
    const lock = await pool.connect();
    try {
      await lock.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_KEY]);
      await lock.query(await loadSchema());
    } finally {
      try {
        await lock.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_KEY]);
      } finally {
        lock.release();
      }
    }
  };
  await applySchema();

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
 * @param {{ dataDir?: string, connectionString?: string }} [opts] with neither
 *   set, an in-memory PGlite is used (tests).
 */
export async function createDb({ dataDir, connectionString } = {}) {
  return connectionString ? createPgDb({ connectionString }) : createPgliteDb({ dataDir });
}

const KEY = Symbol.for("rolewright.db");

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
    const opening = url ? createDb({ connectionString: url }) : createDb({ dataDir });
    globalThis[KEY] = opening;
    // A failed start must not be cached forever.
    opening.catch(() => {
      if (globalThis[KEY] === opening) delete globalThis[KEY];
    });
  }
  return globalThis[KEY];
}
