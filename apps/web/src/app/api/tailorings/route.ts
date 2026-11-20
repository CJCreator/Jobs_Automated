import { getDb } from "@/lib/db/index.mjs";
import { createJobWithTailoring, getFacts, listTailorings } from "@/lib/db/repo.mjs";
import { factBaseText, tailorableLines } from "@/lib/facts.mjs";
import { suggestRewrites } from "@/lib/llm/index.mjs";
import { readJsonObject } from "@/lib/server/body";
import { requireConsent } from "@/lib/server/consent";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { HttpError, json, route } from "@/lib/server/http";
import { readLlmHeaders, requireTrialAccess, trialHttpError } from "@/lib/server/llm-key";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { runWithTrial, withReservation } from "@/lib/server/trial.mjs";
import { en } from "@/i18n/en";
import { buildSuggestions, countUsable, selectLines } from "@/lib/tailoring.mjs";

export const runtime = "nodejs";

const MIN_JD = 200;
const MAX_JD = 20_000;
const field = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const GET = route("tailorings.list", async (_req, { state }) => {
  const userId = await requireUser(state);
  const items = await listTailorings(await getDb(), userId);
  return json({ items });
});

export const POST = route("tailorings.create", async (req, { state }) => {
  const userId = await requireUser(state);
  const llm = readLlmHeaders(req, { allowTrial: true });
  // The consent is for the provider that will see the text: the trial providers, or the user's own.
  if (llm.trial) await requireTrialAccess(userId, req);
  else await requireConsent(userId, llm.provider);
  const body = await readJsonObject(req);
  const title = field(body.title, 200);
  const company = field(body.company, 200);
  const jdText = typeof body.jdText === "string" ? body.jdText.trim() : "";
  if (!title) throw new HttpError(400, "missing_title", "Add the job title.");
  if (jdText.length < MIN_JD || jdText.length > MAX_JD) {
    throw new HttpError(400, "invalid_jd", "Paste the full job description: between 200 and 20,000 characters.");
  }
  await takeRateLimit("ai", userId);

  // Fail closed: without the engine's fact gate nothing is checked, so nothing is made.
  const engineGate = await loadFactGate();
  const db = await getDb();
  const facts = await getFacts(db, userId);
  const lines = tailorableLines(facts);
  if (!lines.length) {
    throw new HttpError(409, "nothing_confirmed", "Confirm at least one line of your summary or experience first.");
  }

  // Select before the model call: it never receives more than MAX_LINES_SENT lines.
  const { sent, total } = selectLines(lines);
  const work = async () => {
    const used = llm.trial
      ? await runWithTrial((c: { provider: string; key: string; model: string }) => suggestRewrites({ ...c, lines: sent, jdText }))
      : {
          value: await suggestRewrites({ provider: llm.provider, key: llm.key, model: llm.model, lines: sent, jdText }),
          provider: llm.provider,
          model: llm.model ?? null,
        };
    const rewrites = used.value;
    const rewritesReturned = countUsable(rewrites, sent);
    const suggestions = buildSuggestions(rewrites, sent, {
      sourceText: factBaseText(facts),
      jdText,
      cannotConfirm: facts.cannotConfirm,
      engineGate,
    });
    return createJobWithTailoring(db, userId, {
      title,
      company,
      jdText,
      suggestions,
      provider: used.provider,
      model: used.model,
      linesTotal: total,
      linesSent: sent.length,
      rewritesReturned,
    });
  };
  // A trial use is taken just before the model call and given back if anything fails before the row is stored.
  let created: { id: string };
  try {
    created = llm.trial ? await withReservation(db, userId, "tailorings", work, { usedUpMessage: en.trial.usedUp }) : await work();
  } catch (err) {
    throw trialHttpError(err);
  }
  const { id } = created;
  return json({ id });
});
