import { LlmError, parseJsonReply } from "./errors.mjs";
import { complete, isProviderAllowed } from "./providers.mjs";
import { parseResumePrompt, tailorPrompt } from "./prompts.mjs";

export { isProviderAllowed, verifyKey, PROVIDERS } from "./providers.mjs";
export { LlmError, maskKey, scrub } from "./errors.mjs";

/** Ask the AI to read resume text. Returns the parsed object; the server normalises it. */
export async function extractFacts({ provider, key, model, resumeText }) {
  const { system, user } = parseResumePrompt(resumeText);
  const reply = await complete({ provider, key, model, system, user, json: true });
  return parseJsonReply(reply);
}

/**
 * Ask the AI for rewrites of the given lines. Anything that is not a usable
 * suggestion for one of those lines is dropped silently; the fact check, not
 * this filter, decides whether a suggestion is true.
 */
export async function suggestRewrites({ provider, key, model, lines, jdText }) {
  const { system, user } = tailorPrompt({ lines, jdText });
  const reply = await complete({ provider, key, model, system, user, json: true });
  const parsed = parseJsonReply(reply);
  if (!Array.isArray(parsed.suggestions)) throw new LlmError("bad_response", "The AI did not return a usable answer. Try again.");
  const original = new Map(lines.map((l) => [l.ref, l.text]));
  const seen = new Set();
  const out = [];
  for (const s of parsed.suggestions) {
    if (!s || typeof s.ref !== "string" || !original.has(s.ref) || seen.has(s.ref)) continue;
    if (typeof s.after !== "string") continue;
    const after = s.after.trim().slice(0, 600);
    if (!after || after === original.get(s.ref).trim()) continue;
    seen.add(s.ref);
    out.push({ ref: s.ref, after, rationale: typeof s.rationale === "string" ? s.rationale.trim().slice(0, 300) : "" });
  }
  return out;
}
