// The consent record (ADR 0004): which notice version a user accepted, for what, and when.
// Rows are only added, never changed; the app role has no UPDATE or DELETE on the table.
// An AI-processing row also names the provider the user agreed to; a storage row has provider "".

export const AI_PURPOSE = "ai_processing";
export const STORAGE_PURPOSE = "storage";

const PROVIDER_ID = /^[a-z]{2,20}$/;

function cleanProvider(provider) {
  if (provider === "" || provider === "trial" || (typeof provider === "string" && PROVIDER_ID.test(provider))) return provider;
  throw new TypeError("Consent needs a provider id of 2 to 20 lowercase letters, \"trial\", or an empty string.");
}

/** Records the consent. Recording the same version, purpose and provider again changes nothing. */
export async function recordConsent(db, userId, { noticeVersion, purpose, provider = "" }) {
  const p = cleanProvider(provider);
  await db.withUser(userId, (q) =>
    q.query(
      `INSERT INTO consents (id, user_id, notice_version, purpose, provider)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (user_id, notice_version, purpose, provider) DO NOTHING`,
      [userId, noticeVersion, purpose, p],
    ),
  );
}

export async function hasConsent(db, userId, { noticeVersion, purpose, provider = "" }) {
  const p = cleanProvider(provider);
  const { rows } = await db.withUser(userId, (q) =>
    q.query(
      "SELECT 1 FROM consents WHERE user_id = $1 AND notice_version = $2 AND purpose = $3 AND provider = $4",
      [userId, noticeVersion, purpose, p],
    ),
  );
  return rows.length > 0;
}

/** True if the user has any AI-processing row for this version, whatever the provider (legacy callers). */
export async function hasAnyAiConsent(db, userId, { noticeVersion }) {
  const { rows } = await db.withUser(userId, (q) =>
    q.query("SELECT 1 FROM consents WHERE user_id = $1 AND notice_version = $2 AND purpose = $3", [userId, noticeVersion, AI_PURPOSE]),
  );
  return rows.length > 0;
}
