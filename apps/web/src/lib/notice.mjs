// Privacy notice version and the grievance contact (ADR 0004).
export const NOTICE_VERSION = "2026-11-21.1";

const EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function grievanceContact(env = process.env) {
  const name = String(env.ROLEWRIGHT_GRIEVANCE_NAME ?? "").trim();
  const email = String(env.ROLEWRIGHT_GRIEVANCE_EMAIL ?? "").trim();
  return { name, email, set: Boolean(name) && EMAIL.test(email) };
}
