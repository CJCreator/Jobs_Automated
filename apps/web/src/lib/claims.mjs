// Strict claim check for tailored resume text.
//
// The engine's fact gate (verify-cv-facts.mjs) blocks an invented percentage or
// tool, but a probe showed it passes an inflated head-count ("team of 12" when
// the source says 4) and every Indian money format (₹ crore, lakh, LPA, Rs.).
// For a product whose promise is "nothing here was made up", those are the
// claims that matter most. This module is the stricter layer on top:
//
//   1. every number, with its unit, must appear in the user's confirmed facts;
//   2. every name-shaped word (capitalised, acronym, mixed letters and digits)
//      must appear in the user's confirmed facts;
//   3. every credential, seniority, scope and expertise word ("certified",
//      "principal", "global", "expert", ...) must appear in the user's confirmed
//      facts, in any letter case, anywhere in the line;
//   4. anything the user marked "I can't confirm" is blocked for good.
//
// It errs towards flagging. A false flag costs the user one click to attest a
// true fact; a false pass puts an invented claim in front of an employer.
//
// Covered: invented figures; capitalised or mixed names; and the claim words in
// CLAIM_FAMILIES, whole-word and case-insensitive ("global", "Global",
// "GLOBAL"), where a word is supported by any form of its family in the facts.
// Not covered (by design, because closing them would flag honest rewording):
// lower-case tool names ("python"), claim words outside the lists ("lead",
// "specialist", "experienced"), and vague multipliers ("doubled", "half the
// time"). The engine gate catches some of these; the user's review is the
// backstop for the rest.
//
// Pure functions, no I/O, so `node --test` can import this file directly.

const CURRENCY_PREFIX = {
  "₹": "INR", "rs": "INR", "rs.": "INR", "inr": "INR",
  "$": "USD", "usd": "USD", "us$": "USD",
  "€": "EUR", "eur": "EUR",
  "£": "GBP", "gbp": "GBP",
  "aed": "AED", "sgd": "SGD", "s$": "SGD", "aud": "AUD", "a$": "AUD", "cad": "CAD", "c$": "CAD",
  "sar": "SAR", "qar": "QAR",
};

// A currency named after the figure ("20 million rupees", "5 crore ₹").
const CURRENCY_WORD = {
  rupee: "INR", rupees: "INR", rs: "INR", inr: "INR", "₹": "INR",
  usd: "USD", dollar: "USD", dollars: "USD",
  euro: "EUR", euros: "EUR", eur: "EUR", "€": "EUR",
  pound: "GBP", pounds: "GBP", gbp: "GBP", "£": "GBP",
  "$": "USD",
};

// Suffix → [scale, unit class it implies or null].
const SUFFIX = {
  "%": [1, "percent"], "percent": [1, "percent"], "pct": [1, "percent"],
  "x": [1, "times"],
  "k": [1e3, null], "m": [1e6, null], "mn": [1e6, null], "million": [1e6, null],
  "b": [1e9, null], "bn": [1e9, null], "billion": [1e9, null],
  "lakh": [1e5, "money:INR"], "lakhs": [1e5, "money:INR"], "lac": [1e5, "money:INR"], "lacs": [1e5, "money:INR"],
  "crore": [1e7, "money:INR"], "crores": [1e7, "money:INR"], "cr": [1e7, "money:INR"],
  "lpa": [1e5, "money:INR"],
};

const NUMBER_RE = new RegExp(
  // currency prefix (optional)
  "(?<prefix>₹|\\$|€|£|(?<![\\p{L}\\p{N}])(?:Rs\\.?|INR|USD|US\\$|EUR|GBP|AED|SGD|S\\$|AUD|A\\$|CAD|C\\$|SAR|QAR)(?![\\p{L}]))?\\s?" +
  // the number itself, not glued to a preceding letter or digit (B2B, Web3, v2)
  // Punctuation is allowed before it, or "Rs.75" would never be read at all.
  "(?<![\\p{L}\\p{N}])(?<num>\\d[\\d,]*(?:\\.\\d+)?)" +
  // unit suffix (optional)
  "(?:\\s?(?<suffix>%|percent\\b|pct\\b|lakhs?\\b|lacs?\\b|crores?\\b|cr\\b|LPA\\b|million\\b|billion\\b|mn\\b|bn\\b|[kKmMbBxX](?![\\p{L}\\p{N}])))?" +
  // currency named after the figure (optional)
  "(?:\\s?(?<post>rupees?\\b|inr\\b|usd\\b|dollars?\\b|euros?\\b|eur\\b|gbp\\b|pounds?\\b|₹|€|£|\\$))?",
  "giu",
);

// Digits of other scripts that read as the same number to a human.
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

/**
 * Make look-alike input comparable: compatibility forms (full-width digits,
 * non-breaking spaces), Indic digits, and invisible format characters that
 * could hide a figure from the matcher ("₹5<zero-width space> crore").
 *
 * @param {string} text
 */
export function cleanText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\p{Nd}/gu, (ch) => {
      const cp = ch.codePointAt(0);
      if (cp < 128) return ch;
      for (const zero of DIGIT_ZEROS) if (cp >= zero && cp < zero + 10) return String(cp - zero);
      return ch;
    })
    .replace(/\p{Zs}/gu, " ");
}

const UNIT_PATTERN = "%|percent|pct|lakhs?|lacs?|crores?|cr|lpa|mn|bn|million|billion|k|m|x";

/** `cleanText` plus the rewrites that make equal figures spell equally. */
function prepNumbers(text) {
  return cleanText(text)
    .replace(/\bper\s?cent\b/gi, "percent")
    // "1st", "2nd quarter": ordinals are positions, not counts.
    .replace(/(?<![\p{L}\p{N}])\d+(?:st|nd|rd|th)(?![\p{L}\p{N}])/giu, " ")
    // "30-45%": both ends are figures in the same unit.
    .replace(
      new RegExp(
        `(₹|\\$|€|£|(?<![\\p{L}\\p{N}])(?:Rs\\.?|INR|USD)\\s?)?(\\d[\\d,]*(?:\\.\\d+)?)\\s?(?:-|–|—|to)\\s?(\\d[\\d,]*(?:\\.\\d+)?)(\\s?(?:${UNIT_PATTERN}))(?![\\p{L}\\p{N}])`,
        "giu",
      ),
      (_m, cur = "", a, b, unit) => `${cur}${a}${unit} ${cur}${b}${unit}`,
    );
}

const NUMBER_WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  thousand: 1000, dozen: 12,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNITS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
// Vague amounts still say "more than a few"; the same word in the facts clears them.
const VAGUE_AMOUNTS = new Set(["hundreds", "thousands", "millions", "billions", "dozens"]);

/** True for "1,50,000" style grouping, which only ever means rupees. */
const INDIAN_GROUPING = /^\d{1,2}(?:,\d{2})+,\d{3}$/;

/** The numeric matches in already-prepared text. */
function scanNumbers(prepared) {
  const claims = [];
  for (const match of prepared.matchAll(NUMBER_RE)) {
    const { prefix, num, suffix, post } = match.groups;
    const value = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    let scale = 1;
    let unit = null;
    if (suffix) {
      const [s, u] = SUFFIX[suffix.toLowerCase()] ?? [1, null];
      scale = s;
      unit = u;
    }
    const currency = (prefix && CURRENCY_PREFIX[prefix.toLowerCase().replace(/\s/g, "")])
      || (post && CURRENCY_WORD[post.toLowerCase()]);
    if (currency && unit !== "percent" && unit !== "times") unit = `money:${currency}`;
    if (!unit && !suffix && INDIAN_GROUPING.test(num)) unit = "money:INR";
    if (!unit) {
      const bare = !suffix && !prefix && /^\d{4}$/.test(num);
      unit = bare && value >= 1900 && value <= 2100 ? "year" : "count";
    }
    // Round away float noise from the scaling (1.5 * 1e5).
    const scaled = Math.round(value * scale * 1000) / 1000;
    claims.push({ key: `${scaled}|${unit}`, raw: match[0].trim(), start: match.index, end: match.index + match[0].length });
  }
  return claims;
}

/**
 * Every numeric claim in a text, as a canonical key plus the text it came from.
 *
 * The key is `{scaled value}|{unit class}`, so "₹2 crore", "Rs. 2 Cr" and
 * "INR 20,000,000" are one claim, and "30%" is a different claim from "30".
 *
 * @param {string} text
 * @returns {{ key: string, raw: string }[]}
 */
export function numberClaims(text) {
  // "24/7" is an idiom, not two figures.
  const prepared = prepNumbers(text).replace(/\b24\s?\/\s?7\b/g, " ");
  const claims = scanNumbers(prepared).map(({ key, raw }) => ({ key, raw }));
  // Number words are read inside hyphenated compounds too: "twelve-person team".
  for (const match of prepared.matchAll(/(?<![\p{L}\p{N}])\p{L}+(?:-\p{L}+)*(?![\p{L}\p{N}])/gu)) {
    const parts = match[0].toLowerCase().split("-");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (TENS[part] && UNITS[parts[i + 1]]) {
        claims.push({ key: `${TENS[part] + UNITS[parts[i + 1]]}|count`, raw: `${part}-${parts[i + 1]}` });
        i++;
        continue;
      }
      const value = NUMBER_WORDS[part];
      if (value !== undefined) claims.push({ key: `${value}|count`, raw: part });
      else if (VAGUE_AMOUNTS.has(part)) claims.push({ key: `${part}|vague`, raw: part });
    }
  }
  return claims;
}

// Words that open a resume bullet without being a name. Regular past tenses,
// -ing, -ly and noun endings are recognised by their ending; this list is the
// rest. Real product and company names must never go in here: a capitalised
// word on this list is waved through everywhere in a sentence.
const OPENERS = new Set(`
a an the and or but for with from by at on in of to as into over across within per via
i we my our their its this that these those all both each every no not some any other such
more most less under above below after before during while when where which who what how why
if then than so yet nor since until about around beyond through throughout toward towards upon
without using based named among between against along
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen twenty
thirty forty fifty sixty seventy eighty ninety hundred thousand dozen
led built ran drove won cut grew wrote oversaw took set made held brought began rebuilt sold
taught spoke chose dealt kept met paid sent spent stood told understood lead build run drive
write oversee take make hold bring begin rebuild sell teach speak choose keep pay send
spend stand tell understand manage own design develop deliver create launch reduce increase
improve implement support work serve act help ensure maintain provide prepare present plan
partner coordinate collaborate conduct analyse analyze review track report train mentor hire
negotiate resolve handle process test deploy migrate automate optimise optimize define draft
research identify evaluate monitor operate execute establish scale ship secure streamline
cut trim slash shrink grow raise lift drop save earn win beat exceed double triple halve
drive steer guide direct head supervise administer organise organize orchestrate champion
pioneer spearhead own steward facilitate enable empower enhance expand extend accelerate
boost cultivate foster generate leverage utilise utilize apply use perform produce publish
recruit onboard reconcile forecast budget audit close submit file post settle approve
validate verify document standardise standardize simplify consolidate integrate align
bridge unify transform modernise modernize overhaul revamp redesign rework refine
responsible key lead team member part core main primary first
second third last new next former current prior early late
experienced skilled proven strong excellent successful dedicated results hands seasoned
motivated driven focused oriented passionate detail analytical technical strategic creative
operational financial commercial professional hardworking diligent accomplished versatile
curious collaborative ambitious reliable meticulous adaptable bilingual
currently previously recently also additionally independently successfully consistently
actively directly closely jointly together
career summary profile objective overview experience education skills projects
certifications achievements highlights background expertise knowledge proficient familiar
ownership oversight leadership management delivery analysis analytics reporting budgeting
forecasting planning strategy finance accounting compliance reconciliation variance
automation improvement improvements enhancement initiative initiatives collaboration
partnership partnerships responsibility responsibilities
cross self data co end customer client clients detail cost costs high multi full long short
well fast open quality solution solutions people business market revenue user users risk
growth impact insight insights outcome outcomes performance product products project
program programme programs programmes goal goals metrics metric dashboard dashboards
month year quarter weekly monthly annual annually daily budget budgets process processes
team analyst analysts specialist specialists lead leader mentor mentoring
hybrid remote local
proficiency mastery turnaround whole day days spreadsheet spreadsheets faster quicker better
leaner smarter speedier simpler stronger deeper broader wider larger bigger greater
fluency command grasp familiarity exposure background track record
accuracy efficiency productivity visibility transparency control controls
month months week weeks hour hours time timely
`.trim().split(/\s+/));

// Word endings that make a clause-opening capital an ordinary word.
const PLAIN_ENDING = /(?:ed|ing|ly|tion|tions|ment|ments|ness|ship|ance|ics)$/;
// ...except these, which are names that happen to carry such an ending.
const NAME_WITH_ORDINARY_ENDING = new Set(["spring", "lightning", "bing", "beijing", "nanjing", "sterling"]);

const lower = (s) => s.toLowerCase();

/** Split text into word tokens, keeping the symbols that are part of a name (C++, C#, Node.js, .NET). */
function wordTokens(text) {
  return [...String(text ?? "").matchAll(/\.?[\p{L}\p{N}][\p{L}\p{N}+#]*(?:[.'’][\p{L}\p{N}+#]+)*/gu)].map((m) => ({
    word: m[0].replace(/['’]s$/i, ""),
    index: m.index,
  }));
}

/** Blank out numeric spans ("Rs. 2 Cr", "5 LPA") so their unit letters are not read as names. */
function withoutNumbers(prepared) {
  let out = prepared;
  const spans = scanNumbers(prepared);
  for (let i = spans.length - 1; i >= 0; i--) {
    const { start, end } = spans[i];
    out = out.slice(0, start) + " ".repeat(end - start) + out.slice(end);
  }
  return out;
}

/** Lower-cased tokens of the confirmed facts, including the parts of hyphenated and slashed words. */
export function factTokenSet(sourceText) {
  const set = new Set();
  for (const { word } of wordTokens(cleanText(sourceText))) {
    const w = lower(word);
    set.add(w);
    for (const part of w.split(/[.]/)) if (part) set.add(part);
  }
  return set;
}

/** The facts mention this word, or its plural/singular ("Analyst" for "analysts"). */
function inFacts(w, facts) {
  if (facts.has(w)) return true;
  if (w.length < 3) return false;
  if (facts.has(`${w}s`) || facts.has(`${w}es`)) return true;
  if (w.endsWith("s") && facts.has(w.slice(0, -1))) return true;
  return w.endsWith("es") && facts.has(w.slice(0, -2));
}

/** True when a word is shaped like a name: a capital, an acronym, or letters mixed with digits. */
function nameShaped(word) {
  if (/^\d+$/.test(word)) return false;
  if (/\p{Lu}/u.test(word)) return true;
  return /\p{L}/u.test(word) && /\d/.test(word);
}

/** True when `index` starts a sentence, a line or a bullet in `text`. */
function startsClause(text, index) {
  let before = text.slice(0, index);
  // An opening bracket or quote does not change whether a clause is starting.
  for (let prev = null; prev !== before;) {
    prev = before;
    before = before.replace(/[(\[{"'“‘«]\s*$/u, "");
  }
  if (/^\s*$/.test(before)) return true;
  return /(?:[.!?:;\n•·–—|]|\s-)\s*$/u.test(before) || /(?:^|\n)\s*[-*]\s*$/.test(before);
}

/**
 * Name-shaped words in `text` that the confirmed facts never mention.
 *
 * A capitalised word that opens a clause is treated as an ordinary word when it
 * is a known opener or carries a regular verb, adverb or noun ending
 * ("Spearheaded", "Leading", "Successfully", "Ownership"). Anything else must
 * be found in the facts.
 *
 * @param {string} text
 * @param {Set<string>} facts from factTokenSet
 * @returns {string[]} the unsupported words, as written, de-duplicated
 */
export function unsupportedNames(text, facts) {
  const source = withoutNumbers(prepNumbers(text));
  const found = new Map();
  for (const { word, index } of wordTokens(source)) {
    if (!nameShaped(word)) continue;
    const w = lower(word);
    if (inFacts(w, facts)) continue;
    // "Node.js" is supported by a fact that says "Node".
    const parts = w.split(".").filter(Boolean);
    if (parts.length > 1 && parts.every((p) => facts.has(p) || p.length <= 2)) continue;
    // "A" and "I" are words, not names.
    if (w.length === 1 && OPENERS.has(w)) continue;
    const titleCase = /^\p{Lu}[\p{Ll}'’]+$/u.test(word);
    if (titleCase && startsClause(source, index)) {
      if (OPENERS.has(w)) continue;
      if (!NAME_WITH_ORDINARY_ENDING.has(w) && PLAIN_ENDING.test(w)) continue;
    }
    // A capitalised ordinary word mid-sentence ("the Team") is a style slip,
    // not a claim, when it is one of the opener words.
    if (titleCase && OPENERS.has(w)) continue;
    if (!found.has(w)) found.set(w, word);
  }
  return [...found.values()];
}

/**
 * Wording that came from the job description and is in neither the confirmed
 * facts nor the original line. Advisory only: carrying a job's vocabulary into
 * a true statement is the point of tailoring, but the user should look at it.
 */
export function borrowedTerms(text, facts, { before = "", jdText = "" } = {}) {
  if (!jdText) return [];
  const jd = factTokenSet(jdText);
  const original = factTokenSet(before);
  const out = new Set();
  for (const { word } of wordTokens(cleanText(text))) {
    const w = lower(word);
    if (w.length < 5 || OPENERS.has(w) || /^\d+$/.test(w)) continue;
    if (inFacts(w, facts) || inFacts(w, original) || !jd.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive: "Java" is not found inside "JavaScript". */
function containsPhrase(haystack, phrase) {
  const p = cleanText(phrase).trim().replace(/\s+/g, " ");
  if (!p) return false;
  const body = escapeRegExp(p).replace(/ /g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu").test(cleanText(haystack));
}

// Claim words: a credential, a seniority, a scope or an expertise the facts must
// back. Each row is one family; any form of a family in the facts supports every
// form of it. Words that honest rewordings rely on ("lead", "specialist",
// "qualified", "graduate", "expertise", "mastery", "proficiency", "experienced",
// "seasoned", "end-to-end", "cross-functional", "whole", "hands-on", "ownership",
// "oversight", "governance", "stewardship") are deliberately not here.
const CLAIM_FAMILIES = {
  credential: [
    ["certified", "certification", "certifications", "certificate", "certificates"],
    ["chartered"],
    ["licensed", "licenced"],
    ["accredited", "accreditation"],
    ["award", "awards", "awarded"],
    ["patent", "patents", "patented"],
    ["medalist", "medallist"],
    ["topper"],
    ["scholarship", "scholarships"],
    ["fellowship", "fellowships"],
    ["mba"],
    ["phd", "doctorate"],
    ["diploma"],
    ["postgraduate"],
  ],
  seniority: [
    ["senior", "sr"],
    ["principal"],
    ["director", "directors"],
    ["head of"],
    ["chief"],
    ["ceo"], ["cfo"], ["cto"], ["coo"], ["cio"], ["cmo"],
    ["vp", "vice president"],
    ["president"],
    ["manager", "managers"],
    ["executive", "executives"],
    ["founder", "cofounder", "co-founder"],
  ],
  scope: [
    ["global", "globally"],
    ["worldwide"],
    ["international", "internationally"],
    ["multinational"],
    ["national", "nationally", "nationwide"],
    ["regional", "regionally"],
    ["enterprise"],
    ["entire"],
    ["sole", "solely"],
    ["single-handedly"],
  ],
  expertise: [
    ["expert", "experts"],
    ["guru"],
    ["veteran"],
    ["world-class"],
    ["thought leader"],
    ["best-in-class"],
    ["industry-leading"],
    ["top-performing"],
  ],
};

const CLAIM_FORMS = [];
for (const [kind, families] of Object.entries(CLAIM_FAMILIES)) {
  for (const family of families) for (const form of family) CLAIM_FORMS.push({ kind, form, family });
}
// Longest first so "vice president" is read before "president".
CLAIM_FORMS.sort((a, b) => b.form.length - a.form.length);
const CLAIM_BY_FORM = new Map(CLAIM_FORMS.map((f) => [f.form, f]));
const CLAIM_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CLAIM_FORMS.map((f) => escapeRegExp(f.form).replace(/ /g, "\\s+")).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

/**
 * Credential, seniority, scope and expertise words in `text` that the facts
 * never state, in any letter case and anywhere in the line.
 *
 * @param {string} text
 * @param {string} sourceText the user's confirmed facts, serialised
 * @returns {{ kind: string, value: string }[]} value is the word as written
 */
export function unsupportedClaimWords(text, sourceText) {
  const facts = factTokenSet(sourceText);
  const out = [];
  for (const match of cleanText(text).matchAll(CLAIM_RE)) {
    const written = match[0].replace(/\s+/g, " ");
    const entry = CLAIM_BY_FORM.get(written.toLowerCase());
    if (!entry) continue;
    const supported = entry.family.some((form) =>
      /[\s-]/.test(form) ? containsPhrase(sourceText, form) : facts.has(form));
    if (!supported) out.push({ kind: entry.kind, value: written });
  }
  return out;
}

/**
 * Check one piece of tailored text against the user's confirmed facts.
 *
 * @param {object} input
 * @param {string} input.text the suggested (or user-edited) wording
 * @param {string} input.sourceText the user's confirmed facts, serialised
 * @param {string} [input.before] the original line being replaced
 * @param {string} [input.jdText] the job description (untrusted; used only to spot borrowed wording)
 * @param {string[]} [input.cannotConfirm] claims the user said they cannot confirm
 * @param {(text: string, opts: { sourceText: string }) => any} [input.engineGate]
 *   the engine's verifyFactsFromText; when absent only the strict checks run
 *   and `engineRan` is false so a caller can refuse to treat that as a full pass
 * @returns {{ verdict: 'pass'|'warn'|'block', issues: { kind: string, value: string, message: string }[], advisory: string[], engineRan: boolean }}
 */
export function checkText({ text, sourceText, before = "", jdText = "", cannotConfirm = [], engineGate } = {}) {
  const target = cleanText(text);
  const issues = [];
  const seen = new Set();
  const add = (kind, value, message) => {
    const id = `${kind}|${lower(String(value))}`;
    if (seen.has(id)) return;
    seen.add(id);
    issues.push({ kind, value: String(value), message });
  };

  for (const phrase of cannotConfirm) {
    if (containsPhrase(target, phrase)) {
      add("blocked", phrase, `You marked "${phrase}" as something you can't confirm, so it stays out.`);
    }
  }

  const allowedNumbers = new Set(numberClaims(sourceText).map((c) => c.key));
  for (const claim of numberClaims(target)) {
    if (!allowedNumbers.has(claim.key)) {
      add("number", claim.raw, `The figure "${claim.raw}" is not in your confirmed facts.`);
    }
  }

  for (const { kind, value } of unsupportedClaimWords(target, sourceText)) {
    add(kind, value, `"${value}" is not in your confirmed facts.`);
  }

  const facts = factTokenSet(sourceText);
  for (const name of unsupportedNames(target, facts)) {
    add("name", name, `"${name}" is not mentioned in your confirmed facts.`);
  }

  let engineRan = false;
  if (typeof engineGate === "function") {
    // The engine reads "SQL/Power BI/Excel" as one tool called "sql/power bi/excel"
    // and flags it; a comma list says the same thing and reads correctly.
    const forEngine = target.replace(/([\p{L}\p{N}+#])\s?\/\s?(?=[\p{L}\p{N}])/gu, "$1, ");
    const result = engineGate(forEngine, { sourceText });
    engineRan = true;
    for (const value of result?.invented ?? []) {
      add("number", value, `The figure "${value}" is not in your confirmed facts.`);
    }
    for (const fact of result?.unsupportedFacts ?? []) {
      const label = fact.kind === "scope" ? "claims more responsibility than your facts state" : "is not in your confirmed facts";
      add(fact.kind || "fact", fact.value, `"${fact.value}" ${label}.`);
    }
    for (const phrase of result?.forbidden ?? []) {
      add("forbidden", phrase, `"${phrase}" is on the list of phrases that are never allowed.`);
    }
  }

  // The same value can be reported by both layers under different kinds.
  const byValue = new Map();
  for (const issue of issues) if (!byValue.has(lower(issue.value))) byValue.set(lower(issue.value), issue);
  const unique = [...byValue.values()];

  const advisory = borrowedTerms(target, facts, { before, jdText });
  return {
    verdict: unique.length ? "block" : advisory.length ? "warn" : "pass",
    issues: unique,
    advisory,
    engineRan,
  };
}
