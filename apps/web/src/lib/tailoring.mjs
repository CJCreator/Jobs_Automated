// Decisions on tailoring suggestions: what each review action does, and what
// may be exported. Every verdict here is recomputed from the user's current
// confirmed facts; a stored `check` is only ever a display cache and is never
// trusted for a decision, because facts change after a check was stored.
//
// Pure functions, no I/O. The engine gate is passed in so tests can stub it.

import { checkText } from "./claims.mjs";
import { MAX_FACT_BASE_CHARS, buildResume, factBaseText } from "./facts.mjs";

const randomUUID = () => globalThis.crypto.randomUUID();

export const MAX_TEXT = 600;
const MAX_RATIONALE = 300;
const MAX_VALUE = 200;
const MAX_EXTRAS = 60;
const MAX_CANNOT_CONFIRM = 200;

// How many suggestions one tailoring keeps. Each is gate-checked on every read, review action and
// export, so the count multiplies their cost. 20 at the fact-base cap, on realistic text, is about
// 0.4 s: at least 2x under the budget. A test holds that margin.
export const MAX_SUGGESTIONS = 20;

// The most gate time one request may spend, checked between checks. When it runs out the request
// fails closed (503) rather than answering with a partial check. Together with the fact-base cap
// the worst case is this budget plus one gate call (about 70 ms at the cap, worst shape).
export const GATE_BUDGET_MS = 1000;

/** A refused action, carrying the HTTP status a route should answer with. */
export class TailoringError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message plain words, shown to the user
   */
  constructor(status, code, message) {
    super(message);
    this.name = "TailoringError";
    this.status = status;
    this.code = code;
  }
}

const FACTS_TOO_LARGE_MESSAGE =
  "Your confirmed facts are too long to check, so nothing can be reviewed or exported. Remove or unconfirm some items on your facts page, then try again.";
const FACTS_TOO_LARGE = { kind: "facts_too_large", value: "", message: FACTS_TOO_LARGE_MESSAGE };
const tooLargeError = () => new TailoringError(409, "facts_too_large", FACTS_TOO_LARGE_MESSAGE);

/**
 * A time budget for one request's gate work. `clock` is injectable for tests.
 * @param {number} [ms]
 * @param {() => number} [clock]
 */
export function gateBudget(ms = GATE_BUDGET_MS, clock = () => performance.now()) {
  const start = clock();
  return { exhausted: () => clock() - start >= ms };
}

function assertBudget(ctx) {
  if (ctx?.budget?.exhausted()) {
    throw new TailoringError(503, "check_too_slow", "Your confirmed facts and this tailoring are too large to check in time. Shorten or unconfirm some facts on your facts page, then open this again.");
  }
}

const ENGINE_MISSING = {
  kind: "engine",
  value: "",
  message: "The full fact check did not run, so this cannot be exported. Try again later.",
};

const lower = (s) => String(s ?? "").trim().toLowerCase();
const sameText = (a, b) => lower(a) === lower(b);
const asList = (v) => (Array.isArray(v) ? v.filter((s) => s && typeof s === "object") : []);

/**
 * @typedef {{ sourceText: string, jdText?: string, cannotConfirm?: string[], engineGate?: Function }} CheckContext
 * @typedef {{ jdText?: string, engineGate?: Function, now?: Date }} ActionContext
 */

/** The check context for a set of facts. Always rebuilt from the facts themselves. */
function contextFor(facts, { jdText = "", engineGate, budget = gateBudget() } = {}) {
  const sourceText = factBaseText(facts);
  // Over the cap the engine is not run and the text is never truncated: every check fails closed.
  return { sourceText, cannotConfirm: facts.cannotConfirm ?? [], jdText, engineGate, budget, tooLarge: sourceText.length > MAX_FACT_BASE_CHARS };
}

/**
 * The suggestion with a fresh `check` of its `finalText`.
 * @param {any} suggestion
 * @param {CheckContext} ctx
 */
export function checkSuggestion(suggestion, { sourceText, jdText = "", cannotConfirm = [], engineGate, budget, tooLarge = false }) {
  if (tooLarge) {
    return { ...suggestion, check: { verdict: "block", issues: [FACTS_TOO_LARGE], advisory: [], engineRan: false } };
  }
  assertBudget({ budget });
  const check = checkText({
    text: typeof suggestion.finalText === "string" ? suggestion.finalText : "",
    sourceText,
    before: typeof suggestion.before === "string" ? suggestion.before : "",
    jdText,
    cannotConfirm,
    engineGate,
  });
  return { ...suggestion, check };
}

/**
 * Turn the AI's rewrites into full suggestions, each checked.
 * @param {{ ref: string, after: string, rationale?: string }[]} rawRewrites from suggestRewrites()
 * @param {{ ref: string, kind: 'bullet'|'summary', context: string, text: string }[]} lines from tailorableLines()
 * @param {CheckContext} ctx
 */
export function buildSuggestions(rawRewrites, lines, ctx) {
  if (typeof ctx?.sourceText === "string" && ctx.sourceText.length > MAX_FACT_BASE_CHARS) throw tooLargeError();
  const byRef = new Map((lines ?? []).map((l) => [l.ref, l]));
  const seen = new Set();
  const out = [];
  ctx = { ...ctx, budget: ctx.budget ?? gateBudget() };
  for (const raw of Array.isArray(rawRewrites) ? rawRewrites : []) {
    if (out.length >= MAX_SUGGESTIONS) break;
    // The model call is already paid for: out of time, keep what was checked and stop.
    if (ctx.budget.exhausted()) break;
    const line = byRef.get(raw?.ref);
    if (!line || seen.has(line.ref) || typeof raw.after !== "string") continue;
    const after = raw.after.trim().slice(0, MAX_TEXT);
    if (!after) continue;
    seen.add(line.ref);
    out.push(checkSuggestion({
      id: randomUUID(),
      ref: line.ref,
      kind: line.kind,
      context: line.context,
      before: line.text,
      after,
      rationale: typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, MAX_RATIONALE) : "",
      decision: "pending",
      finalText: after,
    }, ctx));
  }
  return out;
}

/** Re-check every suggestion; an accepted one that now blocks goes back to pending. */
function recheckAll(suggestions, ctx) {
  return suggestions.map((s) => {
    const checked = checkSuggestion(s, ctx);
    return checked.decision === "accepted" && checked.check.verdict === "block" ? { ...checked, decision: "pending" } : checked;
  });
}

/** The issue on this suggestion, freshly computed, whose value is `value`. */
function currentIssue(suggestion, ctx, value) {
  return checkSuggestion(suggestion, ctx).check.issues.find((i) => sameText(i.value, value)) ?? null;
}

function requireValue(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v || v.length > MAX_VALUE) throw new TailoringError(400, "invalid_value", "Choose one of the flagged items on this change.");
  return v;
}

const isoDate = (now) => (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()).toISOString().slice(0, 10);

/**
 * Apply one review action to one suggestion.
 *
 * @param {any} facts the user's current Fact Base
 * @param {any[]} suggestions the tailoring's suggestions
 * @param {string} sid the suggestion's id
 * @param {{ action?: string, text?: unknown, value?: unknown }} input
 * @param {ActionContext} ctx
 * @returns {{ facts: any, suggestions: any[], factsChanged: boolean }}
 * @throws {TailoringError}
 */
export function applyAction(facts, suggestions, sid, { action, text, value } = {}, ctx = {}) {
  const list = asList(suggestions);
  const index = list.findIndex((s) => s.id === sid);
  if (typeof sid !== "string" || index === -1) throw new TailoringError(404, "not_found", "That suggestion was not found.");
  const target = list[index];
  // One budget for the whole action, shared by every check it makes.
  ctx = { ...ctx, budget: ctx.budget ?? gateBudget() };
  const ctxNow = contextFor(facts, ctx);
  // Rejecting needs no check, so it still works on a fact base that is too large to check.
  if (ctxNow.tooLarge && action !== "reject") throw tooLargeError();
  const replace = (next) => list.map((s, i) => (i === index ? next : s));

  switch (action) {
    case "accept": {
      const checked = checkSuggestion(target, ctxNow);
      if (checked.check.verdict === "block") {
        throw new TailoringError(409, "blocked", "This change says something that is not in your confirmed facts, so it can't be accepted. Edit it, or confirm the fact first.");
      }
      return { facts, suggestions: replace({ ...checked, decision: "accepted" }), factsChanged: false };
    }

    case "reject":
      return { facts, suggestions: replace({ ...target, decision: "rejected" }), factsChanged: false };

    case "edit": {
      const t = typeof text === "string" ? text.trim() : "";
      if (!t || t.length > MAX_TEXT) {
        throw new TailoringError(400, "invalid_text", `The new wording must be between 1 and ${MAX_TEXT} characters.`);
      }
      const edited = checkSuggestion({ ...target, finalText: t, decision: "pending" }, ctxNow);
      return { facts, suggestions: replace(edited), factsChanged: false };
    }

    case "attest": {
      const v = requireValue(value);
      // Checked first: something the user said they can't confirm stays out for good.
      if ((facts.cannotConfirm ?? []).some((c) => sameText(c, v))) {
        // The message does not repeat the value: error text never carries request content.
        throw new TailoringError(409, "cannot_confirm", "You marked this as something you can't confirm, so it can't be added as a fact.");
      }
      const issue = currentIssue(target, ctxNow, v);
      if (!issue) throw new TailoringError(400, "not_an_issue", "You can only confirm an item that is flagged on this change.");
      const extras = Array.isArray(facts.extras) ? facts.extras : [];
      const existing = extras.find((x) => sameText(x.text, issue.value));
      if (!existing && extras.length >= MAX_EXTRAS) {
        throw new TailoringError(409, "too_many_facts", "You have added the most extra facts allowed. Remove one from your facts page first.");
      }
      const statedAt = isoDate(ctx.now);
      const nextExtras = existing
        ? extras.map((x) => (x === existing ? { ...x, confirmed: true, source: "user", statedAt } : x))
        : [...extras, { id: randomUUID(), text: issue.value, confirmed: true, source: "user", statedAt }];
      const nextFacts = { ...facts, extras: nextExtras };
      if (factBaseText(nextFacts).length > MAX_FACT_BASE_CHARS) throw tooLargeError();
      return { facts: nextFacts, suggestions: recheckAll(list, contextFor(nextFacts, ctx)), factsChanged: true };
    }

    case "cannot_confirm": {
      const v = requireValue(value);
      const issue = currentIssue(target, ctxNow, v);
      if (!issue) throw new TailoringError(400, "not_an_issue", "You can only mark an item that is flagged on this change.");
      const current = Array.isArray(facts.cannotConfirm) ? facts.cannotConfirm : [];
      const already = current.some((c) => sameText(c, issue.value));
      if (!already && current.length >= MAX_CANNOT_CONFIRM) {
        throw new TailoringError(409, "too_many_facts", "Your list of things you can't confirm is full. Remove one from your facts page first.");
      }
      const nextFacts = { ...facts, cannotConfirm: already ? current : [...current, issue.value] };
      return { facts: nextFacts, suggestions: recheckAll(list, contextFor(nextFacts, ctx)), factsChanged: true };
    }

    default:
      throw new TailoringError(400, "invalid_action", "That action is not recognised.");
  }
}

/**
 * Every suggestion as it should be shown now: checks recomputed against the
 * current facts. Decisions are left as stored; export re-checks them anyway.
 * @param {any} facts
 * @param {any[]} suggestions
 * @param {ActionContext} ctx
 */
export function freshChecks(facts, suggestions, ctx = {}) {
  const c = contextFor(facts, ctx);
  return asList(suggestions).map((s) => checkSuggestion(s, c));
}

/**
 * The suggestions to save after a review action. A reject changes no text, and an attest or
 * can't-confirm has already re-checked every suggestion against the changed facts inside
 * applyAction, so neither is checked again; any other action re-checks all of them once.
 * @param {{ facts: any, suggestions: any[], factsChanged: boolean }} result from applyAction
 * @param {string | undefined} action
 * @param {ActionContext} ctx
 */
export function checksAfterAction(result, action, ctx = {}) {
  return action === "reject" || result.factsChanged ? result.suggestions : freshChecks(result.facts, result.suggestions, ctx);
}

/**
 * What stops an export: every line the export would change whose exact
 * exported text does not pass a fresh check. Stored checks and anything a
 * client says are ignored. With no engine gate, everything is refused.
 *
 * @param {any} facts
 * @param {any[]} suggestions
 * @param {ActionContext} ctx
 * @returns {{ sid: string|null, ref: string|null, text: string, issues: { kind: string, value: string, message: string }[] }[]}
 */
export function exportBlockers(facts, suggestions, ctx = {}) {
  if (typeof ctx.engineGate !== "function") return [{ sid: null, ref: null, text: "", issues: [ENGINE_MISSING] }];
  const c = contextFor(facts, ctx);
  if (c.tooLarge) return [{ sid: null, ref: null, text: "", issues: [FACTS_TOO_LARGE] }];
  const list = asList(suggestions);
  // buildResume keeps the last accepted suggestion per line, so map back the same way.
  const acceptedByRef = new Map();
  for (const s of list) if (s.decision === "accepted") acceptedByRef.set(s.ref, s);
  const { changed } = buildResume(facts, list);
  const blockers = [];
  for (const { ref, before, after } of changed) {
    assertBudget(c);
    const check = checkText({ text: after, sourceText: c.sourceText, before, jdText: c.jdText, cannotConfirm: c.cannotConfirm, engineGate: c.engineGate });
    if (check.verdict === "block" || !check.engineRan) {
      blockers.push({ sid: acceptedByRef.get(ref)?.id ?? null, ref, text: after, issues: check.issues.length ? check.issues : [ENGINE_MISSING] });
    }
  }
  return blockers;
}
