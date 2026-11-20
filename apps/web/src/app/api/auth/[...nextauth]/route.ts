import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { HttpError, assertSameOrigin, json, withNoStore } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { RateLimitUnavailableError } from "@/lib/server/rate-limit-core.mjs";
import { gateSignInPost } from "@/lib/server/signin-limit.mjs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withNoStore(await handlers.GET(req));
}

// Auth.js checks its own CSRF token on these posts; the origin check is the
// same second lock every other state-changing route has.
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    // Counted per IP before Auth.js sees the request, so a refused attempt creates no token and
    // sends no email. GET (session reads, callbacks) is not counted.
    return withNoStore(await gateSignInPost({ headers: req.headers, take: takeRateLimit, handler: () => handlers.POST(req) }));
  } catch (err) {
    if (err instanceof HttpError) {
      console.warn(`[rolewright] auth POST ${err.status} ${err.code} user=-`);
      return json({ error: { code: err.code, message: err.message } }, err.status, err.headers);
    }
    // ipSubject throws this before the limiter runs, so takeRateLimit's own mapping never sees it.
    if (err instanceof RateLimitUnavailableError) {
      console.warn("[rolewright] auth POST 503 rate_limit_unavailable user=-");
      return json({ error: { code: "rate_limit_unavailable", message: "Rolewright could not check its usage limits just now. Try again in a moment." } }, 503);
    }
    throw err;
  }
}
