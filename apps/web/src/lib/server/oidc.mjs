// Verifies a Google-signed OpenID Connect ID token (the kind Cloud Scheduler
// attaches to a request). node:crypto only; RS256 only. Every failure throws
// an OidcError whose message names no token content.

import { createPublicKey, createVerify } from "node:crypto";

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const SKEW_SECONDS = 60;

export class OidcError extends Error {
  constructor(message = "Token refused.") {
    super(message);
    this.name = "OidcError";
  }
}

const refuse = () => new OidcError();

let cache = null; // { keys, until }

/** Google's key set, cached for the response's max-age. */
export async function fetchGoogleKeys() {
  if (cache && cache.until > Date.now()) return cache.keys;
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw refuse();
  const keys = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
  const seconds = m ? Number(m[1]) : 0;
  if (seconds > 0) cache = { keys, until: Date.now() + seconds * 1000 };
  return keys;
}

function decode(part) {
  try {
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} token
 * @param {{ audience: string, email: string, getKeys?: () => Promise<{ keys: object[] }>, now?: () => number }} opts
 * @returns {Promise<object>} the verified claims
 */
export async function verifyGoogleOidc(token, { audience, email, getKeys = fetchGoogleKeys, now = Date.now } = {}) {
  if (typeof token !== "string" || !audience || !email) throw refuse();
  const parts = token.split(".");
  if (parts.length !== 3) throw refuse();
  const header = decode(parts[0]);
  const claims = decode(parts[1]);
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") throw refuse();

  let jwk;
  try {
    jwk = ((await getKeys())?.keys ?? []).find((k) => k && k.kid === header.kid && k.kty === "RSA");
  } catch {
    throw refuse();
  }
  if (!jwk) throw refuse();

  let valid = false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    valid = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(key, Buffer.from(parts[2], "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) throw refuse();

  const nowSeconds = now() / 1000;
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) throw refuse();
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + SKEW_SECONDS) throw refuse();
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw refuse();
  if (claims.aud !== audience) throw refuse();
  if (claims.email !== email || claims.email_verified !== true) throw refuse();
  return claims;
}
