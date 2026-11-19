// Where each proposed fact came from.
//
// The AI that reads an uploaded resume can add things the resume does not say.
// Every proposed item is looked for in the uploaded text; one that is not
// there is labelled source "model", and the facts page will not bulk-confirm
// it. On a re-upload, items that have not changed keep their id and their
// confirmation.
//
// Pure functions, no I/O.

import { cleanText } from "./claims.mjs";
import { normalizeFacts } from "./facts.mjs";

/** Lower-case letters and digits only, so line breaks, hyphen breaks and spacing do not matter. */
export const squash = (s) => cleanText(String(s ?? "")).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The fields of an item that are compared with the upload, by kind. */
const FIELDS = {
  contact: ["name", "email"],
  summary: ["text"],
  job: ["company", "title", "start", "end"],
  bullet: ["text"],
  education: ["school", "degree", "field", "year"],
  skill: ["name"],
};

/** The non-empty compared fields of an item, squashed. */
export function itemFields(kind, item) {
  return (FIELDS[kind] ?? []).map((f) => squash(item?.[f])).filter(Boolean);
}

/** One string for an item's compared fields; equal strings mean equal content. */
export const contentKey = (kind, item) => itemFields(kind, item).join("|");

/**
 * Is every non-empty field of this item present in the uploaded text?
 * @param {string} uploadText
 * @param {"contact"|"summary"|"job"|"bullet"|"education"|"skill"} kind
 * @param {any} item
 */
export function foundInUpload(uploadText, kind, item) {
  const hay = squash(uploadText);
  return itemFields(kind, item).every((f) => hay.includes(f));
}

/**
 * Take the existing confirmed item with the same content, once.
 * @returns the existing item, or undefined
 */
function takeMatch(pool, kind, item) {
  const key = contentKey(kind, item);
  if (!key) return undefined;
  const i = pool.findIndex((x) => x.confirmed === true && contentKey(kind, x) === key);
  return i === -1 ? undefined : pool.splice(i, 1)[0];
}

/**
 * The Fact Base to store after an upload.
 *
 * @param {any} existing the stored Fact Base
 * @param {ReturnType<typeof normalizeFacts>} proposed the AI's proposal, normalised with every item unconfirmed
 * @param {string} uploadText the text of the uploaded file
 */
export function reconcileUpload(existing, proposed, uploadText) {
  const old = existing && typeof existing === "object" ? existing : {};
  const found = (kind, item) => foundInUpload(uploadText, kind, item);

  // Keep an old item's identity only when the new item is found in the upload
  // and the user had confirmed identical content. A "model" item never is.
  const settle = (kind, item, pool) => {
    const ok = found(kind, item);
    const match = ok ? takeMatch(pool, kind, item) : undefined;
    return { ...item, source: ok ? "upload" : "model", ...(match ? { id: match.id, confirmed: true } : { confirmed: false }), _match: match };
  };

  const oldJobs = [...(Array.isArray(old.experience) ? old.experience : [])];
  const experience = proposed.experience.map((job) => {
    const j = settle("job", job, oldJobs);
    const pool = [...(j._match?.bullets ?? [])];
    const bullets = job.bullets.map((b) => {
      const { _match, ...rest } = settle("bullet", b, pool);
      void _match;
      return rest;
    });
    const { _match, ...rest } = j;
    void _match;
    return { ...rest, bullets };
  });

  const strip = (x) => { const { _match, ...rest } = x; void _match; return rest; };
  const oldEdu = [...(Array.isArray(old.education) ? old.education : [])];
  const oldSkills = [...(Array.isArray(old.skills) ? old.skills : [])];
  const education = proposed.education.map((e) => strip(settle("education", e, oldEdu)));
  const skills = proposed.skills.map((s) => strip(settle("skill", s, oldSkills)));

  const summary = proposed.summary.text
    ? (() => {
        const oldSummary = old.summary?.confirmed === true ? [old.summary] : [];
        const ok = found("summary", proposed.summary);
        const keep = ok && takeMatch(oldSummary, "summary", proposed.summary);
        return { ...proposed.summary, source: ok ? "upload" : "model", confirmed: Boolean(keep) };
      })()
    : { ...proposed.summary, confirmed: false };

  const keepContact =
    old.contact?.confirmed === true &&
    contentKey("contact", old.contact) === contentKey("contact", proposed.contact) &&
    found("contact", proposed.contact);

  return normalizeFacts(
    {
      contact: { ...proposed.contact, confirmed: keepContact },
      summary,
      experience,
      education,
      skills,
      extras: old.extras ?? [],
      cannotConfirm: old.cannotConfirm ?? [],
    },
    { trustConfirmed: true },
  );
}
