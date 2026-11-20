// Shared rate-limit counts in Postgres (system table rate_events, through db.system).
// The subject is a user id or a keyed HMAC-SHA-256 hex of an IP or email address, never a raw one.
//
// db.system has no transaction and runs one statement per call, so advisory locks are
// not available here. Instead each take inserts its event first (autocommit), then
// counts the window in one statement and removes its own event if the window is over.
// Every allowed take counted all events committed before it, so no more than `max`
// are ever allowed. Takes racing at the limit may both be refused; that fails closed.

import { decide } from "../server/rate-limit-core.mjs";

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
