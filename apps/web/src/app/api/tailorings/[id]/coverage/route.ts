import { getDb } from "@/lib/db/index.mjs";
import { getFacts, getTailoring } from "@/lib/db/repo.mjs";
import { HttpError, json, route } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { notFound } from "@/lib/server/views";
import { coverageFor } from "./coverage-for.mjs";

export const runtime = "nodejs";

// Read only: nothing is stored and the fact gate is not run here. Coverage is
// information for the user and never changes a suggestion or its check.
export const GET = route<{ id: string }>("tailorings.coverage", async (_req, { params, state }) => {
  const userId = await requireUser(state);
  await takeRateLimit("tailoring", userId);
  const { id } = await params;
  const db = await getDb();
  const tailoring = await getTailoring(db, userId, id);
  if (!tailoring) throw notFound();
  const facts = await getFacts(db, userId);
  try {
    return json(coverageFor(facts, tailoring.suggestions, tailoring.jdText ?? ""));
  } catch (e) {
    if (e instanceof RangeError) {
      throw new HttpError(422, "coverage_too_large", "Your resume is too long to count keywords. Shorten it and try again.");
    }
    throw e;
  }
});
