// The consent record (ADR 0004): which notice version a user accepted, for what, and when.
// Rows are only added, never changed; the app role has no UPDATE or DELETE on the table.

export const AI_PURPOSE = "ai_processing";

/** Records the consent. Recording the same version and purpose again changes nothing. */
export async function recordConsent(db, userId, { noticeVersion, purpose }) {
  await db.withUser(userId, (q) =>
    q.query(
      `INSERT INTO consents (id, user_id, notice_version, purpose)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_id, notice_version, purpose) DO NOTHING`,
      [userId, noticeVersion, purpose],
    ),
  );
}

export async function hasConsent(db, userId, { noticeVersion, purpose }) {
  const { rows } = await db.withUser(userId, (q) =>
    q.query("SELECT 1 FROM consents WHERE user_id = $1 AND notice_version = $2 AND purpose = $3", [userId, noticeVersion, purpose]),
  );
  return rows.length > 0;
}
