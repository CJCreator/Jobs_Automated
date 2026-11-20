// The caller's address for per-network limits, from X-Forwarded-For.
// Each proxy in front of the app appends the address it saw, so the entries nearest the
// app are the trustworthy ones and the leftmost is whatever the client claimed. With
// ROLEWRIGHT_TRUSTED_PROXY_HOPS = n extra proxies after the first, take the entry
// (1 + n) from the right. Never the leftmost.

import { createHash } from "node:crypto";
import { isIP } from "node:net";

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

/** SHA-256 hex of an address: what is stored as a rate-limit subject. */
export function ipSubject(ip) {
  return createHash("sha256").update(String(ip)).digest("hex");
}
