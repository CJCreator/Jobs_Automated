import { getDb } from "@/lib/db/index.mjs";
import { AI_PURPOSE, hasConsent, recordConsent } from "@/lib/db/consents.mjs";
import { NOTICE_VERSION } from "@/lib/notice.mjs";
import { readJsonObject } from "@/lib/server/body";
import { HttpError, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

export const GET = route("consent.get", async (_req, { state }) => {
  const userId = await requireUser(state);
  const accepted = await hasConsent(await getDb(), userId, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE });
  return json({ noticeVersion: NOTICE_VERSION, accepted });
});

export const POST = route("consent.post", async (req, { state }) => {
  const userId = await requireUser(state);
  const body = await readJsonObject(req);
  if (body.noticeVersion !== NOTICE_VERSION) {
    throw new HttpError(400, "stale_notice", "The privacy notice has changed. Reload the page and read it again.");
  }
  await recordConsent(await getDb(), userId, { noticeVersion: NOTICE_VERSION, purpose: AI_PURPOSE });
  return json({ accepted: true });
});
