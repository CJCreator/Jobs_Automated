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
//   4. anything the user marked "I can't confirm" is blocked for good;
//   5. (P1-20) credentials, ranks, tenure and languages are claims too, a
//      seniority word needs a title line, the summary or an added fact, text in
//      letters the check cannot read is refused, and an engine coverage gap blocks.
//
// It errs towards flagging. A false flag costs the user one click to attest a
// true fact; a false pass puts an invented claim in front of an employer.
//
// Covered: invented figures, and a figure the facts hold only about something
// else (number-context.mjs); capitalised or mixed names; and the claim words in
// CLAIM_FAMILIES and APP_ONLY_FAMILIES, whole-word and case-insensitive ("global",
// "Global", "GLOBAL"), where a word is supported by any form of its family in the
// facts. That includes degrees and exams in their dotted and spaced spellings
// ("B.Tech", "b tech", "m.c.a", "hons", "CA", "master of"), rank words ("top
// performer", "runner-up", "employee of the month", "silver medal"), and language
// names ("Tamil", "Bangla", "multi-lingual", "several languages"). Phrases read by
// detectors: ranks ("Ranked 1st", "top 5", "Best performer", "1st in class",
// "came first", "first prize") and tenure ("decade", "several yrs", "longstanding",
// "long-time", "multi-year", "years experience" with no figure before it).
// "C-suite" blocks as the candidate's role and passes as an audience ("presented
// to the C-suite", "a C-suite sponsor"), as in the engine.
//
// Not covered (by design, because closing them would flag honest rewording):
// lower-case tool names ("python"), claim words outside the lists ("lead",
// "specialist", "experienced", "extensive experience", "graduate", "fluent"), the
// bare word "master", ordinals with no rank context ("the first batch", "Finished
// the first close"), "a long time" (spaced), vague multipliers ("doubled", "half the
// time"), Latin-script lines in another language (Hinglish, French), and accented
// look-alikes ("sénior"). Known honest false blocks: "polish" as a verb, "master of
// ceremonies", "multi-year contracts" unless the facts say so (the user attests or
// rewords). The engine gate catches some of these; the user's review is the
// backstop for the rest.
//
// Pure functions, no I/O, so `node --test` can import this file directly.

import { unsupportedNumberContexts, figureContexts } from "./number-context.mjs";

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
function prepNumbers(text, cleaned = cleanText(text)) {
  return cleaned
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

// Plural words after a lakh or crore figure that still mean money.
const NOT_COUNTED = new Set(`budgets revenues sales savings costs expenses profits loans funds investments deals
contracts assets receivables payables collections inflows outflows grants earnings returns dues payments orders
rupees dollars lakhs crores
this plus towards thus versus besides always perhaps sometimes afterwards whereas its his`.split(/\s+/));

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
    // "2 crore analysts": a lakh or crore figure with no currency, followed by a plural
    // noun that is not money, counts people or things (20,000,000 of them), not rupees.
    let rawExtra = "";
    if (suffix && !currency && /^(?:lakhs?|lacs?|crores?|cr)$/i.test(suffix)) {
      const next = /^\s+(\p{L}[\p{L}'’]*)/u.exec(prepared.slice(match.index + match[0].length, match.index + match[0].length + 40));
      const w = next?.[1].toLowerCase();
      if (w && w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !NOT_COUNTED.has(w)) {
        unit = "count";
        rawExtra = ` ${next[1]}`;
      }
    }
    if (!unit) {
      const bare = !suffix && !prefix && /^\d{4}$/.test(num);
      unit = bare && value >= 1900 && value <= 2100 ? "year" : "count";
    }
    // Round away float noise from the scaling (1.5 * 1e5).
    const scaled = Math.round(value * scale * 1000) / 1000;
    claims.push({ key: `${scaled}|${unit}`, raw: match[0].trim() + rawExtra, start: match.index, end: match.index + match[0].length });
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
  return numberClaimsOf(text);
}

function numberClaimsOf(text, cleaned) {
  // "24/7" is an idiom, not two figures.
  const prepared = prepNumbers(text, cleaned).replace(/\b24\s?\/\s?7\b/g, " ");
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
motivated driven focused oriented passionate detail analytical technical strategic creative fluent
operational financial commercial professional hardworking diligent accomplished versatile
curious collaborative ambitious reliable meticulous adaptable bilingual
currently previously recently also additionally independently successfully consistently
actively directly closely jointly together
career summary profile objective overview experience education skills projects
certifications achievements highlights background expertise knowledge proficient familiar
ownership oversight leadership management delivery analysis analytics reporting budgeting
forecasting planning strategy finance accounting commerce compliance reconciliation variance
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

// Everything derived from the confirmed facts alone is built once per source and
// kept with the string it came from, so a later call with an equal string (the app
// rebuilds the fact text for every line it checks) reuses it. One entry is enough:
// a request checks many lines against one fact base. Cached values are read-only
// (the token set refuses writes, the rest are never handed out); a caller that needs
// to add to one copies it, so a per-call addition can never reach the next call. An
// empty source is cheap and never cached. Other texts (the job description, the
// original line) use the uncached builders, so they cannot evict the real source.
let sourceMemo = { text: null, values: new Map() };
function fromSource(sourceText, key, build) {
  const text = String(sourceText ?? "");
  if (!text) return build(text);
  if (sourceMemo.text !== text) sourceMemo = { text, values: new Map() };
  const { values } = sourceMemo;
  if (!values.has(key)) values.set(key, build(text));
  return values.get(key);
}

/** A Set that refuses writes, for values shared between calls. */
class ReadOnlySet extends Set {
  constructor(items) {
    super(items);
    this.frozen = true;
  }
  add(value) {
    if (this.frozen) throw new TypeError("This set is shared and read-only; copy it first.");
    return super.add(value);
  }
  delete() { throw new TypeError("This set is shared and read-only; copy it first."); }
  clear() { throw new TypeError("This set is shared and read-only; copy it first."); }
}

const cleanSource = (text) => fromSource(text, "clean", cleanText);

function buildFactTokenSet(text, clean = cleanText(text)) {
  const set = new Set();
  for (const { word } of wordTokens(clean)) {
    const w = lower(word);
    set.add(w);
    for (const part of w.split(/[.]/)) if (part) set.add(part);
  }
  return set;
}

/** Lower-cased tokens of the confirmed facts, including the parts of hyphenated and slashed words. Read-only. */
export function factTokenSet(sourceText) {
  return fromSource(sourceText, "facts", (text) => new ReadOnlySet(buildFactTokenSet(text, cleanSource(text))));
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
  const jd = buildFactTokenSet(jdText);
  const original = buildFactTokenSet(before);
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
// "oversight", "governance", "stewardship", "fluent", "proficient") are deliberately not here.
//
// CLAIM_FAMILIES is the twin of CLAIM_FAMILIES in packages/engine/verify-cv-facts.mjs:
// change one list and change the other. The control is tests/claim-lists-sync.test.mjs.
export const CLAIM_FAMILIES = {
  credential: [
    ["certified", "certification", "certifications", "certificate", "certificates"],
    ["chartered"],
    ["licensed", "licenced"],
    ["accredited", "accreditation"],
    ["award", "awards", "awarded"],
    ["patent", "patents", "patented"],
    ["medalist", "medallist"],
    ["topper", "toppers"],
    ["scholarship", "scholarships"],
    ["fellowship", "fellowships"],
    ["mba", "m.b.a"],
    ["phd", "ph.d", "ph d", "doctorate"],
    ["diploma", "diplomas"],
    ["postgraduate", "post graduate", "post-graduate"],
  ],
  seniority: [
    ["senior", "seniors", "sr"],
    ["seniormost", "senior-most"],
    ["principal", "principals"],
    ["director", "directors"],
    ["head of", "heads of"],
    ["chief"],
    ["ceo", "c.e.o"], ["cfo", "c.f.o"], ["cto", "c.t.o"], ["coo", "c.o.o"], ["cio", "c.i.o"], ["cmo", "c.m.o"],
    ["vp", "v.p", "vice president"],
    ["avp"], ["svp"], ["evp"],
    ["president"],
    ["manager", "managers", "mgr"],
    ["gm", "general manager"],
    ["executive", "executives"],
    ["founder", "cofounder", "co-founder"],
    ["c-suite"],
    ["cxo", "cxos"],
  ],
  scope: [
    ["global", "globally"],
    ["worldwide"],
    ["international", "internationally"],
    ["multinational"],
    ["national", "nationally", "nationwide", "nation-wide"],
    ["regional", "regionally"],
    ["pan-india", "pan india"],
    ["enterprise"],
    ["entire"],
    ["sole", "solely"],
    ["single-handedly", "singlehandedly"],
  ],
  expertise: [
    ["expert", "experts", "expertly"],
    ["guru", "gurus"],
    ["veteran", "veterans"],
    ["world-class"],
    ["thought leader"],
    ["best-in-class"],
    ["industry-leading"],
    ["top-performing"],
  ],
};

// Families the engine does not have. "credential" here only adds forms to the shared
// kind (degrees, exams, honours); rank and tenure are read by the detectors below and
// language by the name list, and those three kinds are declared in APP_ONLY_KINDS.
export const APP_ONLY_KINDS = ["rank", "tenure", "language"];
export const APP_ONLY_FAMILIES = {
  // Spellings of one qualification share a row, so a fact in one spelling supports the others.
  credential: [
    ["degree", "degrees"],
    ["bachelor's", "bachelors", "bachelor"],
    ["master's", "masters", "master of", "master in"],
    ["b.tech", "btech", "b tech", "b. tech"], ["m.tech", "mtech", "m tech", "m. tech"], ["b.e"],
    ["b.sc", "bsc", "b sc", "b. sc"], ["m.sc", "msc", "m sc", "m. sc"],
    ["b.com", "bcom", "b com", "b. com"], ["m.com", "mcom", "m com", "m. com"],
    ["bba", "b.b.a"], ["bca", "b.c.a"], ["mca", "m.c.a"], ["pgdm", "p.g.d.m"], ["pgdba"], ["mbbs", "m.b.b.s"],
    ["llb", "ll.b", "l.l.b"], ["m.phil", "mphil"], ["b.ed"],
    // Dotted short degrees. The bare letters ("ma", "ms", "ba") are ordinary words, so only dotted forms.
    ["b.a"], ["m.a"], ["b.s"], ["m.s"], ["m.e"], ["ll.m", "llm"], ["m.ed"], ["b.pharm", "bpharm"], ["bbm", "b.b.m"],
    // A separate row from the shared "postgraduate" family, which is the engine's twin.
    ["postgrad", "post grad"],
    // "award-winning" is supported by any word in AWARD_WORDS in the facts (owner decision, see below).
    ["award-winning"],
    ["ca", "c.a"], ["company secretary"],
    ["cpa"], ["cfa"], ["pmp"], ["frm"], ["acca"], ["cma"], ["icwa"],
    ["honours", "honors", "hons"], ["distinction"], ["first class"], ["gold medal"], ["rank holder"],
    ["valedictorian"], ["cum laude"], ["dean's list"],
  ],
  // Rank words and phrases. Ordinals and "top N" are read by rankHits; "top-performing" is
  // already a shared expertise form, so it is not repeated here.
  rank: [
    ["top performer", "top performers"], ["top-rated"], ["top-ranked"], ["top scorer", "top scorers"],
    ["top achiever", "top achievers"], ["topped"], ["first prize"], ["runner-up", "runners-up"], ["merit list"],
    ["star performer", "star performers"],
    ["employee of the month"], ["employee of the quarter"], ["employee of the year"],
    ["first division"], ["silver medal"], ["bronze medal"],
  ],
  language: [
    ...["hindi", "english", "tamil", "telugu", "kannada", "malayalam", "marathi", "gujarati", "punjabi", "urdu",
      "odia", "assamese", "sanskrit", "french", "german", "spanish", "mandarin", "chinese", "japanese", "korean", "arabic",
      "russian", "portuguese", "italian", "dutch",
      "konkani", "nepali", "sindhi", "kashmiri", "maithili", "bhojpuri", "marwari", "tulu", "manipuri", "hindustani",
      "sinhala", "turkish", "thai", "vietnamese", "malay", "indonesian", "swahili", "hebrew", "greek", "polish", "swedish",
      "cantonese"].map((n) => [n]),
    ["bengali", "bangla"], ["persian", "farsi"],
    ["bilingual", "bi-lingual"], ["trilingual", "tri-lingual"], ["multilingual", "multi-lingual"], ["polyglot"],
    ["mother tongue"], ["native speaker"],
    ["several languages", "multiple languages", "many languages"],
  ],
};

// Plain business phrases that contain a claim word and claim nothing. Exact phrases
// only; the bare word still blocks. "executive summary" and "enterprise reporting" are from
// the engine's list (CLAIM_PHRASE_EXEMPTIONS in verify-cv-facts.mjs); the engine's third,
// "award-winning", is a claim here unless the facts mention an award (AWARD_WORDS below).
// "best practice(s)" is app-only: "best" is a rank word only in this layer, so the engine
// has nothing to exempt. This is therefore not a pure twin of the engine's list.
const CLAIM_PHRASE_EXEMPTIONS = /(?<![\p{L}\p{N}])(?:executive\s+summary|enterprise\s+reporting|best[\s\p{Pd}]+practices?)(?![\p{L}\p{N}])/giu;

// "award-winning" (owner decision, 2026-11-20): not exempt. It passes only when the facts
// hold a form of the award family (award, awards, awarded), as in the engine (P1-19c): a
// "prize" or "honours" does not back it. Otherwise it blocks with the value
// "award-winning", and one attest clears it.
const AWARD_WORDS = ["award", "awards", "awarded"];

// "C-suite" is a seniority claim word unless one of two closed, same-line shapes names it
// as the audience. Each match is read with an 80-character window each side:
//   1. never exempt after a role predicate ("as a", "I am a", "was the", "Appointed");
//   2. exempt when one space or dash, an optional "reporting", and an audience noun follow,
//      with no role noun after that ("a C-suite sponsor", "C-suite reporting packs"; not
//      "C-suite engagement lead");
//   3. exempt after an exact verb form, up to three words from a closed object list, and
//      "to the" ("Presented quarterly results to the C-suite"; not "Presented my
//      transition to the C-suite", "Recommended for promotion to the C-suite").
// Neither shape crosses a line break, and the after-shape does not cross a dash clause
// ("Member of the C-suite — reviews all budgets" blocks). "C-suite reporting" alone blocks.
// Mirrors the engine's rule (P1-19c final commit d40cf15, not merged here yet); keep the
// two equal. Role predicates include "appointed", "named", "acting", "interim", "elected",
// "hired", "promoted", "elevated". The line is read with its line breaks kept.
const C_SUITE_RE = /(?<![\p{L}\p{N}])c[\s\p{Pd}]+suite(?![\p{L}\p{N}])/giu;
const C_SUITE_ROLE_PREDICATE_RE = /(?<![\p{L}\p{N}])(?:as|am|i['’]m|is|was|were|are|be|been|being|became|become|becoming|appointed|named|acting|interim|elected|hired|promoted|elevated)[^\S\n]+(?:(?:an?|the|my|our)[^\S\n]+)?$/iu;
const C_SUITE_AUDIENCE_AFTER_RE = /^(?: |\p{Pd})(?:reporting(?: |\p{Pd}))?(?:sponsors?|stakeholders?|audiences?|narratives?|presentations?|briefings?|decks?|packs?|dashboards?|communications?|visibility|engagement|alignment|buy-in)(?![\p{L}\p{N}])(?![^\S\n]*\p{Pd}?[^\S\n]*(?:leads?|leaders?|heads?|managers?|directors?|officers?|executives?|owners?|members?|chairs?|boards?|roles?|positions?|seats?|levels?|teams?|councils?|committees?)(?![\p{L}\p{N}]))/iu;
const C_SUITE_OBJECT_WORDS = "the|our|my|quarterly|monthly|weekly|annual|yearly|results|findings|updates|plans?|strategy|risks|numbers|figures|recommendations|proposals|budgets?|forecasts?|insights|metrics|analysis|reports|progress|performance|outcomes|financials|issues|status";
const C_SUITE_AUDIENCE_BEFORE_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:present(?:ed|ing|s)?|report(?:ed|ing|s)?|brief(?:ed|ing|s)?|escalat(?:ed|es|ing)|communicat(?:ed|es|ing)|pitch(?:ed|es|ing)?)[^\S\n]+(?:(?:${C_SUITE_OBJECT_WORDS})[^\S\n]+){0,3}to[^\S\n]+the[^\S\n]+$`, "iu");
const C_SUITE_WINDOW = 80;
// The rule's sources, for tests/claim-lists-sync.test.mjs to compare with the engine's.
export const C_SUITE_RULE = Object.freeze({
  match: C_SUITE_RE.source, rolePredicate: C_SUITE_ROLE_PREDICATE_RE.source, after: C_SUITE_AUDIENCE_AFTER_RE.source,
  before: C_SUITE_AUDIENCE_BEFORE_RE.source, window: C_SUITE_WINDOW,
});

const blank = (m) => " ".repeat(m.length);

/** Cleaned text with exempt phrases and audience "C-suite" blanked out, same length so indices hold. */
function withoutExemptions(clean) {
  return clean.replace(CLAIM_PHRASE_EXEMPTIONS, blank).replace(C_SUITE_RE, (match, offset, whole) => {
    const end = offset + match.length;
    const before = whole.slice(Math.max(0, offset - C_SUITE_WINDOW), offset);
    if (C_SUITE_ROLE_PREDICATE_RE.test(before)) return match;
    if (C_SUITE_AUDIENCE_AFTER_RE.test(whole.slice(end, end + C_SUITE_WINDOW)) || C_SUITE_AUDIENCE_BEFORE_RE.test(before)) return blank(match);
    return match;
  });
}

const CLAIM_FORMS = [];
for (const families of [CLAIM_FAMILIES, APP_ONLY_FAMILIES]) {
  for (const [kind, rows] of Object.entries(families)) {
    for (const family of rows) for (const form of family) CLAIM_FORMS.push({ kind, form, family });
  }
}
// Longest first so "vice president" is read before "president".
CLAIM_FORMS.sort((a, b) => b.form.length - a.form.length);
// A space and a hyphen are interchangeable inside a form: "world class", "world-class". An apostrophe may be curly.
const formPattern = (form) => escapeRegExp(form).replace(/[ -]/g, "[\\s\\p{Pd}]+").replace(/'/g, "['’]");
const formKey = (form) => form.toLowerCase().replace(/’/g, "'").replace(/[\s\p{Pd}]+/gu, " ");
const CLAIM_BY_FORM = new Map(CLAIM_FORMS.map((f) => [formKey(f.form), f]));
const CLAIM_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CLAIM_FORMS.map((f) => formPattern(f.form)).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);
const FORM_RES = new Map(CLAIM_FORMS.map(({ form }) => [form, new RegExp(`(?<![\\p{L}\\p{N}])${formPattern(form)}(?![\\p{L}\\p{N}])`, "iu")]));
// Rank forms read as words (APP_ONLY_FAMILIES.rank) are blanked before rankHits, so one phrase gives one issue.
const RANK_FORM_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CLAIM_FORMS.filter((f) => f.kind === "rank").map((f) => formPattern(f.form)).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

/** A predicate over claim forms: does this text contain the form (space and hyphen alike)? Answers are kept per form. */
function formPredicate(text, clean = cleanText(text)) {
  const facts = buildFactTokenSet(text, clean);
  const answers = new Map();
  return (form) => {
    if (!answers.has(form)) {
      answers.set(form, /[\s\p{Pd}'’]/u.test(form) ? FORM_RES.get(form).test(clean) : facts.has(form));
    }
    return answers.get(form);
  };
}

// Seniority is a claim about a job, so only the places that state a job back it: a
// title line (**...**), the summary, and the facts the candidate added.
function seniorityText(cleanedSource) {
  const out = [];
  let section = "";
  for (const line of cleanedSource.split("\n")) {
    const heading = /^\s*##\s+(.*?)\s*$/.exec(line);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (/^\s*\*\*.+\*\*\s*$/.test(line) || section === "summary" || section.startsWith("additional facts stated by the candidate")) out.push(line);
  }
  return out.join("\n");
}

const sourcePredicate = (src) => fromSource(src, "pred", (text) => formPredicate(text, cleanSource(text)));
const seniorityPredicate = (src) => fromSource(src, "senior", (text) => formPredicate(seniorityText(cleanSource(text))));

// ---- ranks and tenure: phrases, not words ------------------------------------------

const ORDINALS = new Set(`1st 2nd 3rd 4th 5th 6th 7th 8th 9th 10th first second third fourth fifth sixth seventh eighth ninth tenth`.split(" "));
const RANK_CONTEXT = new Set("ranked placed stood secured position rank highest best top".split(" "));
// More ordinal context, read in one direction only, so that "the first batch of hires" or
// "Finished the first close" stays honest:
//   prize             within 3 words after the ordinal: "first prize", "1st cash prize";
//   place             directly after the ordinal: "2nd place" (not "the first controls in place");
//   class, batch      after "in" or "of" that follows the ordinal: "1st in class", "first in her batch";
//   came, finished    just before the ordinal, or before "in"/"at" and the ordinal: "came first", "finished in second".
const RANK_AFTER = new Set(["prize"]);
const RANK_GROUP = new Set(["class", "batch"]);
const RANK_GROUP_FILLER = new Set(["the", "my", "his", "her", "our", "their", "whole", "entire"]);
const RANK_BEFORE = new Set(["came", "finished"]);

const AFTER_BEST_SKIP = new Set("in of at for to and with by on from as the a an".split(" "));
const NUMBER_BEFORE_YEARS = new Set([...Object.keys(NUMBER_WORDS), "one", "few", "several", "many", "multiple", "numerous", "countless", "couple"]);

const phraseKey = (s) => s.toLowerCase().replace(/’/g, "'").replace(/[\s\p{Pd}]+/gu, " ").trim();

function mergeSpans(spans) {
  spans.sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && span.s <= last.e) last.e = Math.max(last.e, span.e);
    else out.push({ ...span });
  }
  return out;
}

/** Rank claims in cleaned text: "Ranked 1st", "top 5", "Best performer", "Second-highest". */
function rankHits(clean) {
  const text = withoutExemptions(clean).replace(/best[\s\p{Pd}]+in[\s\p{Pd}]+class/giu, blank).replace(RANK_FORM_RE, blank);
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ w: m[0].toLowerCase(), s: m.index, e: m.index + m[0].length }));
  const spans = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])top\s+\d+(?:\.\d+)?\s?%?/giu)) spans.push({ s: m.index, e: m.index + m[0].trimEnd().length });
  for (const m of text.matchAll(/#\s?1(?!\d)|(?<![\p{L}\p{N}])no\.?\s?1(?!\d)|(?<![\p{L}\p{N}])number one(?![\p{L}\p{N}])/giu)) spans.push({ s: m.index, e: m.index + m[0].length });
  words.forEach((word, i) => {
    if (["ranked", "rank", "ranking", "highest", "winner", "winners"].includes(word.w)) spans.push({ s: word.s, e: word.e });
    if (word.w === "best") {
      const next = words[i + 1];
      const joined = next && /^[\s\p{Pd}]*$/u.test(text.slice(word.e, next.s)) && !AFTER_BEST_SKIP.has(next.w) && !/^\d/.test(next.w);
      spans.push({ s: word.s, e: joined ? next.e : word.e });
    }
    if (ORDINALS.has(word.w)) {
      const at = (j) => spans.push({ s: Math.min(word.s, words[j].s), e: Math.max(word.e, words[j].e) });
      for (let j = Math.max(0, i - 3); j <= Math.min(words.length - 1, i + 3); j++) {
        if (j !== i && RANK_CONTEXT.has(words[j].w)) at(j);
      }
      for (let j = i + 1; j <= Math.min(words.length - 1, i + 3); j++) if (RANK_AFTER.has(words[j].w)) at(j);
      if (words[i + 1]?.w === "place") at(i + 1);
      if (["in", "of"].includes(words[i + 1]?.w)) {
        let j = i + 2;
        while (j < words.length && j <= i + 4 && RANK_GROUP_FILLER.has(words[j].w)) j++;
        if (RANK_GROUP.has(words[j]?.w)) at(j);
      }
      const prev = words[i - 1]?.w;
      if (RANK_BEFORE.has(prev)) at(i - 1);
      else if (["in", "at"].includes(prev) && RANK_BEFORE.has(words[i - 2]?.w)) at(i - 2);
    }
  });
  return mergeSpans(spans).map(({ s, e }) => text.slice(s, e).trim()).filter(Boolean);
}

/** Tenure claims in cleaned text: "decade", "several years", "long-standing", "years of experience" with no figure. */
function tenureHits(clean) {
  const text = withoutExemptions(clean);
  const out = [];
  // "long-time" and "longtime", never "a long time" (spaced) which is no tenure claim.
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])(?:decades?|long[\s\p{Pd}]?standing|long\p{Pd}?time|multi[\s\p{Pd}]?years?)(?![\p{L}\p{N}])/giu)) out.push(m[0]);
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])(?:several|many|multiple|numerous|countless|a\s+few|(?:a\s+)?couple\s+of)\s+(?:years?|yrs?\.?)(?![\p{L}\p{N}])/giu)) out.push(m[0]);
  // "years of experience", "years experience", "years' experience", "yrs. of experience", and up to three
  // words between ("years of rich experience", "years of solid finance experience"), with no figure before it.
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])(?:years?|yrs?\.?)['’]?\s+(?:of\s+)?(?:[\p{L}\p{Pd}'’]+\s+){0,3}?experience(?![\p{L}\p{N}])/giu)) {
    const before = /([\p{L}\p{N}+]+)[\s+-]*$/u.exec(text.slice(Math.max(0, m.index - 24), m.index));
    const prev = before?.[1].toLowerCase() ?? "";
    if (/\d/.test(prev) || NUMBER_BEFORE_YEARS.has(prev)) continue;
    out.push(m[0]);
  }
  return out;
}

const phraseHits = (clean) => [...rankHits(clean).map((v) => ({ kind: "rank", value: v })), ...tenureHits(clean).map((v) => ({ kind: "tenure", value: v }))];
const sourcePhraseKeys = (src) => fromSource(src, "phrases", (text) => new Set(phraseHits(cleanSource(text)).map(({ kind, value }) => `${kind}|${phraseKey(value)}`)));

/**
 * Every claim word and phrase in `text` (cleaned) with whether the facts back it.
 * @returns {{ kind: string, value: string, index: number, end: number, supported: boolean }[]} words only; phrases have index -1
 */
function claimMatches(clean, sourceText) {
  const text = withoutExemptions(clean);
  const inSource = sourcePredicate(sourceText);
  const inTitle = seniorityPredicate(sourceText);
  const found = [];
  for (const match of text.matchAll(CLAIM_RE)) {
    const entry = CLAIM_BY_FORM.get(formKey(match[0].replace(/\s+/g, " ")));
    if (!entry) continue;
    const check = entry.kind === "seniority" ? inTitle : inSource;
    const family = entry.form === "award-winning" ? AWARD_WORDS : entry.family;
    found.push({
      kind: entry.kind, value: match[0].replace(/\s+/g, " "), index: match.index, end: match.index + match[0].length,
      supported: family.some(check), form: entry.form,
    });
  }
  // "bachelor's degree" is one thing for the user to confirm, not two.
  const merged = [];
  for (const hit of found) {
    const prev = merged[merged.length - 1];
    if (prev && hit.kind === "credential" && prev.kind === "credential" && !prev.supported && !hit.supported
      && /^degrees?$/i.test(hit.value) && /^\s+$/.test(text.slice(prev.end, hit.index))) {
      prev.value = `${prev.value} ${hit.value}`;
      prev.end = hit.end;
    } else merged.push({ ...hit });
  }
  return merged;
}

/**
 * Credential, rank, tenure, language, seniority, scope and expertise claims in `text`
 * that the facts never state, in any letter case. Seniority words are backed only by a
 * title line, the summary or an added fact; every other kind by the facts anywhere.
 *
 * @param {string} text
 * @param {string} sourceText the user's confirmed facts, serialised
 * @returns {{ kind: string, value: string }[]} value is the word or phrase as written
 */
export function unsupportedClaimWords(text, sourceText) {
  const clean = cleanText(text);
  const out = claimMatches(clean, sourceText).filter((h) => !h.supported).map(({ kind, value }) => ({ kind, value }));
  const keys = sourcePhraseKeys(sourceText);
  for (const { kind, value } of phraseHits(clean)) if (!keys.has(`${kind}|${phraseKey(value)}`)) out.push({ kind, value });
  return out;
}

// ---- text the check cannot read ----------------------------------------------------

const SCRIPTS = ["Latin", "Cyrillic", "Greek", "Armenian", "Hebrew", "Arabic", "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya",
  "Tamil", "Telugu", "Kannada", "Malayalam", "Sinhala", "Thai", "Han", "Hiragana", "Katakana", "Hangul", "Georgian", "Ethiopic"]
  .map((name) => [name, new RegExp(`\\p{Script=${name}}`, "u")]);
const LATIN_TOKEN = /^[\p{Script=Latin}\p{M}\p{N}]+$/u;
const scriptOf = (ch) => SCRIPTS.find(([, re]) => re.test(ch))?.[0] ?? "Other";

/** Tokens of cleaned text that have a letter outside the Latin script, as written, with the scripts their letters use. */
function nonLatinTokens(clean) {
  const out = [];
  if (!/[^\u0000-ɏḀ-ỿ]/.test(clean)) return out;
  for (const m of clean.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    if (LATIN_TOKEN.test(m[0])) continue;
    const scripts = new Set();
    for (const ch of m[0]) if (/\p{L}/u.test(ch)) scripts.add(scriptOf(ch));
    if (scripts.size) out.push({ token: m[0].toLowerCase(), written: m[0], scripts });
  }
  return out;
}
const sourceNonLatin = (src) => fromSource(src, "nonlatin", (text) => new Set(nonLatinTokens(cleanSource(text)).map((t) => t.token)));

/**
 * The first token the fact check cannot read (mixed scripts, or letters outside the Latin
 * script), as written, or null. A token the facts contain verbatim is always readable: it
 * is the user's own wording ("200 µs", "10 kΩ", which NFKC turns into Greek letters).
 */
function unreadableToken(clean, sourceText) {
  let known = null;
  for (const { token, written, scripts } of nonLatinTokens(clean)) {
    if (scripts.size === 1 && scripts.has("Latin")) continue;
    known ??= sourceNonLatin(sourceText);
    if (!known.has(token)) return written;
  }
  return null;
}

// ---- what an attest may add -------------------------------------------------------

// Words that make a rank or tenure phrase on their own, beyond the listed forms.
const PHRASE_CLAIM_WORDS = new Set("best highest top winner winners ranked rank ranking decade decades".split(" "));

/**
 * True when `word` can stand in an attested phrase without claiming anything itself:
 * Latin letters only, not a claim form, not name-shaped (unless an ordinary opener word).
 * Used to pick the noun in "12 analysts".
 */
export function isPlainPhraseWord(word) {
  const w = String(word ?? "");
  if (!/^[\p{Script=Latin}'’]+$/u.test(w)) return false;
  const l = lower(w).replace(/’/g, "'");
  if (CLAIM_BY_FORM.has(l) || PHRASE_CLAIM_WORDS.has(l)) return false;
  return !(nameShaped(w) && !OPENERS.has(l));
}

const RANK_FIGURE_SHAPE = /^(?:top\s+\d+(?:\.\d+)?\s?%?|#\s?\d+)$/iu;

const containsWord = (haystack, needle) => {
  const n = escapeRegExp(lower(String(needle)).trim());
  return Boolean(n) && new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, "u").test(lower(String(haystack)));
};

/**
 * Claims that confirming `statement` as a fact would also confirm, beyond the issue
 * being attested. An attest stores a string; every word in it then backs other lines, so
 * the string must carry nothing the user has not been asked about. Returns the leftover
 * issues; any non-Latin or mixed-script token is always one ("unreadable").
 *
 * Allowed inside the statement besides the issue itself: the name-shaped parts of a listed
 * claim form ("C" in "C-suite"), and the figure of a rank shaped "top N", "top N%" or "#N".
 * Known gap: a lower-case name ("12 deloitte") reads as an ordinary noun and is stored.
 *
 * @param {string} statement what the attest would store
 * @param {string} sourceText the current confirmed facts
 * @param {{ kind: string, value: string, attestAs?: string }} issue the issue being attested
 * @returns {{ kind: string, value: string }[]}
 */
export function attestLeftovers(statement, sourceText, issue) {
  if (nonLatinTokens(cleanText(statement)).length) return [{ kind: "unreadable", value: "" }];
  const isForm = CLAIM_BY_FORM.has(formKey(issue.value));
  const same = (a, b) => Boolean(b) && lower(String(a)).trim() === lower(String(b)).trim();
  return checkText({ text: statement, sourceText }).issues
    .filter((i) => {
      if (same(i.value, issue.value) || same(i.value, issue.attestAs)) return false;
      if (i.kind === "name" && isForm && containsWord(issue.value, i.value)) return false;
      // A figure is part of the rank only in "top N", "top N%" and "#N"; a wider span ("Secured 12
      // clients, first") would confirm "12" for anything.
      if (i.kind === "number" && issue.kind === "rank" && RANK_FIGURE_SHAPE.test(issue.value.trim()) && containsWord(issue.value, i.value)) return false;
      return true;
    })
    .map(({ kind, value }) => ({ kind, value }));
}

// ---- the check ---------------------------------------------------------------------

// The engine's coverage gaps that do not block. "no-count-claims-recognized" means the
// engine's count extractor read no count in the line; this layer checks every figure
// itself (numberClaims and the number-context check), so that gap leaves nothing
// unchecked here. Any other reason, notably "scope-not-checked" (a language the engine
// could not read), blocks.
export const NON_BLOCKING_COVERAGE = ["no-count-claims-recognized"];

// Names the token, so the user can find a look-alike letter they cannot see.
const unreadableMessage = (token) => `This line contains "${token}", which mixes alphabets or uses letters outside the English alphabet, so the fact check cannot read it. Rewrite it in English letters, or remove it.`;
const COVERAGE_MESSAGE = "The fact check could not read this line fully, so it is blocked. Rewrite it in plain English.";

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
 * @returns {{ verdict: 'pass'|'warn'|'block', issues: { kind: string, value: string, message: string, attestAs?: string }[], advisory: string[], engineRan: boolean }}
 *   `attestAs`, on a figure absent from the facts, is the phrase an attest of `value` adds as a fact.
 */
export function checkText({ text, sourceText, before = "", jdText = "", cannotConfirm = [], engineGate } = {}) {
  const target = cleanText(text);
  const issues = [];
  const seen = new Set();
  const add = (kind, value, message, attestAs) => {
    const id = `${kind}|${lower(String(value))}`;
    if (seen.has(id)) return;
    seen.add(id);
    issues.push(attestAs ? { kind, value: String(value), message, attestAs } : { kind, value: String(value), message });
  };

  for (const phrase of cannotConfirm) {
    if (containsPhrase(target, phrase)) {
      add("blocked", phrase, `You marked "${phrase}" as something you can't confirm, so it stays out.`);
    }
  }

  const allowedNumbers = fromSource(sourceText, "numbers", (src) => new Set(numberClaimsOf(src, cleanSource(src)).map((c) => c.key)));
  let contexts = null;
  for (const claim of numberClaims(target)) {
    if (!allowedNumbers.has(claim.key)) {
      // The user confirms the figure with what it is about ("12 analysts"), not a bare "12",
      // so the fact they add also passes the number-context check for this line.
      contexts ??= figureContexts(target);
      const phrase = contexts.find((c) => c.key === claim.key && c.raw === claim.raw && c.value)?.value;
      if (phrase) {
        add("number", claim.raw, `The figure "${claim.raw}" is not in your confirmed facts. Confirm "${phrase}" only if it is true.`, phrase);
      } else {
        add("number", claim.raw, `The figure "${claim.raw}" is not in your confirmed facts.`);
      }
    }
  }
  for (const { value, raw } of unsupportedNumberContexts(target, sourceText)) {
    add("number", value, `The figure "${raw}" is in your confirmed facts, but about something else. Confirm "${value}" only if it is true.`);
  }

  const matches = claimMatches(target, sourceText);
  for (const { kind, value, supported } of matches) {
    if (!supported) add(kind, value, `"${value}" is not in your confirmed facts.`);
  }
  const keys = sourcePhraseKeys(sourceText);
  for (const { kind, value } of phraseHits(target)) {
    if (!keys.has(`${kind}|${phraseKey(value)}`)) add(kind, value, `"${value}" is not in your confirmed facts.`);
  }

  // Value "" so nothing here can be attested: the token is shown in the message only.
  const unreadable = unreadableToken(target, sourceText);
  if (unreadable !== null) add("unreadable", "", unreadableMessage(unreadable));

  // Name check on the line without the claim forms the facts back ("Sr.", "Vice President"
  // are claim words, not names) and without exempt phrases.
  let nameText = withoutExemptions(target);
  for (const m of [...matches].reverse()) {
    if (m.supported) nameText = nameText.slice(0, m.index) + " ".repeat(m.end - m.index) + nameText.slice(m.end);
  }
  const facts = factTokenSet(sourceText);
  for (const name of unsupportedNames(nameText, facts)) {
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
    // A coverage gap means part of the line was not checked: fail closed unless the gap is a known harmless one.
    if (result?.coverage && !NON_BLOCKING_COVERAGE.includes(result.coverage.reason)) add("coverage", "", COVERAGE_MESSAGE);
  }

  // The same value can be reported by both layers under different kinds. An empty value
  // names no claim, so those are kept apart by kind.
  const byValue = new Map();
  for (const issue of issues) {
    const id = issue.value ? lower(issue.value) : `\0${issue.kind}`;
    if (!byValue.has(id)) byValue.set(id, issue);
  }
  const unique = [...byValue.values()];

  const advisory = borrowedTerms(target, facts, { before, jdText });
  return {
    verdict: unique.length ? "block" : advisory.length ? "warn" : "pass",
    issues: unique,
    advisory,
    engineRan,
  };
}
