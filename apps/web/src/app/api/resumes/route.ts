import { getDb } from "@/lib/db/index.mjs";
import { deleteResumeTexts } from "@/lib/db/repo.mjs";
import { HttpError, json, route } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

// Deletes the stored text of the user's uploaded resumes. With ?facts=upload it
// also deletes the facts that were read from the resume. Without it, facts are
// not touched.
export const DELETE = route("resumes.delete", async (req, { state }) => {
  const userId = await requireUser(state);
  const param = new URL(req.url).searchParams.get("facts");
  if (param !== null && param !== "upload") {
    throw new HttpError(400, "invalid_option", "That option is not recognised.");
  }
  await takeRateLimit("tailoring", userId);
  const result = await deleteResumeTexts(await getDb(), userId, { facts: param === "upload" });
  return json(result);
});
