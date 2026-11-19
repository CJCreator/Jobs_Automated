import { getDb } from "@/lib/db/index.mjs";
import { AI_PURPOSE, hasConsent } from "@/lib/db/consents.mjs";
import { NOTICE_VERSION } from "@/lib/notice.mjs";
import { HttpError } from "@/lib/server/http";

/** Refuses with 403 unless the user accepted the current notice for AI processing. */
export async function requireConsent(userId: string): Promise<void> {
  const ok = await hasConsent(await getDb(), userId, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE });
  if (!ok) {
    throw new HttpError(
      403,
      "consent_required",
      "Agree to send your resume and job description to your AI provider before continuing.",
    );
  }
}
