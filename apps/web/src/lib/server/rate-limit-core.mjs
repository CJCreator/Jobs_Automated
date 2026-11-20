// Rate-limit rules, with no database and no framework so they can be tested alone.
// `max` and `cost` count whatever the bucket counts: requests, or milliseconds for gateMs.

const MIN = 60_000;
const HOUR = 60 * MIN;

export const LIMITS = {
  ai: { max: 20, windowMs: MIN, message: "Too many AI requests in a short time. Wait a minute and try again." },
  upload: { max: 10, windowMs: HOUR, message: "Too many uploads in the last hour. Try again later." },
  // Reading a tailoring, a review action and an export each run the fact gate on every suggestion.
  coverage: { max: 60, windowMs: MIN, message: "Too many requests in a short time. Wait a minute and try again." },
  tailoring: { max: 40, windowMs: MIN, message: "Too many requests in a short time. Wait a minute and try again." },
  keyCheck: { max: 10, windowMs: 10 * MIN, message: "Too many key checks in a short time. Wait a few minutes and try again." },
  export: { max: 20, windowMs: HOUR, message: "Too many exports in the last hour. Try again later." },
  // Milliseconds of fact-gate work per minute. Charged after the work; a take only checks.
  gateMs: { max: 20_000, windowMs: MIN, message: "Too many requests in a short time. Wait a minute and try again.", checkOnly: true },
  trialIp: { max: 50, windowMs: 24 * HOUR, message: "Too many free-trial requests from this network today. Try again tomorrow." },
  signInIp: { max: 20, windowMs: 10 * MIN, message: "Too many sign-in attempts. Wait a few minutes and try again." },
  emailSend: { max: 5, windowMs: HOUR, message: "Too many sign-in emails sent. Try again in an hour." },
};

/**
 * @param {{ max: number, windowMs: number }} limit
 * @param {number} usedCost cost already recorded inside the window
 * @param {number | null} oldestAtMs time of the oldest event inside the window
 * @param {number} nowMs
 * @returns {{ allowed: boolean, retryAfterS: number }}
 */
export function decide({ max, windowMs }, usedCost, oldestAtMs, nowMs) {
  if (usedCost < max) return { allowed: true, retryAfterS: 0 };
  const until = (oldestAtMs ?? nowMs) + windowMs;
  return { allowed: false, retryAfterS: Math.max(1, Math.ceil((until - nowMs) / 1000)) };
}

/** Raised when the count cannot be made. The caller refuses the request (fail closed). */
export class RateLimitUnavailableError extends Error {
  constructor() {
    super("Rolewright could not check its usage limits just now. Try again in a moment.");
    this.name = "RateLimitUnavailableError";
    this.status = 503;
    this.code = "rate_limit_unavailable";
  }
}

/** Runs a database step; any failure becomes RateLimitUnavailableError. The cause is not kept (it may carry data). */
export async function failClosed(fn) {
  try {
    return await fn();
  } catch {
    console.error("rate limit store unavailable");
    throw new RateLimitUnavailableError();
  }
}

/**
 * Runs gate work and charges its time to gateMs, whether the work returns or throws.
 * `run` gets `timed(fn)`, which times one synchronous piece of gate work. On success a
 * failed charge is an error (the caller refuses, fail closed). On an error path it is
 * swallowed so the original error (a 409, say) is not masked.
 * @param {(ms: number) => Promise<void>} spendMs
 * @param {(timed: <T>(fn: () => T) => T) => any} run
 */
export async function chargeGate(spendMs, run) {
  let ms = 0;
  const timed = (fn) => {
    const start = performance.now();
    try {
      return fn();
    } finally {
      ms += performance.now() - start;
    }
  };
  let ok = false;
  try {
    const result = await run(timed);
    ok = true;
    return result;
  } finally {
    const charge = spendMs(Math.round(ms));
    if (ok) await charge;
    else await charge.catch(() => {});
  }
}
