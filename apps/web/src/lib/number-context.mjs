// Numbers in context: a figure passes only when the facts use the same figure
// about the same thing.
//
// claims.mjs checks that every figure (value and unit) appears somewhere in the
// confirmed facts. That lets "Led a team of 12 analysts" through when the facts
// hold a 12 about something else ("12 branches"). This layer looks at what the
// figure is about.
//
// Rule. For each figure in the text, take the nouns within CONTEXT_WINDOW words
// on either side, inside the same sentence, stopping at a word that introduces a
// tool or method ("using", "with", "via", "through"). Verbs and stop words are
// not nouns. The figure is supported when some fact sentence holding the same
// figure (same key from numberClaims) mentions one of those nouns, in any form
// ("analyst"/"analysts", "yr"/"years"). Unit words count as nouns. A fact
// sentence is read whole, verbs included, so "reduction" in a line can be backed
// by "Reduced" in a fact. A fact that is only the figure and its noun phrase
// ("12 analysts") supports that phrase, which is how a user attests a blocked
// figure: `value` is that phrase.
//
// Covered: a count, percentage or amount that the facts hold only about a
// different subject; the key must be in the facts (a figure absent from the
// facts is the existing check's job in claims.mjs). Years are exempt. A figure
// with no noun near it cannot be judged and passes.
//
// Not covered (each is a documented pass in KNOWN_GAPS in the tests): a wrong
// subject that shares one noun with the right one ("Led 12 branch analysts",
// "Led 12 audit analysts", "Led 3 audit teams", "Managed 4 analyst teams",
// "4 years of people management experience"); tool words in the fact sentence
// count as support ("Increased Power BI adoption 30%"); a figure whose subject
// is a verb or is out of reach ("Saved ₹2 crore", "Raised 2 crore funding",
// "Led 12 analysts, auditing branches", "Led 12" then a line break). Known
// false block: "Supported statutory audit for 12 locations".
//
// Measured on the HONEST fixture (116 lines, 92 non-year figures), against the
// source alone and with the extra facts the tests add: 0 false blocks, with
// every must-block and must-pass case holding. Stop words do not use up the
// window; CONTEXT_WINDOW counts other words, and a preposition ends the scan.
//
// Pure functions, no I/O, so `node --test` can import this file directly.

import { numberClaims, cleanText } from "./claims.mjs";

/** Words either side of a figure that count as its context. */
const CONTEXT_WINDOW = 2;

// Words that introduce a tool or method, not the thing the figure measures.
const BARRIERS = new Set([
  "using", "with", "via", "through", "leveraging", "utilising", "utilizing", "leveraged", "utilised", "utilized",
]);

const STOP = new Set(`
a an the and or but nor for from by at on in of to as into over across within per via
i we my our their its this that these those all both each every no not some any other such
more most less under above below after before during while when where which who what how why
if then than so yet since until about around beyond throughout toward towards upon without
based named among between against along up down off out
is are was were be been being has have had do does did will would can could
rs inr usd crore crores lakh lakhs lac lacs cr lpa percent pct cent mn bn million billion
worth over nearly almost approximately roughly
`.trim().split(/\s+/));

// Verbs that do not end in -ed. A resume bullet opens with one of these.
const IRREGULAR_VERBS = new Set(`
led built ran drove won cut grew wrote oversaw took set made held brought began rebuilt sold taught
spoke chose dealt kept met paid sent spent stood told understood shrank slashed trimmed saw got gave
found left lost put read rose fell thought taught
`.trim().split(/\s+/));

// Short words ending in -ed that are nouns or adjectives.
const NOT_VERBS_ED = new Set(["speed", "need", "feed", "seed", "breed", "embed", "proceed", "succeed", "exceed", "hundred", "weed", "bed", "red", "shed", "sled"]);

// Words ending in -ing that name a thing or a field of work.
const NOUN_ING = new Set(`
reporting budgeting accounting planning marketing training testing hiring engineering forecasting modelling
modeling billing banking auditing sourcing recruiting staffing onboarding lending trading pricing
`.trim().split(/\s+/));

const UNIT_FORMS = { yrs: "year", yr: "year", years: "year", mos: "month", mo: "month", hrs: "hour", hr: "hour" };

/** A coarse stem: enough to match "analyst"/"analysts" and "reduction"/"reduced". */
function stem(word) {
  let w = word.toLowerCase().replace(/['’]s?$/, "");
  if (UNIT_FORMS[w]) return UNIT_FORMS[w];
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith("ions")) w = w.slice(0, -4);
  else if (w.length > 5 && w.endsWith("ion")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es") && /(?:ch|sh|x|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // "reduce" and "reduced" and "reduction" meet at "reduc".
  if (w.length > 4 && w.endsWith("t") && /(?:duc|duct)$/.test(w)) w = w.replace(/duct$/, "duc");
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

const NUMBER_WORD = new Set(`
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen
eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand dozen
hundreds thousands millions billions dozens
`.trim().split(/\s+/));

function isVerbLike(w) {
  if (IRREGULAR_VERBS.has(w)) return true;
  if (w.length > 4 && w.endsWith("ed") && !NOT_VERBS_ED.has(w)) return true;
  if (w.length > 5 && w.endsWith("ing") && !NOUN_ING.has(w)) return true;
  return false;
}

const isNoun = (w) => w.length > 1 && !STOP.has(w) && !NUMBER_WORD.has(w) && !isVerbLike(w);

const WORD_RE = /\p{L}+(?:['’]\p{L}+)?/gu;

function words(text) {
  return [...text.matchAll(WORD_RE)].map((m) => ({ word: m[0].toLowerCase(), written: m[0], start: m.index, end: m.index + m[0].length }));
}

// A sentence ends at ". " before a capital, at the end of text, and at ; | a bullet or a line break.
// "Rs. 2 Cr", "B.Com" and "30.5%" are not ends.
const SENTENCE_BREAK = /[.!?](?=\s+[\p{Lu}"“(\[]|\s*$)|[;|•\n]/gu;

function sentences(text) {
  return cleanText(text).split(SENTENCE_BREAK).map((s) => s.trim()).filter(Boolean);
}

const EDGE = /[\p{L}\p{N}]/u;

/** Find where a claim sits in a sentence, scanning forward from `from`, on token edges. Returns [start, end] or null. */
function locate(sentence, lowered, claim, from) {
  const raw = claim.raw.toLowerCase();
  for (let i = lowered.indexOf(raw, from); i >= 0; i = lowered.indexOf(raw, i + 1)) {
    if (!EDGE.test(lowered[i - 1] ?? " ") && !EDGE.test(lowered[i + raw.length] ?? " ")) return [i, i + raw.length];
  }
  // The text was rewritten before reading ("30 per cent", "30-45%"): find its digits.
  const digits = /\d[\d,]*(?:\.\d+)?/.exec(raw)?.[0];
  if (digits) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${digits.replace(/[.,]/g, "\\$&")}(?!\\d)`, "gu");
    re.lastIndex = from;
    const m = re.exec(sentence);
    if (m) return [m.index, m.index + digits.length];
  }
  return null;
}

/** Figures in a sentence with where they sit: { key, raw, start, end }. */
function figures(sentence) {
  const lowered = sentence.toLowerCase();
  const out = [];
  let from = 0;
  for (const claim of numberClaims(sentence)) {
    const at = locate(sentence, lowered, claim, from) ?? locate(sentence, lowered, claim, 0);
    if (!at) continue;
    from = at[1];
    if (claim.key.endsWith("|year")) continue;
    out.push({ key: claim.key, raw: claim.raw, start: at[0], end: at[1] });
  }
  return out;
}

// A preposition ends the scan: what follows it is another phrase.
const PREP = new Set("across in at for on to from into within over per while and".split(" "));

/** Words from the figure outwards that count as its context: stop words are free, `window` others are kept. */
function reach(side, window) {
  const out = [];
  let used = 0;
  for (const w of side) {
    if (PREP.has(w.word)) break;
    if (!STOP.has(w.word)) {
      if (used === window) break;
      used++;
    }
    out.push(w);
  }
  return out;
}

const SCAN = 12; // words examined each side before the window rule applies

/** The nouns that sit within the window of a figure, nearest first. `all` is the sentence's words. */
function nearbyNouns(all, fig, window = CONTEXT_WINDOW) {
  // First word that starts at or after the figure's end (binary search).
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid].start >= fig.end) hi = mid;
    else lo = mid + 1;
  }
  const rightSide = all.slice(lo, lo + SCAN);
  const leftSide = all.slice(Math.max(0, lo - SCAN), lo).filter((w) => w.end <= fig.start).reverse();
  const take = (side) => {
    const kept = [];
    for (const w of side) {
      if (BARRIERS.has(w.word)) break;
      kept.push(w);
    }
    return kept;
  };
  const r = take(reach(rightSide, window)).map((w, i) => ({ ...w, dist: i, side: "right" }));
  const l = take(reach(leftSide, window)).map((w, i) => ({ ...w, dist: i, side: "left" }));
  return [...r, ...l].filter((w) => isNoun(w.word)).sort((a, b) => a.dist - b.dist || (a.side === "right" ? -1 : 1));
}

// Index of the facts: figure key -> one entry per fact sentence holding it, each a set of stems.
let cachedSource = null;
let cachedIndex = null;

function indexFacts(sourceText) {
  if (sourceText === cachedSource && cachedIndex) return cachedIndex;
  const index = new Map();
  for (const sentence of sentences(sourceText)) {
    const figs = figures(sentence);
    if (!figs.length) continue;
    // A fact sentence is read whole: every word that is not a stop word, verbs included.
    const stems = new Set(words(sentence).filter((w) => w.word.length > 1 && !STOP.has(w.word) && !NUMBER_WORD.has(w.word)).map((w) => stem(w.word)));
    for (const fig of figs) {
      if (!index.has(fig.key)) index.set(fig.key, []);
      index.get(fig.key).push(stems);
    }
  }
  cachedSource = sourceText;
  cachedIndex = index;
  return index;
}

/**
 * Figures in `text` that the facts hold only about something else.
 *
 * Judges only figures whose key (value and unit) is in the facts; a figure the
 * facts never state is claims.mjs's job. Years are exempt.
 *
 * @param {string} text the suggested (or user-edited) wording
 * @param {string} sourceText the user's confirmed facts, serialised
 * @returns {{ value: string, raw: string }[]} `value` is the figure with its nearest
 *   noun ("12 analysts"); confirming it as a fact clears the line
 */
export function unsupportedNumberContexts(text, sourceText) {
  const index = indexFacts(String(sourceText ?? ""));
  const out = [];
  const seen = new Set();
  for (const sentence of sentences(text)) {
    const all = words(sentence);
    for (const fig of figures(sentence)) {
      const holders = index.get(fig.key);
      if (!holders) continue;
      const nouns = nearbyNouns(all, fig);
      if (!nouns.length) continue;
      const stems = nouns.map((n) => stem(n.word));
      if (holders.some((set) => stems.some((s) => set.has(s)))) continue;
      const head = nouns[0];
      const value = `${fig.raw} ${head.written}`.slice(0, 60);
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, raw: fig.raw });
    }
  }
  return out;
}
