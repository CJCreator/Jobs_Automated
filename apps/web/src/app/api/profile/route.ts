import { getDb } from "@/lib/db/index.mjs";
import { getSegment, isSegment, setSegment } from "@/lib/db/profile.mjs";
import { readJsonObject } from "@/lib/server/body";
import { HttpError, json, route } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

export const GET = route("profile.get", async (_req, { state }) => {
  const userId = await requireUser(state);
  return json({ segment: await getSegment(await getDb(), userId) });
});

// `{ segment }` is one of fresher, experienced, switcher, or null to clear it. Nothing else is read from the body.
export const PUT = route("profile.put", async (req, { state }) => {
  const userId = await requireUser(state);
  const body = await readJsonObject(req);
  const segment = body.segment;
  if (segment !== null && !isSegment(segment)) {
    throw new HttpError(400, "invalid_segment", "Choose one of the three options, or clear your choice.");
  }
  await takeRateLimit("tailoring", userId);
  const db = await getDb();
  await setSegment(db, userId, segment);
  return json({ segment });
});
