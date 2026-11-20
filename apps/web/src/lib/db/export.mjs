// The data export (ADR 0004): everything held for one user, as one JSON-able object.
// User tables are read in one withUser call, so row-level security decides whose rows
// come back (each query also names the user id). The account row comes from the identity
// table through db.system. Nothing secret is stored in these tables, and the account row
// is still filtered so a column added later with such a name is never exported.

import { listEvents } from "./events.mjs";

const SECRET_NAME = /key|token|password|secret/i;

export const EXPORT_FORMAT = "rolewright-export";
export const EXPORT_VERSION = 1;

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

function withoutSecrets(row) {
  const out = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    if (!SECRET_NAME.test(k)) out[k] = iso(v);
  }
  return out;
}

/** Everything held for the user. Returns plain JSON data. */
export async function exportUserData(db, userId, { now = new Date() } = {}) {
  const { rows: accountRows } = await db.system.query("SELECT to_jsonb(u) AS account FROM users u WHERE id = $1", [userId]);
  const account = withoutSecrets(accountRows[0]?.account);
  const { rows: signIns } = await db.system.query(
    "SELECT provider, provider_account_id FROM accounts WHERE user_id = $1 ORDER BY provider, provider_account_id",
    [userId],
  );

  const own = await db.withUser(userId, async (q) => {
    const all = async (sql) => (await q.query(sql, [userId])).rows;
    return {
      facts: (await all("SELECT facts, updated_at FROM fact_bases WHERE user_id = $1"))[0] ?? null,
      resumes: await all("SELECT id, filename, raw_text, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at, id"),
      jobs: await all("SELECT id, title, company, jd_text, created_at FROM jobs WHERE user_id = $1 ORDER BY created_at, id"),
      tailorings: await all(
        `SELECT id, job_id, suggestions, provider, model, lines_total, lines_sent, rewrites_returned, created_at, updated_at
         FROM tailorings WHERE user_id = $1 ORDER BY created_at, id`,
      ),
      consents: await all(
        "SELECT notice_version, purpose, provider, accepted_at FROM consents WHERE user_id = $1 ORDER BY accepted_at, notice_version, purpose, provider",
      ),
      trial: (await all("SELECT tailorings_used, uploads_used, updated_at FROM trial_counters WHERE user_id = $1"))[0] ?? null,
    };
  });

  const events = await listEvents(db, userId);

  const clean = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)]));
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    account,
    signIns,
    facts: own.facts ? clean(own.facts) : null,
    resumes: own.resumes.map(clean),
    jobs: own.jobs.map(clean),
    tailorings: own.tailorings.map(clean),
    consents: own.consents.map(clean),
    trial: own.trial ? clean(own.trial) : null,
    events: events.map(clean),
  };
}
