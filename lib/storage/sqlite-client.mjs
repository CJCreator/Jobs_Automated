/**
 * lib/storage/sqlite-client.mjs — Embedded SQLite client for high-performance indexed queries.
 *
 * Utilizes Node.js built-in node:sqlite (DatabaseSync) with WAL mode.
 * Serves as the local query accelerator behind the bi-directional Markdown projection engine.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCareerOpsRoot } from '../../path-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_FILE = join(__dirname, 'schema.sql');

let clientInstance = null;
let currentDbPath = null;

export class SqliteClient {
  /**
   * @param {string} dbPath - File path to the SQLite database, or ':memory:'.
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  /**
   * Initialize tables, pragmas, and indexes from schema.sql.
   */
  initSchema() {
    try {
      // The database is a rebuildable cache. An applications table created before
      // the row_id surrogate key cannot be migrated in place, so drop it; the next
      // sync repopulates it from applications.md.
      const cols = this.db.prepare('PRAGMA table_info(applications);').all();
      if (cols.length > 0 && !cols.some((c) => c.name === 'row_id')) {
        this.db.exec('DROP TABLE applications;');
      }
      const schemaSql = readFileSync(SCHEMA_FILE, 'utf-8');
      this.db.exec(schemaSql);
    } catch (err) {
      throw new Error(`Failed to initialize SQLite schema from ${SCHEMA_FILE}: ${err.message}`);
    }
  }

  /**
   * Execute a query returning all matching rows.
   *
   * @param {string} sql
   * @param {any[]} params
   * @returns {object[]}
   */
  queryAll(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Execute a query returning the first matching row or undefined.
   *
   * @param {string} sql
   * @param {any[]} params
   * @returns {object|undefined}
   */
  queryOne(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  /**
   * Execute a mutating statement (INSERT, UPDATE, DELETE).
   *
   * @param {string} sql
   * @param {any[]} params
   * @returns {object} { changes, lastInsertRowid }
   */
  execute(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  /**
   * Execute a function inside an immediate transaction.
   *
   * @param {Function} fn
   * @returns {any}
   */
  withTransaction(fn) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const res = fn(this);
      this.db.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Close the database connection.
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore already closed
      }
    }
  }
}

/**
 * Get or create the shared SqliteClient singleton.
 *
 * @param {object} [options]
 * @param {string} [options.dbPath] - Explicit path, or defaults to <DATA_ROOT>/data/career-ops.sqlite
 * @param {boolean} [options.fresh] - Force new connection
 * @returns {SqliteClient}
 */
export function getSqliteClient(options = {}) {
  const targetPath = options.dbPath ?? join(getCareerOpsRoot(), 'data/career-ops.sqlite');
  if (!clientInstance || options.fresh || currentDbPath !== targetPath) {
    if (clientInstance) {
      clientInstance.close();
    }
    clientInstance = new SqliteClient(targetPath);
    currentDbPath = targetPath;
  }
  return clientInstance;
}

/**
 * Close and reset the current singleton instance.
 */
export function closeSqliteClient() {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
    currentDbPath = null;
  }
}

