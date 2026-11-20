// Who may sign in. Pure (the environment is passed in) so it can be tested
// without a server. ROLEWRIGHT_SIGNUPS picks the mode and
// ROLEWRIGHT_SIGNUP_ALLOWLIST lists the addresses admitted in "allowlist" mode.

import { strictEnv } from "./env-guard.mjs";

export const SIGNUP_MODES = ["closed", "allowlist", "open"];

const ADDRESS = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[a-z]{2,}$/;
const DOMAIN_ENTRY = /^@[^\s@<>()[\]\\,;:"]{1,190}\.[a-z]{2,}$/;

/**
 * The sign-up mode. An unset or unrecognised value is "allowlist" on a strict
 * environment and "open" elsewhere.
 * @param {Record<string, string | undefined>} env
 * @returns {"closed" | "allowlist" | "open"}
 */
export function signupMode(env) {
  const raw = String(env.ROLEWRIGHT_SIGNUPS ?? "").trim().toLowerCase();
  if (SIGNUP_MODES.includes(raw)) return /** @type {"closed" | "allowlist" | "open"} */ (raw);
  return strictEnv(env) ? "allowlist" : "open";
}

/**
 * The allowlist: full addresses and "@domain" entries, lower-cased. Malformed
 * entries are dropped.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function parseAllowlist(env) {
  return String(env.ROLEWRIGHT_SIGNUP_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => ADDRESS.test(e) || DOMAIN_ENTRY.test(e));
}

/** @param {string} email lower-cased, trimmed */
function onList(email, list) {
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at); // includes "@"
  return list.some((entry) => (entry.startsWith("@") ? entry === domain : entry === email));
}

/**
 * Whether this address may sign in.
 * @param {{ email?: string | null, existingUser: boolean }} who
 * @param {Record<string, string | undefined>} env
 */
export function maySignIn({ email, existingUser }, env) {
  const mode = signupMode(env);
  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return false;
  if (mode === "open") return true;
  if (mode === "closed") return Boolean(existingUser);
  return onList(address, parseAllowlist(env));
}
