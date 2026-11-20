import { getDb } from "@/lib/db/index.mjs";
import { deleteResumeTexts } from "@/lib/db/repo.mjs";
import { json, route } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

// Deletes the stored text of the user's uploaded resumes. Confirmed facts are
// a separate record and stay.
export const DELETE = route("resumes.delete", async (_req, { state }) => {
  const userId = await requireUser(state);
  await takeRateLimit("tailoring", userId);
  const deleted = await deleteResumeTexts(await getDb(), userId);
  return json({ deleted });
});
