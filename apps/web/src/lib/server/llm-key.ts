// The user's AI key arrives in request headers on the AI routes only, is used
// for that one request, and is never written to the database, a log, a
// response, an error message or a cookie. Nothing in this file keeps it.

import { getDb } from "@/lib/db/index.mjs";
import { isVerified } from "@/lib/db/trial.mjs";
import { LlmError, isProviderAllowed } from "@/lib/llm/index.mjs";
import { en } from "@/i18n/en";
import { clientIp, ipSubject } from "./client-ip.mjs";
import { requireConsent } from "./consent";
import { assertSafeEnv } from "./env-guard.mjs";
import { HttpError } from "./http";
import { takeRateLimit } from "./rate-limit";
import { TrialError, assertTrialAvailable, trialConfig } from "./trial.mjs";

// For the free trial `provider` is "trial", `trial` is true and `key` is empty: the
// server's own trial keys are chosen later and never travel through this object.
export type LlmHeaders = { provider: string; key: string; model: string | undefined; trial: boolean };

/** Turn a trial refusal into the HttpError the client sees; anything else is returned unchanged. */
export function trialHttpError(err: unknown): unknown {
  return err instanceof TrialError ? new HttpError(402, err.code, err.message) : err;
}

// Same rule as the providers' own model check.
const MODEL_RE = /^[\w.:/-]{1,200}$/;

/**
 * Read `x-llm-provider`, `x-llm-key` and `x-llm-model`, or throw an LlmError.
 * `x-llm-provider: trial` with no key is the free trial, and only where `allowTrial` is set.
 * A request that sends the trial provider and a key is refused.
 */
export function readLlmHeaders(req: Request, { allowTrial = false }: { allowTrial?: boolean } = {}): LlmHeaders {
  // The mock provider must never answer in production. isProviderAllowed
  // already hides it there; this makes the misconfiguration a hard failure
  // instead of a quiet one.
  assertSafeEnv(process.env);
  const provider = (req.headers.get("x-llm-provider") ?? "").trim().toLowerCase();
  if (provider === "trial" && allowTrial) {
    if (req.headers.get("x-llm-key")) {
      throw new LlmError("not_allowed", "The free trial does not use your AI key. Remove the key, or choose a provider.");
    }
    return { provider: "trial", key: "", model: undefined, trial: true };
  }
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
  return { provider, key, model, trial: false };
}

/**
 * The checks every trial request passes, in this order, before any use is reserved: the
 * trial is set up on this server, the account is verified (403 trial_not_verified), the
 * user agreed to send their text to the trial providers, and the network is within the
 * daily trial cap. Costs nothing from the trial until all of them pass.
 */
export async function requireTrialAccess(userId: string, req: Request): Promise<void> {
  assertTrialAvailable(trialConfig(process.env));
  if (!(await isVerified(await getDb(), userId))) {
    throw new HttpError(403, "trial_not_verified", en.trial.notVerified);
  }
  await requireConsent(userId, "trial");
  await takeRateLimit("trialIp", ipSubject(clientIp(req.headers, process.env), process.env));
}
