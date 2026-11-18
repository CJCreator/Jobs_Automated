// The user's AI key arrives in request headers on the AI routes only, is used
// for that one request, and is never written to the database, a log, a
// response, an error message or a cookie. Nothing in this file keeps it.

import { LlmError, isProviderAllowed } from "@/lib/llm/index.mjs";

export type LlmHeaders = { provider: string; key: string; model: string | undefined };

/** Read `x-llm-provider`, `x-llm-key` and `x-llm-model`, or throw an LlmError. */
export function readLlmHeaders(req: Request): LlmHeaders {
  const provider = (req.headers.get("x-llm-provider") ?? "").trim().toLowerCase();
  if (!provider || !isProviderAllowed(provider)) {
    throw new LlmError("not_allowed", "That AI provider is not supported.");
  }
  const key = req.headers.get("x-llm-key") ?? "";
  if (!key) throw new LlmError("invalid_key", "Add your AI key first.");
  const model = (req.headers.get("x-llm-model") ?? "").trim() || undefined;
  return { provider, key, model };
}
