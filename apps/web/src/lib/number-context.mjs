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
// Not covered: a wrong subject that shares one noun with the right one, such as
// "Led 12 branch analysts" when the facts hold "12 branches" (a documented gap
// in the tests).
//
// Measured on the HONEST fixture (116 lines, 92 non-year figures), against the
// source alone and with the extra facts the tests add: 0 false blocks at
// CONTEXT_WINDOW = 2, with every must-block and must-pass case holding. Other
// windows, same cases: 1 misses "Reduced costs by 30%" and falsely blocks 5
// honest lines; 3 and 4 have 0 false blocks but miss "Led 12 analysts across
// branches". "of" does not use up the window ("oversight of 2 crore").
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
const SENTENCE_BREAK = /[.!?]+(?=\s+[\p{Lu}"“(\[]|\s*$)|[;|•\n]/gu;

function sentences(text) {
  return cleanText(text).split(SENTENCE_BREAK).map((s) => s.trim()).filter(Boolean);
}

/** Find where a claim sits in a sentence, scanning forward from `from`. Returns [start, end] or null. */
function locate(sentence, lowered, claim, from) {
  const raw = claim.raw.toLowerCase();
  let i = lowered.indexOf(raw, from);
  if (i >= 0) return [i, i + raw.length];
  // The text was rewritten before reading ("30 per cent", "30-45%"): find its digits.
  const digits = /\d[\d,]*(?:\.\d+)?/.exec(raw)?.[0];
  if (digits) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${digits.replace(/[.,]/g, "\\$&")}`, "u");
    const m = re.exec(sentence.slice(from));
    if (m) return [from + m.index, from + m.index + digits.length];
  }
  return null;
}

/** Figures in a sentence with where they sit: { key, raw, start, end }. */
function figures(sentence) {
  const lowered = sentence.toLowerCase();
  const out = [];
  let from = 0;
  for (const claim of numberClaims(sentence)) {
    if (claim.key.endsWith("|year")) continue;
    const at = locate(sentence, lowered, claim, from) ?? locate(sentence, lowered, claim, 0);
    if (!at) continue;
    from = at[1];
    out.push({ key: claim.key, raw: claim.raw, start: at[0], end: at[1] });
  }
  return out;
}

function reach(side, window) {
  const out = [];
  let used = 0;
  for (const w of side) {
    if (w.word !== "of") {
      if (used === window) break;
      used++;
    }
    out.push(w);
  }
  return out;
}

/** The nouns that sit within the window of a figure, nearest first, each with its written form. */
function nearbyNouns(sentence, fig, window = CONTEXT_WINDOW) {
  const all = words(sentence);
  // "of" links two nouns ("oversight of 2 crore", "team of 12") and does not use up the window.
  const right = reach(all.filter((w) => w.start >= fig.end), window);
  const left = reach(all.filter((w) => w.end <= fig.start).reverse(), window);
  const take = (side) => {
    const kept = [];
    for (const w of side) {
      if (BARRIERS.has(w.word)) break;
      kept.push(w);
    }
    return kept;
  };
  const r = take(right).map((w, i) => ({ ...w, dist: i, side: "right" }));
  const l = take(left).map((w, i) => ({ ...w, dist: i, side: "left" }));
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
    for (const fig of figures(sentence)) {
      const holders = index.get(fig.key);
      if (!holders) continue;
      const nouns = nearbyNouns(sentence, fig);
      if (!nouns.length) continue;
      const stems = nouns.map((n) => stem(n.word));
      // An empty fact set is a bare figure the user confirmed on its own.
      if (holders.some((set) => set.size === 0 || stems.some((s) => set.has(s)))) continue;
      const head = nouns[0];
      const value = `${fig.raw} ${head.written}`.slice(0, 60);
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, raw: fig.raw });
    }
  }
  return out;
}
