// The free trial's counters (ADR 0003). One row per account in trial_counters, read and
// written under row-level security. reserve() is a single statement, so two requests at the
// same moment cannot both take the last one.

export const TRIAL_TAILORINGS = 5;
export const TRIAL_UPLOADS = 3;

// Column names and limits are constants chosen here, never taken from a request.
const KINDS = Object.freeze({
  tailorings: { column: "tailorings_used", max: TRIAL_TAILORINGS },
  uploads: { column: "uploads_used", max: TRIAL_UPLOADS },
});

function kindOf(kind) {
  const k = Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
  if (!k) throw new TypeError("Trial kind must be \"tailorings\" or \"uploads\".");
  return k;
}

/** Take one trial use. Returns true, or false when the account has used them all. */
export async function reserve(db, userId, kind) {
  const { column, max } = kindOf(kind);
  const { rows } = await db.withUser(userId, (q) =>
    q.query(
      `INSERT INTO trial_counters (user_id, ${column}) VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE SET ${column} = trial_counters.${column} + 1, updated_at = now()
       WHERE trial_counters.${column} < ${max}
       RETURNING ${column} AS used`,
      [userId],
    ),
  );
  return rows.length > 0;
}

/** Give one trial use back (the work failed before anything was stored). Never goes below 0. */
export async function refund(db, userId, kind) {
  const { column } = kindOf(kind);
  await db.withUser(userId, (q) =>
    q.query(
      `UPDATE trial_counters SET ${column} = GREATEST(${column} - 1, 0), updated_at = now() WHERE user_id = $1`,
      [userId],
    ),
  );
}

/**
 * Whether the account counts as verified: the email address is confirmed, or it signed in with
 * Google (sign-in admits Google only when Google says the address is verified, but Auth.js
 * leaves users.email_verified empty for it). The development sign-in is never verified.
 */
export async function isVerified(db, userId) {
  const { rows } = await db.system.query(
    `SELECT (u.email_verified IS NOT NULL
             OR EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.provider = 'google')) AS verified
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  return rows[0]?.verified === true;
}

/** What the account has left. */
export async function status(db, userId) {
  const verified = await isVerified(db, userId);
  const { rows } = await db.withUser(userId, (q) =>
    q.query("SELECT tailorings_used, uploads_used FROM trial_counters WHERE user_id = $1", [userId]),
  );
  const used = rows[0] ?? { tailorings_used: 0, uploads_used: 0 };
  return {
    verified,
    tailoringsLeft: Math.max(TRIAL_TAILORINGS - used.tailorings_used, 0),
    uploadsLeft: Math.max(TRIAL_UPLOADS - used.uploads_used, 0),
  };
}
