// Rate-limit rules, with no database and no framework so they can be tested alone.
// `max` and `cost` count whatever the bucket counts: requests, or milliseconds for gateMs.

const MIN = 60_000;
const HOUR = 60 * MIN;

export const LIMITS = {
  ai: { max: 20, windowMs: MIN, message: "Too many AI requests in a short time. Wait a minute and try again." },
  upload: { max: 10, windowMs: HOUR, message: "Too many uploads in the last hour. Try again later." },
  // Reading a tailoring, a review action and an export each run the fact gate on every suggestion.
  tailoring: { max: 40, windowMs: MIN, message: "Too many requests in a short time. Wait a minute and try again." },
  keyCheck: { max: 10, windowMs: 10 * MIN, message: "Too many key checks in a short time. Wait a few minutes and try again." },
  export: { max: 20, windowMs: HOUR, message: "Too many exports in the last hour. Try again later." },
  // Milliseconds of fact-gate work per minute. Charged after the work; a take only checks.
  gateMs: { max: 20_000, windowMs: MIN, message: "Too many requests in a short time. Wait a minute and try again.", checkOnly: true },
  trialIp: { max: 10, windowMs: 24 * HOUR, message: "Too many free-trial requests from this network today. Try again tomorrow." },
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
    super("The rate limit could not be checked.");
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
    throw new RateLimitUnavailableError();
  }
}
