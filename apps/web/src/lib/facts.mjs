// The Fact Base: what a user has confirmed is true about their own career.
//
// Parsing a resume only ever produces PROPOSED facts. Nothing counts until the
// user confirms it, and only confirmed facts are used as evidence when tailored
// text is checked or a resume is exported.
//
// Pure functions, no I/O.

// The Web Crypto global exists in Node and in browsers, so this file can be
// imported from either side.
const randomUUID = () => globalThis.crypto.randomUUID();

const str = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v) => (Array.isArray(v) ? v : []);
// A client can send two items with the same id; a suggestion ref would then
// point at both, so a repeated id is replaced with a fresh one.
const idMaker = () => {
  const used = new Set();
  return (v) => {
    let out = typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : randomUUID();
    while (used.has(out)) out = randomUUID();
    used.add(out);
    return out;
  };
};
// "model": the AI proposed it and the uploaded text does not contain it.
const src = (v) => (v === "user" || v === "model" ? v : "upload");

/** An empty Fact Base. */
export function emptyFacts() {
  return {
    contact: { name: "", email: "", phone: "", location: "", links: [], confirmed: false },
    summary: { text: "", confirmed: false, source: "upload" },
    experience: [],
    education: [],
    skills: [],
    extras: [],
    cannotConfirm: [],
  };
}

/**
 * Coerce untrusted input (a model's JSON, or a client's edited copy) into the
 * Fact Base shape. Unknown keys are dropped, strings are trimmed and capped,
 * and every item gets an id.
 *
 * @param {any} raw
 * @param {{ trustConfirmed?: boolean }} [opts] when false (parser output), every
 *   item is forced back to unconfirmed regardless of what the input claims.
 */
export function normalizeFacts(raw, { trustConfirmed = false } = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const ok = (v) => (trustConfirmed ? v === true : false);
  const id = idMaker();
  const contact = input.contact && typeof input.contact === "object" ? input.contact : {};
  const summary = typeof input.summary === "string" ? { text: input.summary } : (input.summary ?? {});
  return {
    contact: {
      name: str(contact.name, 200),
      email: str(contact.email, 200),
      phone: str(contact.phone, 60),
      location: str(contact.location, 200),
      links: list(contact.links).map((l) => str(l, 300)).filter(Boolean).slice(0, 8),
      confirmed: ok(contact.confirmed),
    },
    summary: { text: str(summary.text, 1500), confirmed: ok(summary.confirmed), source: src(summary.source) },
    experience: list(input.experience).slice(0, 30).map((e) => ({
      id: id(e?.id),
      company: str(e?.company, 200),
      title: str(e?.title, 200),
      location: str(e?.location, 200),
      start: str(e?.start, 40),
      end: str(e?.end, 40),
      confirmed: ok(e?.confirmed),
      source: src(e?.source),
      bullets: list(e?.bullets).slice(0, 25).map((b) => {
        const bullet = typeof b === "string" ? { text: b } : (b ?? {});
        return { id: id(bullet.id), text: str(bullet.text, 600), confirmed: ok(bullet.confirmed), source: src(bullet.source) };
      }).filter((b) => b.text),
    })).filter((e) => e.company || e.title),
    education: list(input.education).slice(0, 12).map((e) => ({
      id: id(e?.id),
      school: str(e?.school, 200),
      degree: str(e?.degree, 200),
      field: str(e?.field, 200),
      year: str(e?.year, 40),
      confirmed: ok(e?.confirmed),
      source: src(e?.source),
    })).filter((e) => e.school || e.degree),
    skills: list(input.skills).slice(0, 80).map((s) => {
      const skill = typeof s === "string" ? { name: s } : (s ?? {});
      return { id: id(skill.id), name: str(skill.name, 80), confirmed: ok(skill.confirmed), source: src(skill.source) };
    }).filter((s) => s.name),
    extras: list(input.extras).slice(0, 60).map((x) => ({
      id: id(x?.id),
      text: str(x?.text, 600),
      confirmed: ok(x?.confirmed),
      source: "user",
      statedAt: str(x?.statedAt, 40),
    })).filter((x) => x.text),
    cannotConfirm: [...new Set(list(input.cannotConfirm).map((c) => str(c, 200)).filter(Boolean))].slice(0, 200),
  };
}

/** How many items are confirmed, and how many exist. */
export function confirmationCounts(facts) {
  let confirmed = 0;
  let total = 0;
  const count = (item) => { total++; if (item.confirmed) confirmed++; };
  if (facts.contact.name || facts.contact.email) count(facts.contact);
  if (facts.summary.text) count(facts.summary);
  for (const e of facts.experience) { count(e); e.bullets.forEach(count); }
  facts.education.forEach(count);
  facts.skills.forEach(count);
  facts.extras.forEach(count);
  return { confirmed, total };
}

const dates = (e) => [e.start, e.end].filter(Boolean).join(" – ");

/**
 * Serialise the CONFIRMED facts as the evidence text the claim checks read.
 * Unconfirmed items are left out entirely: a proposed fact is not evidence.
 *
 * The layout follows the engine's cv.md convention (an Experience section, a
 * `### Company — Location` heading, a bold title line, a dates line) because
 * the engine's fact gate finds jobs and skills by those headings.
 */
export function factBaseText(facts) {
  const out = [];
  if (facts.contact.confirmed) {
    if (facts.contact.name) out.push(`# ${facts.contact.name}`);
    const details = [facts.contact.email, facts.contact.phone, facts.contact.location, ...facts.contact.links].filter(Boolean).join(" | ");
    if (details) out.push(details);
  }
  if (facts.summary.confirmed && facts.summary.text) out.push("", "## Summary", facts.summary.text);
  const jobs = facts.experience.filter((e) => e.confirmed);
  if (jobs.length) out.push("", "## Experience");
  for (const e of jobs) {
    out.push("", `### ${e.company}${e.location ? ` — ${e.location}` : ""}`, `**${e.title}**`, dates(e));
    for (const b of e.bullets) if (b.confirmed) out.push(`- ${b.text}`);
  }
  const schools = facts.education.filter((e) => e.confirmed);
  if (schools.length) out.push("", "## Education");
  for (const e of schools) out.push(`- ${[e.degree, e.field, e.school, e.year].filter(Boolean).join(", ")}`);
  const skills = facts.skills.filter((s) => s.confirmed);
  if (skills.length) out.push("", "## Skills", skills.map((s) => s.name).join(", "));
  const extras = facts.extras.filter((x) => x.confirmed);
  if (extras.length) out.push("", "## Additional facts stated by the candidate", ...extras.map((x) => `- ${x.text}`));
  return out.join("\n").trim();
}

/**
 * The lines an AI may propose rewrites for: confirmed bullets and the confirmed
 * summary. Employers, titles, dates, education and skills are never rewritten;
 * they are rendered straight from the Fact Base.
 *
 * @returns {{ ref: string, kind: 'bullet'|'summary', context: string, text: string }[]}
 */
export function tailorableLines(facts) {
  const lines = [];
  if (facts.summary.confirmed && facts.summary.text) {
    lines.push({ ref: "summary", kind: "summary", context: "Summary", text: facts.summary.text });
  }
  for (const e of facts.experience) {
    if (!e.confirmed) continue;
    for (const b of e.bullets) {
      if (b.confirmed) lines.push({ ref: `bullet:${e.id}:${b.id}`, kind: "bullet", context: `${e.title}, ${e.company}`, text: b.text });
    }
  }
  return lines;
}

/**
 * Build the resume to export: confirmed facts, with each ACCEPTED suggestion's
 * final text in place of the line it targets.
 *
 * @param {ReturnType<typeof normalizeFacts>} facts
 * @param {{ ref: string, decision: string, finalText?: string, after?: string }[]} suggestions
 */
export function buildResume(facts, suggestions = []) {
  const accepted = new Map();
  for (const s of suggestions) {
    if (s.decision === "accepted") accepted.set(s.ref, str(s.finalText ?? s.after, 1500));
  }
  const changed = [];
  const pick = (ref, original) => {
    const text = accepted.get(ref);
    if (text && text !== original) { changed.push({ ref, before: original, after: text }); return text; }
    return original;
  };
  const resume = {
    contact: facts.contact.confirmed ? { ...facts.contact } : null,
    summary: facts.summary.confirmed && facts.summary.text ? pick("summary", facts.summary.text) : "",
    experience: facts.experience.filter((e) => e.confirmed).map((e) => ({
      company: e.company, title: e.title, location: e.location, dates: dates(e),
      bullets: e.bullets.filter((b) => b.confirmed).map((b) => pick(`bullet:${e.id}:${b.id}`, b.text)),
    })),
    education: facts.education.filter((e) => e.confirmed).map((e) => [e.degree, e.field, e.school, e.year].filter(Boolean).join(", ")),
    skills: facts.skills.filter((s) => s.confirmed).map((s) => s.name),
  };
  return { resume, changed };
}

/** Plain-text rendering of a built resume, used for whole-document checks. */
export function resumeText(resume) {
  const out = [];
  if (resume.contact) out.push(resume.contact.name);
  if (resume.summary) out.push(resume.summary);
  for (const e of resume.experience) out.push(`${e.title}, ${e.company}`, e.dates, ...e.bullets.map((b) => `- ${b}`));
  out.push(...resume.education, resume.skills.join(", "));
  return out.filter(Boolean).join("\n");
}
