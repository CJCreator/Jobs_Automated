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

const MAX_CACHE_SECONDS = 86400;
const FAILURE_BACKOFF_MS = 45_000;

/**
 * A key-set fetcher: caches a non-empty set for the response's max-age (at most a day),
 * shares one in-flight request, and after a failure refuses without refetching for 45 s.
 */
export function createKeyFetcher({ fetchImpl = fetch, now = Date.now } = {}) {
  let cache = null; // { keys, until }
  let inflight = null;
  let failedUntil = 0;
  const load = async () => {
    const res = await fetchImpl(CERTS_URL, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw refuse();
    const keys = await res.json();
    if (!Array.isArray(keys?.keys) || keys.keys.length === 0) throw refuse();
    const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
    const seconds = Math.min(m ? Number(m[1]) : 0, MAX_CACHE_SECONDS);
    if (seconds > 0) cache = { keys, until: now() + seconds * 1000 };
    return keys;
  };
  return async function getKeys() {
    if (cache && cache.until > now()) return cache.keys;
    if (failedUntil > now()) throw refuse();
    inflight ??= load()
      .catch((err) => {
        failedUntil = now() + FAILURE_BACKOFF_MS;
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

/** Google's key set through the shared fetcher. */
export const fetchGoogleKeys = createKeyFetcher();

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
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) throw refuse();
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
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > nowSeconds + SKEW_SECONDS)) throw refuse();
  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) throw refuse();
  if (claims.aud !== audience) throw refuse();
  if (claims.email !== email || claims.email_verified !== true) throw refuse();
  return claims;
}
