// Rate limits counted in Postgres (table rate_events), so they hold across server
// instances. If the count cannot be made the request is refused (503), never allowed.

import { getDb } from "@/lib/db/index.mjs";
import { spend, take } from "@/lib/db/rate-events.mjs";
import { HttpError } from "./http";
import { LIMITS, RateLimitUnavailableError, failClosed } from "./rate-limit-core.mjs";

export { LIMITS };
export type Bucket = keyof typeof LIMITS;

const unavailable = () => new HttpError(503, "rate_limit_unavailable", "Rolewright could not check its usage limits just now. Try again in a moment.");

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await failClosed(async () => fn());
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) throw unavailable();
    throw err;
  }
}

/**
 * Count one request against a limit, or throw a 429 when it is used up.
 * The subject is a user id or a hash of an IP or email address. A bucket that is
 * charged afterwards (gateMs) is only checked here.
 */
export async function takeRateLimit(bucket: Bucket, subject: string): Promise<void> {
  const limit = LIMITS[bucket];
  const cost = "checkOnly" in limit && limit.checkOnly ? 0 : 1;
  const verdict = await guarded(async () => take(await getDb(), bucket, subject, cost, limit));
  if (!verdict.allowed) {
    throw new HttpError(429, "too_many_requests", limit.message, undefined, { "Retry-After": String(verdict.retryAfterS) });
  }
}

/** Record a cost (for example milliseconds of gate work) after the work is done. */
export async function spendRateLimit(bucket: Bucket, subject: string, cost: number): Promise<void> {
  await guarded(async () => spend(await getDb(), bucket, subject, cost));
}
