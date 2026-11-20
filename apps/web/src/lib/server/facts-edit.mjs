// Saving the facts page.
//
// The page sends the whole Fact Base back. Everything in it is the user's own
// edit except the "can't confirm" list: that list only grows from review
// actions, and a tab opened before such an action would send a copy without
// the new entry. Taking the list from the body would quietly undo "I can't
// confirm this", which is the one thing that must never happen by accident.
// So the stored list is kept, and an entry leaves it only when the request
// names it in `removeCannotConfirm`.

import { contentKey } from "../fact-source.mjs";
import { normalizeFacts } from "../facts.mjs";

export const MAX_REMOVALS = 200;
const MAX_REMOVAL_LENGTH = 200;

const key = (s) => String(s).trim().toLowerCase();

/**
 * The `removeCannotConfirm` field of a request body.
 * @param {unknown} value
 * @returns {string[] | null} the entries to remove (empty when the field is
 *   absent), or null when the field is present but not a list of strings.
 */
export function parseRemovals(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_REMOVALS) return null;
  if (!value.every((v) => typeof v === "string" && v.length <= MAX_REMOVAL_LENGTH)) return null;
  return value;
}

/**
 * The Fact Base to save from a facts-page edit.
 *
 * @param {any} stored the Fact Base as it is in the database now
 * @param {any} incoming the body's `facts`; its confirmations are trusted, its
 *   `cannotConfirm` is ignored
 * @param {string[]} removals entries to take off the stored "can't confirm"
 *   list, matched without regard to case or surrounding spaces; entries that
 *   match nothing are ignored
 */
export function applyFactsEdit(stored, incoming, removals) {
  const out = applyEdit(stored, incoming, removals);
  return keepModelLabels(stored, out);
}

/**
 * An item the AI proposed that the upload does not contain is labelled
 * "model". The page cannot clear that label by changing ids. An incoming item
 * is "model" when its content equals any stored model item's of that kind. An
 * incoming "upload" is honoured only for a stored item with the same id, the
 * same content and source "upload". Anything else is "user".
 */
function keepModelLabels(stored, facts) {
  const relabel = (kind, items, old) => {
    const olds = (Array.isArray(old) ? old : []).filter((x) => x && typeof x === "object");
    const modelKeys = new Set(olds.filter((x) => x.source === "model").map((x) => contentKey(kind, x)).filter(Boolean));
    return items.map((item) => {
      const key = contentKey(kind, item);
      if (key && modelKeys.has(key)) return { ...item, source: "model" };
      if (item.source === "upload" && olds.some((x) => x.id === item.id && x.source === "upload" && contentKey(kind, x) === key)) return item;
      return { ...item, source: "user" };
    });
  };
  const oldJobs = Array.isArray(stored?.experience) ? stored.experience : [];
  const oldBullets = oldJobs.flatMap((j) => (Array.isArray(j?.bullets) ? j.bullets : []));
  const [summary] = relabel("summary", [facts.summary], stored?.summary ? [{ ...stored.summary, id: undefined }] : []);
  return {
    ...facts,
    summary,
    experience: relabel("job", facts.experience, oldJobs).map((j) => ({ ...j, bullets: relabel("bullet", j.bullets, oldBullets) })),
    education: relabel("education", facts.education, stored?.education),
    skills: relabel("skill", facts.skills, stored?.skills),
  };
}

function applyEdit(stored, incoming, removals) {
  const drop = new Set(removals.map(key));
  const kept = (Array.isArray(stored?.cannotConfirm) ? stored.cannotConfirm : []).filter(
    (c) => typeof c === "string" && !drop.has(key(c)),
  );
  return normalizeFacts({ ...incoming, cannotConfirm: kept }, { trustConfirmed: true });
}
