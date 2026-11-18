import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { HttpError, assertSameOrigin, json, withNoStore } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withNoStore(await handlers.GET(req));
}

// Auth.js checks its own CSRF token on these posts; the origin check is the
// same second lock every other state-changing route has.
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (err) {
    if (err instanceof HttpError) {
      console.warn(`[rolewright] auth POST ${err.status} ${err.code} user=-`);
      return json({ error: { code: err.code, message: err.message } }, err.status);
    }
    throw err;
  }
  return withNoStore(await handlers.POST(req));
}
