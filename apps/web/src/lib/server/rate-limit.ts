// In-memory sliding-window limits per user. Per process only: with more than
// one server process, each keeps its own counts, so this must move to a
// shared store (Redis or the database) before scaling out.

import { HttpError } from "./http";

const KEY = Symbol.for("rolewright.rateLimit");
const MAX_KEYS = 50_000;

type Store = Map<string, number[]>;

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  return (g[KEY] ??= new Map());
}

export const LIMITS = {
  ai: { max: 20, windowMs: 60_000, message: "Too many AI requests in a short time. Wait a minute and try again." },
  upload: { max: 10, windowMs: 60 * 60_000, message: "Too many uploads in the last hour. Try again later." },
  // Reading a tailoring, a review action and an export each run the fact gate on every suggestion.
  tailoring: { max: 40, windowMs: 60_000, message: "Too many requests in a short time. Wait a minute and try again." },
} as const;

/** Count one request against a limit, or throw a 429 when it is used up. */
export function takeRateLimit(bucket: keyof typeof LIMITS, userId: string): void {
  const { max, windowMs, message } = LIMITS[bucket];
  const s = store();
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const recent = (s.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    s.set(key, recent);
    const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    throw new HttpError(429, "too_many_requests", message, undefined, { "Retry-After": String(retryAfter) });
  }
  recent.push(now);
  s.set(key, recent);
  if (s.size > MAX_KEYS) {
    for (const [k, times] of s) {
      if (!times.length || now - times[times.length - 1] > 60 * 60_000) s.delete(k);
    }
  }
}
