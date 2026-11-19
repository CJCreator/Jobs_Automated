// Privacy notice version and the grievance contact (ADR 0004).
export const NOTICE_VERSION = "2026-11-19.1";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function grievanceContact(env = process.env) {
  const name = String(env.ROLEWRIGHT_GRIEVANCE_NAME ?? "").trim();
  const email = String(env.ROLEWRIGHT_GRIEVANCE_EMAIL ?? "").trim();
  return { name, email, set: Boolean(name) && EMAIL.test(email) };
}
