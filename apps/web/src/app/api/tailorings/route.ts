import { getDb } from "@/lib/db/index.mjs";
import { createJobWithTailoring, getFacts, listTailorings } from "@/lib/db/repo.mjs";
import { factBaseText, tailorableLines } from "@/lib/facts.mjs";
import { suggestRewrites } from "@/lib/llm/index.mjs";
import { readJsonObject } from "@/lib/server/body";
import { requireConsent } from "@/lib/server/consent";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { HttpError, json, route } from "@/lib/server/http";
import { readLlmHeaders } from "@/lib/server/llm-key";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { buildSuggestions } from "@/lib/tailoring.mjs";

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
  const llm = readLlmHeaders(req);
  const body = await readJsonObject(req);
  const title = field(body.title, 200);
  const company = field(body.company, 200);
  const jdText = typeof body.jdText === "string" ? body.jdText.trim() : "";
  if (!title) throw new HttpError(400, "missing_title", "Add the job title.");
  if (jdText.length < MIN_JD || jdText.length > MAX_JD) {
    throw new HttpError(400, "invalid_jd", "Paste the full job description: between 200 and 20,000 characters.");
  }
  await requireConsent(userId);
  takeRateLimit("ai", userId);

  // Fail closed: without the engine's fact gate nothing is checked, so nothing is made.
  const engineGate = await loadFactGate();
  const db = await getDb();
  const facts = await getFacts(db, userId);
  const lines = tailorableLines(facts);
  if (!lines.length) {
    throw new HttpError(409, "nothing_confirmed", "Confirm at least one line of your summary or experience first.");
  }

  const rewrites = await suggestRewrites({ provider: llm.provider, key: llm.key, model: llm.model, lines, jdText });
  const suggestions = buildSuggestions(rewrites, lines, {
    sourceText: factBaseText(facts),
    jdText,
    cannotConfirm: facts.cannotConfirm,
    engineGate,
  });
  const { id } = await createJobWithTailoring(db, userId, {
    title,
    company,
    jdText,
    suggestions,
    provider: llm.provider,
    model: llm.model ?? null,
  });
  return json({ id });
});
