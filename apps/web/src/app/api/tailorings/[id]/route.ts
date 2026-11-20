import { getDb } from "@/lib/db/index.mjs";
import { getFacts, getTailoring } from "@/lib/db/repo.mjs";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { json, route } from "@/lib/server/http";
import { spendRateLimit, takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { notFound, tailoringView } from "@/lib/server/views";
import { freshChecks } from "@/lib/tailoring.mjs";

export const runtime = "nodejs";

// Checks are recomputed against the facts as they are now, so a fact the user
// changed since the tailoring was made shows up here, not only at export.
export const GET = route<{ id: string }>("tailorings.get", async (_req, { params, state }) => {
  const userId = await requireUser(state);
  await takeRateLimit("tailoring", userId);
  await takeRateLimit("gateMs", userId);
  const { id } = await params;
  const db = await getDb();
  const tailoring = await getTailoring(db, userId, id);
  if (!tailoring) throw notFound();
  const engineGate = await loadFactGate();
  const facts = await getFacts(db, userId);
  const gateStart = performance.now();
  const suggestions = freshChecks(facts, tailoring.suggestions, { jdText: tailoring.jdText ?? "", engineGate });
  await spendRateLimit("gateMs", userId, Math.round(performance.now() - gateStart));
  return json({ tailoring: tailoringView(tailoring, suggestions) });
});
