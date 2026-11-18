import { getDb } from "@/lib/db/index.mjs";
import { getFacts, getTailoring, saveFacts, updateTailoringSuggestions } from "@/lib/db/repo.mjs";
import { readJsonObject } from "@/lib/server/body";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { notFound, tailoringView } from "@/lib/server/views";
import { applyAction, freshChecks } from "@/lib/tailoring.mjs";

export const runtime = "nodejs";

const optionalString = (v: unknown) => (typeof v === "string" ? v : undefined);

// Only `action`, `text` and `value` are read from the body. A client cannot
// set a decision or a check verdict: both are computed here.
export const PATCH = route<{ id: string; sid: string }>("suggestions.patch", async (req, { params, state }) => {
  const userId = await requireUser(state);
  const { id, sid } = await params;
  const body = await readJsonObject(req);
  const db = await getDb();
  const tailoring = await getTailoring(db, userId, id);
  if (!tailoring) throw notFound();
  const engineGate = await loadFactGate();
  const facts = await getFacts(db, userId);
  const ctx = { jdText: tailoring.jdText ?? "", engineGate };

  const result = applyAction(
    facts,
    tailoring.suggestions,
    sid,
    { action: optionalString(body.action), text: body.text, value: body.value },
    ctx,
  );
  // Facts first: if the second write fails, the suggestions are re-checked
  // against the saved facts on the next read anyway.
  if (result.factsChanged) await saveFacts(db, userId, result.facts);
  const suggestions = freshChecks(result.facts, result.suggestions, ctx);
  await updateTailoringSuggestions(db, userId, id, suggestions);
  return json({ tailoring: tailoringView(tailoring, suggestions) });
});
