import { getDb } from "@/lib/db/index.mjs";
import { changeTailoring } from "@/lib/db/repo.mjs";
import { readJsonObject } from "@/lib/server/body";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { json, route } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { notFound, tailoringView } from "@/lib/server/views";
import { applyAction, checksAfterAction, gateBudget } from "@/lib/tailoring.mjs";

export const runtime = "nodejs";

const optionalString = (v: unknown) => (typeof v === "string" ? v : undefined);

// Only `action`, `text` and `value` are read from the body. A client cannot
// set a decision or a check verdict: both are computed here.
export const PATCH = route<{ id: string; sid: string }>("suggestions.patch", async (req, { params, state }) => {
  const userId = await requireUser(state);
  takeRateLimit("tailoring", userId);
  const { id, sid } = await params;
  const body = await readJsonObject(req);
  const input = { action: optionalString(body.action), text: body.text, value: body.value };
  // Loaded before the transaction opens: once loaded, the gate and every check
  // are synchronous, so the rows stay locked only for the computation itself.
  const engineGate = await loadFactGate();

  // The tailoring and the facts are read, changed and written under row locks
  // in one transaction, so two actions at once cannot lose either change.
  // A refused action (409, 400) throws inside and rolls everything back.
  const changed = await changeTailoring(await getDb(), userId, id, ({ tailoring, facts }) => {
    // One time budget for the action and the re-check of every suggestion after it.
    const ctx = { jdText: tailoring.jdText ?? "", engineGate, budget: gateBudget() };
    const result = applyAction(facts, tailoring.suggestions, sid, input, ctx);
    return {
      facts: result.factsChanged ? result.facts : undefined,
      // Each suggestion is checked once per action; a reject is saved with no check at all.
      suggestions: checksAfterAction(result, input.action, ctx),
    };
  });
  if (!changed) throw notFound();
  return json({ tailoring: tailoringView(changed.tailoring, changed.suggestions) });
});
