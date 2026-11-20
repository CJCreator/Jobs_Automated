import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { HttpError, assertSameOrigin, json, withNoStore } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
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
    throw err;
  }
}
