// Event analytics (ADR 0010, 0016): four named events per user, counts only, never content.
// Props are checked against a frozen allowlist before anything is stored: only a provider id,
// a fixed reason, and two coverage percentages can be recorded. Rows are added, never changed;
// the app role has no UPDATE or DELETE on the table.

import { PROVIDERS } from "../llm/providers.mjs";

export const EVENT_NAMES = Object.freeze(["resume_uploaded", "tailoring_created", "export_succeeded", "export_blocked"]);
export const REASONS = Object.freeze(["fact_gate", "facts_too_large", "nothing_confirmed"]);
const PROVIDER_IDS = Object.freeze([...PROVIDERS.map((p) => p.id), "trial", "mock"]);

const isPercent = (v) => Number.isInteger(v) && v >= 0 && v <= 100;

// One check per allowed key. Every other key is refused.
const PROP_CHECKS = Object.freeze({
  provider: (v) => typeof v === "string" && PROVIDER_IDS.includes(v),
  reason: (v) => typeof v === "string" && REASONS.includes(v),
  coverage_before: isPercent,
  coverage_after: isPercent,
});

/** Returns a clean copy of props, or throws TypeError. Never echoes a value in the message. */
export function cleanProps(props = {}) {
  if (props === null || typeof props !== "object" || Array.isArray(props)) throw new TypeError("Event props must be an object.");
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    const check = Object.hasOwn(PROP_CHECKS, key) ? PROP_CHECKS[key] : null;
    if (!check) throw new TypeError("Event props may only hold provider, reason, coverage_before and coverage_after.");
    if (!check(value)) throw new TypeError(`Event prop ${key} has a value that is not allowed.`);
    out[key] = value;
  }
  return out;
}

/** Records one event for the user. */
export async function recordEvent(db, userId, name, props = {}) {
  if (typeof name !== "string" || !EVENT_NAMES.includes(name)) throw new TypeError("Unknown event name.");
  const clean = cleanProps(props);
  await db.withUser(userId, (q) =>
    q.query("INSERT INTO events (user_id, name, props) VALUES ($1, $2, $3::jsonb)", [userId, name, JSON.stringify(clean)]),
  );
}

/** The user's own events, oldest first. */
export async function listEvents(db, userId) {
  const { rows } = await db.withUser(userId, (q) =>
    q.query("SELECT name, props, at FROM events WHERE user_id = $1 ORDER BY at, id", [userId]),
  );
  return rows;
}
