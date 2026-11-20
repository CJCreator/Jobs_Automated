import { getDb } from "@/lib/db/index.mjs";
import { AI_PURPOSE, STORAGE_PURPOSE, hasAnyAiConsent, hasConsent, recordConsent } from "@/lib/db/consents.mjs";
import { NOTICE_VERSION } from "@/lib/notice.mjs";
import { readJsonObject } from "@/lib/server/body";
import { HttpError, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

const PROVIDER_ID = /^[a-z]{2,20}$/;
const validProvider = (p: unknown): p is string => typeof p === "string" && (p === "trial" || PROVIDER_ID.test(p));

export const GET = route("consent.get", async (req, { state }) => {
  const userId = await requireUser(state);
  const provider = new URL(req.url).searchParams.get("provider") ?? "";
  if (provider && !validProvider(provider)) {
    throw new HttpError(400, "invalid_provider", "That AI provider is not recognised.");
  }
  const db = await getDb();
  const accepted = provider
    ? await hasConsent(db, userId, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE, provider })
    : await hasAnyAiConsent(db, userId, { noticeVersion: NOTICE_VERSION });
  const storageAccepted = await hasConsent(db, userId, { noticeVersion: NOTICE_VERSION, purpose: STORAGE_PURPOSE });
  return json({ noticeVersion: NOTICE_VERSION, accepted, storageAccepted });
});

export const POST = route("consent.post", async (req, { state }) => {
  const userId = await requireUser(state);
  const body = await readJsonObject(req);
  if (body.noticeVersion !== NOTICE_VERSION) {
    throw new HttpError(400, "stale_notice", "The privacy notice has changed. Reload the page and read it again.");
  }
  const db = await getDb();
  if (body.purpose === STORAGE_PURPOSE) {
    await recordConsent(db, userId, { noticeVersion: NOTICE_VERSION, purpose: STORAGE_PURPOSE });
    return json({ accepted: true, storageAccepted: true });
  }
  if (body.purpose !== AI_PURPOSE) {
    throw new HttpError(400, "invalid_purpose", "That kind of agreement is not recognised.");
  }
  if (!validProvider(body.provider)) {
    throw new HttpError(400, "invalid_provider", "Choose an AI provider before agreeing.");
  }
  // Agreeing to AI processing also covers storing what the user's resume produces.
  await recordConsent(db, userId, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE, provider: body.provider });
  await recordConsent(db, userId, { noticeVersion: NOTICE_VERSION, purpose: STORAGE_PURPOSE });
  return json({ accepted: true, storageAccepted: true });
});
