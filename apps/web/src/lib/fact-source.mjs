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

const KEPT = /[\p{L}\p{N}+#]/u;
const isDigit = (c) => c !== undefined && /\p{N}/u.test(c);

/**
 * Squash a string and note where the removed characters were.
 * Kept: lower-case letters, digits, + and #, and a "." between two digits.
 * A "," between digits is dropped first, so 1,200 and 1200 are the same.
 * `bound[i]` is true when a removed character (or the start) came before kept
 * character i; `bound[s.length]` is true.
 */
function squashMap(text) {
  const t = cleanText(String(text ?? "")).toLowerCase().replace(/(?<=\p{N}),(?=\p{N})/gu, "");
  const chars = [...t];
  let s = "";
  const bound = [];
  let gap = true;
  chars.forEach((c, i) => {
    if (KEPT.test(c) || (c === "." && isDigit(chars[i - 1]) && isDigit(chars[i + 1]))) {
      for (let k = 0; k < c.length; k++) bound.push(gap); // one entry per UTF-16 unit of s
      s += c;
      gap = false;
    } else {
      gap = true;
    }
  });
  bound.push(true);
  return { s, bound };
}

/** A string reduced to what the comparison looks at; see squashMap. */
export const squash = (s) => squashMap(s).s;

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
 * Is every non-empty field of this item present in the uploaded text, starting
 * and ending where a character was removed (so Java is not in JavaScript)?
 * @param {string} uploadText
 * @param {"contact"|"summary"|"job"|"bullet"|"education"|"skill"} kind
 * @param {any} item
 */
export function foundInUpload(uploadText, kind, item) {
  const { s, bound } = squashMap(uploadText);
  return itemFields(kind, item).every((f) => {
    for (let i = s.indexOf(f); i !== -1; i = s.indexOf(f, i + 1)) {
      if (bound[i] && bound[i + f.length]) return true;
    }
    return false;
  });
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

  // On a match the STORED item is kept whole: the key ignores punctuation and
  // fields it does not compare, and the user confirmed the stored wording, not
  // the proposed one. A "model" item (not found) is never matched.
  const settle = (kind, item, pool) => {
    if (!found(kind, item)) return { item: { ...item, source: "model", confirmed: false } };
    const match = takeMatch(pool, kind, item);
    return match
      ? { item: { ...match, source: "upload", confirmed: true }, match }
      : { item: { ...item, source: "upload", confirmed: false } };
  };

  const oldJobs = [...(Array.isArray(old.experience) ? old.experience : [])];
  const experience = proposed.experience.map((job) => {
    const { item, match } = settle("job", job, oldJobs);
    const pool = [...(match?.bullets ?? [])];
    return { ...item, bullets: job.bullets.map((b) => settle("bullet", b, pool).item) };
  });

  const oldEdu = [...(Array.isArray(old.education) ? old.education : [])];
  const oldSkills = [...(Array.isArray(old.skills) ? old.skills : [])];
  const education = proposed.education.map((e) => settle("education", e, oldEdu).item);
  const skills = proposed.skills.map((k) => settle("skill", k, oldSkills).item);

  let summary = { ...proposed.summary, confirmed: false };
  if (proposed.summary.text) {
    const ok = found("summary", proposed.summary);
    const keep = ok && takeMatch(old.summary?.confirmed === true ? [old.summary] : [], "summary", proposed.summary);
    summary = keep
      ? { ...old.summary, source: "upload", confirmed: true }
      : { ...proposed.summary, source: ok ? "upload" : "model", confirmed: false };
  }

  // The contact has more fields than are compared with the upload, so the
  // confirmation stays only when every field is as the user confirmed it.
  const same = (a, b) => (a ?? "").trim() === (b ?? "").trim();
  const oc = old.contact ?? {};
  const pc = proposed.contact;
  const sameLinks = (oc.links ?? []).length === pc.links.length && pc.links.every((l, i) => same(l, oc.links[i]));
  const keepContact =
    oc.confirmed === true &&
    ["name", "email", "phone", "location"].every((f) => same(oc[f], pc[f])) &&
    sameLinks &&
    found("contact", pc);

  return normalizeFacts(
    {
      contact: keepContact ? { ...oc, confirmed: true } : { ...pc, confirmed: false },
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

/**
 * The Fact Base without what was read from the user's resume: every item whose
 * source is not "user" (confirmed or not, upload or model). Items the user
 * typed or edited stay, with a job that has a user bullet under it. Extras,
 * the can't-confirm list and the contact stay as they are: the contact has no
 * source tracking yet.
 *
 * @param {any} facts the stored Fact Base
 * @returns {{ facts: ReturnType<typeof normalizeFacts>, removed: number, kept: number }}
 *   `removed` and `kept` count summary, jobs, bullets, education and skills
 */
export function withoutResumeFacts(facts) {
  const f = facts && typeof facts === "object" ? facts : {};
  const mine = (x) => x?.source === "user";
  const arr = (v) => (Array.isArray(v) ? v : []);
  let removed = 0;
  let kept = 0;
  const keepIf = (x) => (mine(x) ? (kept++, true) : (removed++, false));

  let summary = f.summary ?? { text: "", confirmed: false, source: "upload" };
  if (summary.text) {
    if (mine(summary)) kept++;
    else {
      removed++;
      summary = { text: "", confirmed: false, source: "upload" };
    }
  }

  const experience = [];
  for (const job of arr(f.experience)) {
    const bullets = arr(job.bullets).filter(keepIf);
    if (mine(job) || bullets.length) {
      kept++;
      experience.push({ ...job, bullets });
    } else {
      removed++;
    }
  }

  const education = arr(f.education).filter(keepIf);
  const skills = arr(f.skills).filter(keepIf);

  return {
    facts: normalizeFacts({ ...f, summary, experience, education, skills }, { trustConfirmed: true }),
    removed,
    kept,
  };
}
