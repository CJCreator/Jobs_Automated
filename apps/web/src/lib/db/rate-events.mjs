// Shared rate-limit counts in Postgres (system table rate_events, through db.system).
// The subject is a user id or a keyed HMAC-SHA-256 hex of an IP or email address, never a raw one.
//
// db.system has no transaction and runs one statement per call, so advisory locks are
// not available here. Instead each take inserts its event first (autocommit), then
// counts the window in one statement and removes its own event if the window is over.
// Every allowed take counted all events committed before it, so no more than `max`
// are ever allowed. Takes racing at the limit may both be refused; that fails closed.

import { LIMITS, decide } from "../server/rate-limit-core.mjs";

// Rows older than the longest window can never count toward any limit. They are
// swept so that rows for a subject that never returns do not stay forever.
export const LONGEST_WINDOW_MS = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));
const SWEEP_EVERY_MS = 10 * 60_000; // opportunistic sweep: at most once per db handle per 10 minutes
const SWEEP_BATCH = 500;
const lastSweep = new WeakMap();

/**
 * Deletes rate_events rows older than the longest window, through db.system (the table is
 * system-owned). Bounded: at most `batch` rows per statement and `maxBatches` statements,
 * so a large table cannot stall the caller. Returns the number of rows deleted.
 */
export async function sweepRateEvents(db, { nowMs = Date.now(), batch = SWEEP_BATCH, maxBatches = 1 } = {}) {
  const cutoff = nowMs - LONGEST_WINDOW_MS;
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const { rows } = await db.system.query(
      `WITH gone AS (
         DELETE FROM rate_events
          WHERE id IN (SELECT id FROM rate_events WHERE at <= to_timestamp($1::double precision / 1000) LIMIT $2::int)
          RETURNING 1
       )
       SELECT count(*)::int AS n FROM gone`,
      [cutoff, batch],
    );
    const n = Number(rows[0].n);
    total += n;
    if (n < batch) break;
  }
  return total;
}

async function maybeSweep(db, nowMs) {
  const last = lastSweep.get(db);
  if (last !== undefined && nowMs - last < SWEEP_EVERY_MS) return;
  lastSweep.set(db, nowMs);
  try {
    await sweepRateEvents(db, { nowMs });
  } catch {
    // Housekeeping only: a failed sweep must never fail or slow the request's own check.
  }
}

/**
 * @param {{ system: { query: Function } }} db
 * @param {string} bucket
 * @param {string} subject
 * @param {number} cost 0 checks without recording
 * @param {{ max: number, windowMs: number }} limit
 * @param {number} [nowMs]
 * @returns {Promise<{ allowed: boolean, retryAfterS: number }>}
 */
export async function take(db, bucket, subject, cost, limit, nowMs = Date.now()) {
  const c = Math.max(0, Math.trunc(cost));
  const cutoff = nowMs - limit.windowMs;
  let mine = null;
  if (c > 0) {
    const ins = await db.system.query(
      "INSERT INTO rate_events (bucket, subject, cost, at) VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000)) RETURNING id",
      [bucket, subject, c, nowMs],
    );
    mine = ins.rows[0].id;
  }
  // One statement: drop this subject's expired rows, read the window, and withdraw our own
  // event when the window was already full without it.
  const { rows } = await db.system.query(
    `WITH expired AS (
       DELETE FROM rate_events
        WHERE bucket = $1 AND subject = $2 AND at <= to_timestamp($3::double precision / 1000)
     ), win AS (
       SELECT COALESCE(SUM(cost), 0)::bigint AS total,
              (EXTRACT(EPOCH FROM MIN(at)) * 1000)::double precision AS oldest_ms
         FROM rate_events
        WHERE bucket = $1 AND subject = $2 AND at > to_timestamp($3::double precision / 1000)
     ), withdraw AS (
       DELETE FROM rate_events
        WHERE id = $4::bigint AND (SELECT total FROM win) - $5::bigint >= $6::bigint
     )
     SELECT total, oldest_ms FROM win`,
    [bucket, subject, cutoff, mine, c, limit.max],
  );
  const total = Number(rows[0].total);
  const oldest = rows[0].oldest_ms == null ? null : Number(rows[0].oldest_ms);
  const used = total - c;
  const verdict = decide(limit, used, oldest, nowMs);
  await maybeSweep(db, nowMs);
  return verdict;
}

/** Records a cost with no check (the work is already done). */
export async function spend(db, bucket, subject, cost, nowMs = Date.now()) {
  const c = Math.max(0, Math.trunc(cost));
  if (c === 0) return;
  await db.system.query(
    "INSERT INTO rate_events (bucket, subject, cost, at) VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000))",
    [bucket, subject, c, nowMs],
  );
}
