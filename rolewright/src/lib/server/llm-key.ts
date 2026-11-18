// The user's AI key arrives in request headers on the AI routes only, is used
// for that one request, and is never written to the database, a log, a
// response, an error message or a cookie. Nothing in this file keeps it.

import { LlmError, isProviderAllowed } from "@/lib/llm/index.mjs";
import { assertSafeEnv } from "./env-guard.mjs";

export type LlmHeaders = { provider: string; key: string; model: string | undefined };

// Same rule as the providers' own model check.
const MODEL_RE = /^[\w.:/-]{1,200}$/;

/** Read `x-llm-provider`, `x-llm-key` and `x-llm-model`, or throw an LlmError. */
export function readLlmHeaders(req: Request): LlmHeaders {
  // The mock provider must never answer in production. isProviderAllowed
  // already hides it there; this makes the misconfiguration a hard failure
  // instead of a quiet one.
  assertSafeEnv(process.env);
  const provider = (req.headers.get("x-llm-provider") ?? "").trim().toLowerCase();
  if (!provider || !isProviderAllowed(provider)) {
    throw new LlmError("not_allowed", "That AI provider is not supported.");
  }
  const key = req.headers.get("x-llm-key") ?? "";
  if (!key) throw new LlmError("invalid_key", "Add your AI key first.");
  const model = (req.headers.get("x-llm-model") ?? "").trim() || undefined;
  // The model id is stored with the tailoring. The providers check it before
  // calling out, but the mock does not, so bound it here for every provider.
  if (model !== undefined && (!MODEL_RE.test(model) || model.includes(".."))) {
    throw new LlmError("model_not_found", "That model name is not valid. Pick one from the list.");
  }
  return { provider, key, model };
}
