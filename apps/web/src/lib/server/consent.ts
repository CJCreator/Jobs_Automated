import { getDb } from "@/lib/db/index.mjs";
import { AI_PURPOSE, STORAGE_PURPOSE, hasAnyAiConsent, hasConsent } from "@/lib/db/consents.mjs";
import { NOTICE_VERSION } from "@/lib/notice.mjs";
import { HttpError } from "@/lib/server/http";

/**
 * Refuses with 403 unless the user accepted the current notice for AI processing by this provider.
 * Without a provider, any AI-processing row for the current version counts (kept only until every
 * caller passes the provider).
 */
export async function requireConsent(userId: string, provider?: string): Promise<void> {
  const db = await getDb();
  const ok = provider
    ? await hasConsent(db, userId, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE, provider })
    : await hasAnyAiConsent(db, userId, { noticeVersion: NOTICE_VERSION });
  if (!ok) {
    throw new HttpError(
      403,
      "consent_required",
      "Agree to send your resume and job description to your AI provider before continuing.",
    );
  }
}

/** Refuses with 403 unless the user accepted the current notice for storing the facts they enter. */
export async function requireStorageConsent(userId: string): Promise<void> {
  const ok = await hasConsent(await getDb(), userId, { noticeVersion: NOTICE_VERSION, purpose: STORAGE_PURPOSE });
  if (!ok) {
    throw new HttpError(
      403,
      "storage_consent_required",
      "Agree to let Rolewright store what you enter before saving it.",
    );
  }
}
