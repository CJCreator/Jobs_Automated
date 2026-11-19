// P0-13: one signed-in user cannot stall the process through the fact gate.
// Caps (fact-base size, suggestion count), a per-request time budget that
// fails closed, and a per-user rate limit.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_FACT_BASE_CHARS, factBaseText, factBaseTooLarge, normalizeFacts, emptyFacts } from "../src/lib/facts.mjs";
import {
  GATE_BUDGET_MS,
  MAX_SUGGESTIONS,
  TailoringError,
  applyAction,
  buildSuggestions,
  exportBlockers,
  freshChecks,
  gateBudget,
} from "../src/lib/tailoring.mjs";
import { checkText } from "../src/lib/claims.mjs";
import { SOURCE } from "./fixtures/honest-lines.mjs";

let gate;
before(async () => {
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  const { verifyFactsFromText } = await import("../../../packages/engine/verify-cv-facts.mjs");
  gate = (text, { sourceText }) => verifyFactsFromText(text, { sourceText });
});

const fill = (unit, n) => {
  let s = "";
  while (s.length < n) s += unit;
  return s.slice(0, n);
};

/** Confirmed facts: `jobs` jobs of `perJob` bullets, each bullet made by `bullet(i)`. */
function bigFacts(jobs, perJob, bullet) {
  let n = 0;
  return normalizeFacts({
    contact: { name: "Asha Rao", confirmed: true },
    experience: Array.from({ length: jobs }, (_, j) => ({
      id: `exp-${j}-aaaa`, company: `Company ${j}`, title: "Analyst", confirmed: true,
      bullets: Array.from({ length: perJob }, () => ({ id: `b-${n}-aaaa`, text: bullet(n++), confirmed: true })),
    })),
  }, { trustConfirmed: true });
}

const WORDS = "Led reporting automation across finance operations using SQL Power BI Excel reducing close time managed vendor contracts analysts budgets crore stakeholders dashboards reconciliation forecasting audit compliance migration".split(" ");
const realisticBullet = (i) => `${fill(WORDS.slice(i % 7).join(" ") + " ", 110)} by ${(i % 90) + 5}%`;
// Digit and number-claim runs, the most expensive shape measured.
const hostileBullet = () => fill("30% 40% 2x ₹5 crore ", 600);

/** Largest facts that fit the cap, built from bullets of `bullet`. */
function factsAtCap(bullet) {
  const per = 20;
  let lo = 1;
  let hi = 30;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (factBaseText(bigFacts(mid, per, bullet)).length <= MAX_FACT_BASE_CHARS) lo = mid; else hi = mid - 1;
  }
  return bigFacts(lo, per, bullet);
}

function suggestionsFor(facts, n) {
  const lines = [];
  for (const e of facts.experience) for (const b of e.bullets) lines.push({ ref: `bullet:${e.id}:${b.id}`, kind: "bullet", context: "x", text: b.text });
  return lines.slice(0, n).map((l, i) => ({
    id: `sid-${i}`, ref: l.ref, kind: "bullet", context: l.context, before: l.text,
    after: `Reduced month-end close time by 30% using SQL and Power BI ${fill("budgets of ₹2 crore ", 300)}`.slice(0, 600),
    decision: "accepted", finalText: `Reduced month-end close time by 30% using SQL and Power BI ${fill("budgets of ₹2 crore ", 300)}`.slice(0, 600),
  }));
}

// --- the fact-base cap ----------------------------------------------------

test("honest fact bases fit the cap with a wide margin", () => {
  // The honest fixture is tiny; a dense four-page CV is about 12k characters.
  const fixture = normalizeFacts({ summary: { text: SOURCE, confirmed: true } }, { trustConfirmed: true });
  assert.ok(factBaseText(fixture).length * 50 < MAX_FACT_BASE_CHARS, "the honest fixture is under 2% of the cap");
  const longCv = bigFacts(10, 10, realisticBullet);
  const size = factBaseText(longCv).length;
  assert.ok(size > 12_000 && size * 2 < MAX_FACT_BASE_CHARS, `a 10-job, 100-bullet CV is ${size} chars, under half the cap`);
  assert.equal(factBaseTooLarge(longCv), false);
  assert.equal(factBaseTooLarge(emptyFacts()), false);
});

test("a fact base over the cap is reported too large", () => {
  const huge = bigFacts(30, 25, () => fill("x ", 600));
  assert.ok(factBaseText(huge).length > MAX_FACT_BASE_CHARS);
  assert.equal(factBaseTooLarge(huge), true);
});

test("unconfirmed items do not count toward the cap: they are not gate input", () => {
  const facts = bigFacts(30, 25, () => fill("x ", 600));
  for (const e of facts.experience) { e.confirmed = false; }
  assert.equal(factBaseTooLarge(facts), false);
});

test("a stored fact base over the cap fails closed: engine not run, export refused, nothing truncated", () => {
  const huge = bigFacts(30, 25, () => fill("x ", 600));
  let calls = 0;
  const spy = () => { calls++; return { invented: [], unsupportedFacts: [], forbidden: [] }; };
  const sugg = suggestionsFor(huge, 3);

  const blockers = exportBlockers(huge, sugg, { engineGate: spy });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].issues[0].kind, "facts_too_large");
  assert.match(blockers[0].issues[0].message, /too long|too large/i);

  // Even with nothing to change, an over-cap fact base is never exported.
  assert.equal(exportBlockers(huge, [], { engineGate: spy }).length, 1);

  const shown = freshChecks(huge, sugg, { engineGate: spy });
  assert.ok(shown.every((s) => s.check.verdict === "block" && s.check.engineRan === false && s.check.issues[0].kind === "facts_too_large"));
  assert.equal(calls, 0, "the gate never ran");
});

test("review actions on an over-cap fact base are refused, except reject", () => {
  const huge = bigFacts(30, 25, () => fill("x ", 600));
  const sugg = suggestionsFor(huge, 2).map((s) => ({ ...s, decision: "pending" }));
  const spy = () => { throw new Error("gate must not run"); };
  for (const input of [{ action: "accept" }, { action: "edit", text: "hello" }, { action: "attest", value: "x" }, { action: "cannot_confirm", value: "x" }]) {
    assert.throws(
      () => applyAction(huge, sugg, "sid-0", input, { engineGate: spy }),
      (e) => e instanceof TailoringError && e.status === 409 && e.code === "facts_too_large",
      JSON.stringify(input),
    );
  }
  const out = applyAction(huge, sugg, "sid-0", { action: "reject" }, { engineGate: spy });
  assert.equal(out.suggestions[0].decision, "rejected");
});

test("buildSuggestions refuses an over-cap source text without running the gate", () => {
  const spy = () => { throw new Error("gate must not run"); };
  assert.throws(
    () => buildSuggestions([{ ref: "r", after: "x" }], [{ ref: "r", kind: "bullet", context: "c", text: "t" }], { sourceText: fill("x ", MAX_FACT_BASE_CHARS + 2), engineGate: spy }),
    (e) => e instanceof TailoringError && e.code === "facts_too_large",
  );
});

// --- the suggestion cap ---------------------------------------------------

test("buildSuggestions keeps at most MAX_SUGGESTIONS suggestions, in order", () => {
  const n = MAX_SUGGESTIONS * 3;
  const lines = Array.from({ length: n }, (_, i) => ({ ref: `r${i}`, kind: "bullet", context: "c", text: `line ${i}` }));
  const rewrites = lines.map((l) => ({ ref: l.ref, after: `${l.text} reworded` }));
  const calls = [];
  const gateSpy = (t) => { calls.push(t); return { invented: [], unsupportedFacts: [], forbidden: [] }; };
  const out = buildSuggestions(rewrites, lines, { sourceText: "line", engineGate: gateSpy });
  assert.equal(out.length, MAX_SUGGESTIONS);
  assert.deepEqual(out.map((s) => s.ref), lines.slice(0, MAX_SUGGESTIONS).map((l) => l.ref));
  assert.equal(calls.length, MAX_SUGGESTIONS, "dropped suggestions are not even checked");
});

// --- the time budget ------------------------------------------------------

test("an exhausted time budget fails closed in freshChecks, exportBlockers and applyAction", () => {
  const facts = bigFacts(2, 10, realisticBullet);
  const sugg = suggestionsFor(facts, 10);
  let now = 0;
  let calls = 0;
  const slow = () => { calls++; now += 400; return { invented: [], unsupportedFacts: [], forbidden: [] }; };
  const budget = () => gateBudget(1000, () => now);
  const tooSlow = (e) => e instanceof TailoringError && e.status === 503 && e.code === "check_too_slow";

  assert.throws(() => freshChecks(facts, sugg, { engineGate: slow, budget: budget() }), tooSlow);
  assert.equal(calls, 3, "stops after the call that used up the budget");

  now = 0; calls = 0;
  assert.throws(() => exportBlockers(facts, sugg, { engineGate: slow, budget: budget() }), tooSlow);
  assert.ok(calls <= 3);

  now = 0; calls = 0;
  const spent = budget();
  now = 1500; // the action's earlier work already used the budget
  assert.throws(
    () => applyAction(facts, sugg.map((s) => ({ ...s, decision: "pending" })), "sid-0", { action: "edit", text: "Cut close time by 30%" }, { engineGate: slow, budget: spent }),
    tooSlow,
  );
  assert.equal(calls, 0, "no check starts once the budget is gone");
});

test("a fast gate never trips the budget", () => {
  const facts = bigFacts(2, 10, realisticBullet);
  const sugg = suggestionsFor(facts, 10);
  const out = freshChecks(facts, sugg, { engineGate: gate });
  assert.equal(out.length, 10);
});

// --- worst-case gate time at the caps ------------------------------------

// The stated bound: the budget (1 s) plus one gate call. Measured on the test machine, one call at the
// cap is about 80 ms in the hostile shape, so the bound is checked at 2 s to leave room for a slow CI box.
const BOUND_MS = 2000;

test("worst case at the caps: hostile fact base, maximum suggestions, GET path is bounded", () => {
  assert.equal(GATE_BUDGET_MS, 1000);
  const facts = factsAtCap(hostileBullet);
  const sugg = suggestionsFor(facts, MAX_SUGGESTIONS);
  assert.equal(sugg.length, MAX_SUGGESTIONS);
  const t0 = performance.now();
  let outcome = "done";
  try { freshChecks(facts, sugg, { engineGate: gate }); } catch (e) { outcome = e.code; assert.equal(e.code, "check_too_slow"); }
  const ms = performance.now() - t0;
  assert.ok(ms < BOUND_MS, `GET path took ${ms.toFixed(0)} ms (${outcome})`);
});

test("worst case at the caps: hostile fact base, maximum suggestions, export path is bounded", () => {
  const facts = factsAtCap(hostileBullet);
  const sugg = suggestionsFor(facts, MAX_SUGGESTIONS);
  const t0 = performance.now();
  let outcome = "done";
  try { exportBlockers(facts, sugg, { engineGate: gate }); } catch (e) { outcome = e.code; assert.equal(e.code, "check_too_slow"); }
  const ms = performance.now() - t0;
  assert.ok(ms < BOUND_MS, `export path took ${ms.toFixed(0)} ms (${outcome})`);
});

test("an honest resume at the sizes people have is never cut short", () => {
  const facts = bigFacts(10, 8, realisticBullet);
  const sugg = suggestionsFor(facts, MAX_SUGGESTIONS);
  // A fake clock that never advances: the budget cannot trip however slow the machine is.
  let calls = 0;
  const counting = (text, opts) => { calls++; return gate(text, opts); };
  const out = freshChecks(facts, sugg, { engineGate: counting, budget: gateBudget(GATE_BUDGET_MS, () => 0) });
  assert.equal(out.length, MAX_SUGGESTIONS);
  assert.equal(calls, MAX_SUGGESTIONS, "every suggestion was checked");
});

test("realistic text at the caps finishes inside the budget with at least 2x margin", () => {
  const facts = factsAtCap(realisticBullet);
  const size = factBaseText(facts).length;
  assert.ok(size > MAX_FACT_BASE_CHARS * 0.9, `built ${size} chars, at the cap`);
  const target = suggestionsFor(facts, 1)[0].finalText;
  for (let i = 0; i < 3; i++) checkText({ text: target, sourceText: factBaseText(facts), engineGate: gate }); // warm up
  // Per-call time is the fastest of several runs, so a busy machine cannot inflate it.
  let perCall = Infinity;
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now();
    checkText({ text: target, sourceText: factBaseText(facts), engineGate: gate });
    perCall = Math.min(perCall, performance.now() - t0);
  }
  const projected = perCall * MAX_SUGGESTIONS;
  assert.ok(projected * 2 <= GATE_BUDGET_MS, `${perCall.toFixed(1)} ms per call x ${MAX_SUGGESTIONS} = ${projected.toFixed(0)} ms; needs 2x margin under ${GATE_BUDGET_MS} ms`);
});

test("reject is never rolled back by the check budget: the route does not re-check after a reject", () => {
  // applyAction itself runs no check for reject, so even a spent budget cannot refuse it.
  const facts = bigFacts(2, 5, realisticBullet);
  const sugg = suggestionsFor(facts, 3).map((s) => ({ ...s, decision: "pending" }));
  let now = 0;
  const spent = gateBudget(1000, () => now);
  now = 5000;
  const out = applyAction(facts, sugg, "sid-0", { action: "reject" }, { engineGate: () => { throw new Error("no gate"); }, budget: spent });
  assert.equal(out.suggestions[0].decision, "rejected");
});

test("buildSuggestions keeps what it checked when the budget runs out, and does not throw", () => {
  const lines = Array.from({ length: 10 }, (_, i) => ({ ref: `r${i}`, kind: "bullet", context: "c", text: `line ${i}` }));
  const rewrites = lines.map((l) => ({ ref: l.ref, after: `${l.text} reworded` }));
  let now = 0;
  let calls = 0;
  const slow = () => { calls++; now += 400; return { invented: [], unsupportedFacts: [], forbidden: [] }; };
  const out = buildSuggestions(rewrites, lines, { sourceText: "line", engineGate: slow, budget: gateBudget(1000, () => now) });
  assert.equal(out.length, 3, "stopped after the call that used up the budget");
  assert.equal(calls, 3);
  assert.deepEqual(out.map((s) => s.ref), ["r0", "r1", "r2"]);
});

// The per-user rate limit (429 with Retry-After) runs inside the route wrappers, which node cannot import;
// it is covered by the flow test, step 13.
