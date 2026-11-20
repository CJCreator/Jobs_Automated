// The caller's address for per-network limits, from X-Forwarded-For.
// Each proxy in front of the app appends the address it saw, so the entries nearest the
// app are the trustworthy ones and the leftmost is whatever the client claimed. With
// ROLEWRIGHT_TRUSTED_PROXY_HOPS = n extra proxies after the first, take the entry
// (1 + n) from the right. Never the leftmost.

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { strictEnv } from "./env-guard.mjs";
import { RateLimitUnavailableError } from "./rate-limit-core.mjs";

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const v = headers[name];
  return Array.isArray(v) ? v.join(",") : (v ?? null);
}

function hopsFrom(env) {
  const raw = String(env?.ROLEWRIGHT_TRUSTED_PROXY_HOPS ?? "").trim();
  return /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
}

/** @returns {string} an IPv4 or IPv6 literal, or "unknown" */
export function clientIp(headers, env = process.env) {
  const xff = header(headers, "x-forwarded-for");
  if (!xff) return "unknown";
  const parts = xff.split(",").map((p) => p.trim());
  const entry = parts[parts.length - 1 - hopsFrom(env)];
  if (!entry || !isIP(entry)) return "unknown";
  return entry.toLowerCase();
}

// Used only outside strict environments, so a local run needs no setup.
const DEV_KEY = "rolewright-dev-only-rate-limit-key-not-a-secret";
const MIN_KEY_LENGTH = 32;

function subjectKey(env) {
  const key = String(env?.ROLEWRIGHT_RATE_LIMIT_KEY ?? "").trim();
  if (key.length >= MIN_KEY_LENGTH) return key;
  if (strictEnv(env)) {
    // A short or missing key would make the hashes guessable, so refuse (fail closed, 503).
    console.error("ROLEWRIGHT_RATE_LIMIT_KEY is missing or shorter than 32 characters");
    throw new RateLimitUnavailableError();
  }
  return DEV_KEY;
}

function keyedHash(value, env) {
  return createHmac("sha256", subjectKey(env)).update(String(value)).digest("hex");
}

/** HMAC-SHA-256 hex of an address, keyed by ROLEWRIGHT_RATE_LIMIT_KEY: what is stored as a rate-limit subject. */
export function ipSubject(ip, env = process.env) {
  return keyedHash(ip, env);
}

/** The same keyed hash for an email address (trimmed and lower-cased first). */
export function emailSubject(email, env = process.env) {
  return keyedHash(String(email).trim().toLowerCase(), env);
}
