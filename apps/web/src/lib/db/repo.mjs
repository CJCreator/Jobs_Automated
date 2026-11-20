// Queries. Every function takes a `db` from createDb()/getDb() as its first argument.
//
// Identity functions use db.system (the tables have no row-level security).
// Everything that touches a user's own data goes through db.withUser, so the
// database, not this file, decides which rows a user can see.

import { emptyFacts } from "../facts.mjs";
import { withoutResumeFacts } from "../fact-source.mjs";
import { sweepRateEvents } from "./rate-events.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const newId = () => globalThis.crypto.randomUUID();
const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const normEmail = (email) => String(email ?? "").trim().toLowerCase();

const toUser = (r) =>
  r && {
    id: r.id,
    email: r.email,
    name: r.name,
    image: r.image,
    emailVerified: r.email_verified ?? null,
    createdAt: iso(r.created_at),
    lastSeenAt: iso(r.last_seen_at),
  };

// ---- identity -------------------------------------------------------------

export async function upsertUserByEmail(db, { email, name, image, emailVerified } = {}) {
  const e = normEmail(email);
  if (!e) throw new TypeError("An email address is required.");
  const { rows } = await db.system.query(
    `INSERT INTO users (id, email, name, image, email_verified)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, users.name),
       image = COALESCE(EXCLUDED.image, users.image),
       email_verified = COALESCE(EXCLUDED.email_verified, users.email_verified),
       last_seen_at = now()
     RETURNING *`,
    [newId(), e, name ?? null, image ?? null, emailVerified ?? null],
  );
  return toUser(rows[0]);
}

export async function getUserById(db, id) {
  if (!isUuid(id)) return null;
  const { rows } = await db.system.query("SELECT * FROM users WHERE id = $1", [id]);
  return toUser(rows[0] ?? null);
}

export async function getUserByEmail(db, email) {
  const { rows } = await db.system.query("SELECT * FROM users WHERE email = $1", [normEmail(email)]);
  return toUser(rows[0] ?? null);
}

export async function getUserByAccount(db, provider, providerAccountId) {
  const { rows } = await db.system.query(
    `SELECT u.* FROM accounts a JOIN users u ON u.id = a.user_id
     WHERE a.provider = $1 AND a.provider_account_id = $2`,
    [provider, String(providerAccountId)],
  );
  return toUser(rows[0] ?? null);
}

export async function linkAccount(db, { userId, provider, providerAccountId }) {
  await db.system.query(
    `INSERT INTO accounts (provider, provider_account_id, user_id) VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_account_id) DO NOTHING`,
    [provider, String(providerAccountId), userId],
  );
}

/** Patch semantics: a field left undefined is kept as it is. */
export async function updateUser(db, id, { email, name, image, emailVerified } = {}) {
  if (!isUuid(id)) return null;
  const { rows } = await db.system.query(
    `UPDATE users SET
       email = COALESCE($2, email),
       name = COALESCE($3, name),
       image = COALESCE($4, image),
       email_verified = COALESCE($5, email_verified)
     WHERE id = $1 RETURNING *`,
    [id, email === undefined ? null : normEmail(email), name ?? null, image ?? null, emailVerified ?? null],
  );
  return toUser(rows[0] ?? null);
}

export async function touchUser(db, id) {
  if (!isUuid(id)) return;
  await db.system.query("UPDATE users SET last_seen_at = now() WHERE id = $1", [id]);
}

export async function createVerificationToken(db, { identifier, token, expires }) {
  await db.system.query(
    "INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, $3)",
    [normEmail(identifier), token, expires],
  );
  return { identifier: normEmail(identifier), token, expires };
}

/** Single use: the row is deleted as it is returned. Expiry is the caller's check. */
export async function useVerificationToken(db, { identifier, token }) {
  const { rows } = await db.system.query(
    "DELETE FROM verification_tokens WHERE identifier = $1 AND token = $2 RETURNING identifier, token, expires",
    [normEmail(identifier), token],
  );
  return rows[0] ? { identifier: rows[0].identifier, token: rows[0].token, expires: rows[0].expires } : null;
}

// ---- user data ------------------------------------------------------------

export function saveResume(db, userId, { filename, rawText }) {
  const id = newId();
  return db.withUser(userId, async (tx) => {
    await tx.query(
      "INSERT INTO resumes (id, user_id, filename, raw_text) VALUES ($1, $2, $3, $4)",
      [id, userId, filename ?? null, rawText ?? null],
    );
    return { id };
  });
}

export function getFacts(db, userId) {
  return db.withUser(userId, async (tx) => {
    const { rows } = await tx.query("SELECT facts FROM fact_bases WHERE user_id = $1", [userId]);
    return rows[0] ? { ...emptyFacts(), ...rows[0].facts } : emptyFacts();
  });
}

export function saveFacts(db, userId, facts) {
  return db.withUser(userId, async (tx) => {
    await tx.query(
      `INSERT INTO fact_bases (user_id, facts) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET facts = EXCLUDED.facts, updated_at = now()`,
      [userId, JSON.stringify(facts)],
    );
    return facts;
  });
}

export function createJob(db, userId, { title, company, jdText }) {
  const id = newId();
  return db.withUser(userId, async (tx) => {
    await tx.query(
      "INSERT INTO jobs (id, user_id, title, company, jd_text) VALUES ($1, $2, $3, $4, $5)",
      [id, userId, title ?? null, company ?? null, jdText ?? null],
    );
    return { id };
  });
}

/**
 * Deletes one tailoring (its suggestions are a column of it), then its job
 * description when no other tailoring still uses it. Runs under row-level
 * security, so another user's id deletes nothing.
 * @returns {Promise<boolean>} whether a tailoring was deleted
 */
export function deleteTailoring(db, userId, id) {
  if (!isUuid(id)) return Promise.resolve(false);
  return db.withUser(userId, async (tx) => {
    const { rows } = await tx.query("DELETE FROM tailorings WHERE id = $1 RETURNING job_id", [id]);
    if (!rows.length) return false;
    await tx.query(
      "DELETE FROM jobs WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM tailorings WHERE job_id = $1)",
      [rows[0].job_id],
    );
    return true;
  });
}

/**
 * Deletes the stored text of the user's uploaded resumes. By default the facts
 * are not touched or locked. With `facts: true`, the facts that were read from
 * the resume (withoutResumeFacts) are removed in the same transaction.
 * @returns {Promise<{ deleted: number, factsRemoved: number }>}
 */
export function deleteResumeTexts(db, userId, { facts = false } = {}) {
  return db.withUser(userId, async (tx) => {
    const { rows } = await tx.query("DELETE FROM resumes WHERE user_id = $1 RETURNING id", [userId]);
    let factsRemoved = 0;
    if (facts) {
      const result = withoutResumeFacts(await lockFacts(tx, userId));
      factsRemoved = result.removed;
      await writeFacts(tx, userId, result.facts);
    }
    return { deleted: rows.length, factsRemoved };
  });
}

/** A count that is absent (null) or a non-negative integer; anything else is a bug in the caller. */
function optionalCount(n) {
  if (n === undefined || n === null) return null;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("A count must be a non-negative integer.");
  return n;
}

/**
 * A job and its tailoring in one transaction, so a failure part-way never
 * leaves behind a job description the user has no screen to see or delete.
 * @returns {Promise<{ id: string, jobId: string }>}
 */
export function createJobWithTailoring(db, userId, { title, company, jdText, suggestions, provider, model, linesTotal, linesSent, rewritesReturned }) {
  const counts = [linesTotal, linesSent, rewritesReturned].map(optionalCount);
  const jobId = newId();
  const id = newId();
  return db.withUser(userId, async (tx) => {
    await tx.query(
      "INSERT INTO jobs (id, user_id, title, company, jd_text) VALUES ($1, $2, $3, $4, $5)",
      [jobId, userId, title ?? null, company ?? null, jdText ?? null],
    );
    await tx.query(
      `INSERT INTO tailorings (id, user_id, job_id, suggestions, provider, model, lines_total, lines_sent, rewrites_returned)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
      [id, userId, jobId, JSON.stringify(suggestions ?? []), provider ?? null, model ?? null, ...counts],
    );
    return { id, jobId };
  });
}

export function createTailoring(db, userId, { jobId, suggestions, provider, model }) {
  const id = newId();
  return db.withUser(userId, async (tx) => {
    // The foreign key is checked outside row-level security, so confirm here
    // (under it) that the job is the caller's own.
    const job = isUuid(jobId) ? await tx.query("SELECT id FROM jobs WHERE id = $1", [jobId]) : { rows: [] };
    if (!job.rows.length) throw new Error("That job was not found.");
    await tx.query(
      `INSERT INTO tailorings (id, user_id, job_id, suggestions, provider, model)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [id, userId, jobId, JSON.stringify(suggestions ?? []), provider ?? null, model ?? null],
    );
    return { id };
  });
}

const TAILORING_SELECT = `SELECT t.id, t.job_id, t.suggestions, t.provider, t.model, t.created_at, t.updated_at,
         t.lines_total, t.lines_sent, t.rewrites_returned,
         j.title, j.company, j.jd_text
  FROM tailorings t JOIN jobs j ON j.id = t.job_id
  WHERE t.id = $1`;

const toTailoring = (r) =>
  r
    ? {
        id: r.id,
        jobId: r.job_id,
        title: r.title,
        company: r.company,
        jdText: r.jd_text,
        suggestions: r.suggestions,
        provider: r.provider,
        model: r.model,
        linesTotal: r.lines_total ?? null,
        linesSent: r.lines_sent ?? null,
        rewritesReturned: r.rewrites_returned ?? null,
        createdAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
      }
    : null;

export function getTailoring(db, userId, id) {
  if (!isUuid(id)) return Promise.resolve(null);
  return db.withUser(userId, async (tx) => {
    const { rows } = await tx.query(TAILORING_SELECT, [id]);
    return toTailoring(rows[0]);
  });
}

// ---- locked read-modify-write ----------------------------------------------
//
// A review action reads a tailoring and the Fact Base, changes them and writes
// them back. Two such requests at once (two tabs, a double click) would each
// read the same starting point and the second write would silently drop the
// first one's change, for example a "can't confirm" entry. So these functions
// lock the rows before reading them, in one transaction, and always in the same
// order (the tailoring row, then the fact_bases row) so two requests can never
// wait on each other. On PGlite, which runs one transaction at a time, the
// locks change nothing; on Postgres they make the second request wait and then
// read the first one's result.

/** The tailoring row, locked until the transaction ends. Only the tailoring is locked, not its job. */
async function lockTailoring(tx, id) {
  const { rows } = await tx.query(`${TAILORING_SELECT} FOR UPDATE OF t`, [id]);
  return toTailoring(rows[0]);
}

/**
 * The user's Fact Base row, locked until the transaction ends. A lock on a row
 * that does not exist yet would lock nothing, so an empty row is created first;
 * it reads the same as no row, and a rollback removes it again.
 */
async function lockFacts(tx, userId) {
  await tx.query(
    "INSERT INTO fact_bases (user_id, facts) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO NOTHING",
    [userId, JSON.stringify(emptyFacts())],
  );
  const { rows } = await tx.query("SELECT facts FROM fact_bases WHERE user_id = $1 FOR UPDATE", [userId]);
  return { ...emptyFacts(), ...rows[0].facts };
}

async function writeFacts(tx, userId, facts) {
  await tx.query("UPDATE fact_bases SET facts = $2::jsonb, updated_at = now() WHERE user_id = $1", [
    userId,
    JSON.stringify(facts),
  ]);
}

/**
 * Change the user's Fact Base atomically.
 *
 * @param {any} db
 * @param {string} userId
 * @param {(current: any) => any} change gets the stored facts and returns the
 *   facts to save. It must not use the database (on PGlite a query outside the
 *   transaction deadlocks). Anything it throws rolls the transaction back.
 * @returns {Promise<any>} the saved facts
 */
export function changeFacts(db, userId, change) {
  return db.withUser(userId, async (tx) => {
    const next = await change(await lockFacts(tx, userId));
    await writeFacts(tx, userId, next);
    return next;
  });
}

/**
 * Change one tailoring's suggestions, and the Fact Base if needed, atomically.
 *
 * @param {any} db
 * @param {string} userId
 * @param {string} id the tailoring id
 * @param {(current: { tailoring: any, facts: any }) => { suggestions: any[], facts?: any }} change
 *   returns the suggestions to save, plus `facts` only when the facts changed.
 *   Same rules as in changeFacts.
 * @returns {Promise<{ tailoring: any, facts: any, suggestions: any[] } | null>}
 *   null when the tailoring is not found among this user's own.
 */
export function changeTailoring(db, userId, id, change) {
  if (!isUuid(id)) return Promise.resolve(null);
  return db.withUser(userId, async (tx) => {
    const tailoring = await lockTailoring(tx, id);
    if (!tailoring) return null;
    const facts = await lockFacts(tx, userId);
    const next = await change({ tailoring, facts });
    if (next.facts) await writeFacts(tx, userId, next.facts);
    await tx.query("UPDATE tailorings SET suggestions = $2::jsonb, updated_at = now() WHERE id = $1", [
      id,
      JSON.stringify(next.suggestions ?? []),
    ]);
    return { tailoring, facts: next.facts ?? facts, suggestions: next.suggestions ?? [] };
  });
}

export function listTailorings(db, userId) {
  return db.withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `SELECT t.id, t.suggestions, t.created_at, j.title, j.company
       FROM tailorings t JOIN jobs j ON j.id = t.job_id
       ORDER BY t.created_at DESC`,
    );
    return rows.map((r) => {
      const count = (d) => r.suggestions.filter((s) => s?.decision === d).length;
      return {
        id: r.id,
        title: r.title,
        company: r.company,
        createdAt: iso(r.created_at),
        pending: count("pending"),
        accepted: count("accepted"),
        rejected: count("rejected"),
      };
    });
  });
}

/** Returns true if a tailoring of this user's was updated. */
export function updateTailoringSuggestions(db, userId, id, suggestions) {
  if (!isUuid(id)) return Promise.resolve(false);
  return db.withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "UPDATE tailorings SET suggestions = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING id",
      [id, JSON.stringify(suggestions ?? [])],
    );
    return rows.length > 0;
  });
}

/** `months` calendar months before `now`, clamped so 29 February minus 12 months is 28 February, not 1 March. */
function monthsBefore(now, months) {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * The privacy screen promises that an account with no sign-in for 12 months is
 * deleted. Deletes every user whose last sign-in is strictly older than
 * `months` calendar months before `now` (exactly on the line is kept); every
 * table's user_id foreign key cascades, so all their data goes too.
 * Also removes their email-link tokens (keyed by email, so no cascade) and
 * every expired token. POST /api/internal/purge calls this on a schedule;
 * scripts/purge-inactive.mjs is the fallback.
 *
 * @returns {Promise<number>} how many users were deleted
 */
export async function purgeInactiveUsers(db, { months = 12, now = new Date() } = {}) {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a whole number of at least 1.");
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError("now must be a valid date.");
  const cutoff = monthsBefore(now, months).toISOString();
  const { rows } = await db.system.query(
    `WITH gone AS (
       DELETE FROM users WHERE COALESCE(last_seen_at, created_at) < $1::timestamptz RETURNING id, email
     ), tokens AS (
       DELETE FROM verification_tokens WHERE identifier IN (SELECT email FROM gone) OR expires < now()
     )
     SELECT id FROM gone`,
    [cutoff],
  );
  // The daily purge also clears expired rate-limit records (all batches, not just one).
  await sweepRateEvents(db, { nowMs: now.getTime(), maxBatches: 1000 });
  return rows.length;
}

/** Deletes the user row (every table's user_id foreign key cascades) and their email-link tokens. */
export async function deleteUserData(db, userId) {
  if (!isUuid(userId)) return false;
  // Rate-limit rows keyed by this user's id go in the same statement. Rows keyed by a keyed hash of an
  // IP or email address are not deleted here; they stop counting within their window and the sweep
  // removes them once they are 24 hours old.
  const { rows } = await db.system.query(
    `WITH gone AS (DELETE FROM users WHERE id = $1::uuid RETURNING id, email),
     tokens AS (DELETE FROM verification_tokens WHERE identifier IN (SELECT email FROM gone)),
     rate AS (DELETE FROM rate_events WHERE subject = $1::uuid::text)
     SELECT id FROM gone`,
    [userId],
  );
  return rows.length > 0;
}
