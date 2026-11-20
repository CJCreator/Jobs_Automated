// The free trial's server side (ADR 0003). Our own keys come from the environment (Secret
// Manager in production) and are used here only: they are never returned, logged, stored or
// put in an error. Every error thrown from this file is an LlmError or TrialError, whose
// messages are written here and never carry text from a provider.

import { LlmError } from "../llm/errors.mjs";
import { refund, reserve } from "../db/trial.mjs";

// Same text as en.trial.unavailable (tests/trial.test.mjs keeps the two equal).
export const TRIAL_UNAVAILABLE = "The free trial is not available right now. Add your own AI key to continue.";

const MODEL_RE = /^[\w.:/-]{1,200}$/;
// Gemini first, then OpenRouter.
const SOURCES = [
  { provider: "gemini", key: "ROLEWRIGHT_TRIAL_GEMINI_KEY", model: "ROLEWRIGHT_TRIAL_GEMINI_MODEL" },
  { provider: "openrouter", key: "ROLEWRIGHT_TRIAL_OPENROUTER_KEY", model: "ROLEWRIGHT_TRIAL_OPENROUTER_MODEL" },
];

// A failure that is about our key or quota, not about the user's request: try the next provider.
const MOVE_ON = new Set(["quota", "rate_limited", "provider_error", "invalid_key", "model_not_found"]);

export class TrialError extends Error {
  /** @param {"trial_used_up"} code */
  constructor(code, message) {
    super(message);
    this.name = "TrialError";
    this.code = code;
  }
}

/** The trial providers in order, each with its key and model. A provider with no key or no valid model id is left out. */
export function trialConfig(env = process.env) {
  const out = [];
  for (const s of SOURCES) {
    const key = String(env?.[s.key] ?? "").trim();
    const model = String(env?.[s.model] ?? "").trim();
    if (!key || !MODEL_RE.test(model) || model.includes("..")) continue;
    out.push({ provider: s.provider, key, model });
  }
  return out;
}

/** Throws the trial-unavailable error when no trial key is configured, before anything is reserved. */
export function assertTrialAvailable(config = trialConfig()) {
  if (config.length === 0) throw new LlmError("quota", TRIAL_UNAVAILABLE);
}

/**
 * Run fn({ provider, key, model }) on each trial provider in turn, moving on only when the
 * failure is the provider's quota, rate limit or outage (or our own key or model being wrong).
 * Returns { value, provider, model } for the one that answered. When none can, throws an
 * LlmError "quota" with the trial-unavailable message. Any other failure (a refusal, an
 * unusable answer) is thrown as it is, because another provider would not change it.
 */
export async function runWithTrial(fn, { config = trialConfig() } = {}) {
  for (const c of config) {
    try {
      const value = await fn({ provider: c.provider, key: c.key, model: c.model });
      return { value, provider: c.provider, model: c.model };
    } catch (err) {
      if (err instanceof LlmError && MOVE_ON.has(err.code)) continue;
      throw err;
    }
  }
  throw new LlmError("quota", TRIAL_UNAVAILABLE);
}

/**
 * Take one trial use, run work(), and give the use back if work() throws. Callers put
 * everything up to the stored row inside work(), so a failure anywhere before it is refunded.
 * A crash between reserve and refund costs the user one use (accepted, see the brief).
 */
export async function withReservation(db, userId, kind, work, { usedUpMessage }) {
  if (!(await reserve(db, userId, kind))) throw new TrialError("trial_used_up", usedUpMessage);
  try {
    return await work();
  } catch (err) {
    try {
      await refund(db, userId, kind);
    } catch {
      // The original failure is the one to report.
    }
    throw err;
  }
}
