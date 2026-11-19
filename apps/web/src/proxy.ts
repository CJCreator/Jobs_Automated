import { NextResponse, type NextRequest } from "next/server";

// A user's AI key lives in browser storage, so an injected inline script is
// the main way to steal one. Pages therefore get a fresh nonce on every
// request, and only scripts carrying it (Next adds it to its own) may run:
// no 'unsafe-inline' in script-src. Styles may stay inline; they cannot read
// storage. The AI providers are only ever called from the server, so
// connect-src is this origin.
//
// API routes are not matched (see the matcher): they return JSON or a PDF, and
// next.config.mjs gives them a policy that allows nothing.

const isDev = process.env.NODE_ENV !== "production";

function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced framework scripts load their own chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
  ].join("; ");

  // Next reads the nonce from the request's policy while rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API (sign-in callbacks, PDF download), not static assets.
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
