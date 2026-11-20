// The user's optional segment (PLAN "Who it's for"). It only picks which tip is shown; nothing depends on it.
// One fixed statement each, keyed by the session user id; the value is one of three ids or null.

export const SEGMENTS = Object.freeze(["fresher", "experienced", "switcher"]);

export function isSegment(value) {
  return typeof value === "string" && SEGMENTS.includes(value);
}

export async function getSegment(db, userId) {
  const { rows } = await db.system.query("SELECT segment FROM users WHERE id = $1", [userId]);
  return rows[0]?.segment ?? null;
}

/** Stores one of the three ids, or null to clear it. Anything else throws TypeError and writes nothing. */
export async function setSegment(db, userId, segment) {
  if (segment !== null && !isSegment(segment)) throw new TypeError("segment must be fresher, experienced, switcher or null");
  await db.system.query("UPDATE users SET segment = $2 WHERE id = $1", [userId, segment]);
}
