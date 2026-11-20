// P1-20: credentials, ranks, tenure, languages, unreadable text, engine coverage gaps,
// number context, and the per-source memo. Strict layer alone unless a test says "engine".
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  checkText, factTokenSet, numberClaims, unsupportedClaimWords, NON_BLOCKING_COVERAGE, CLAIM_FAMILIES,
} from "../src/lib/claims.mjs";
import { SOURCE_V, HONEST } from "./fixtures/honest-lines.mjs";

let engine;
let engineHasP119 = false;
before(async () => {
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  const mod = await import("../../../packages/engine/verify-cv-facts.mjs");
  engine = mod.verifyFactsFromText;
  engineHasP119 = Boolean(mod.CLAIM_FAMILIES);
});

const withExtra = (src, ...lines) => `${src}\n\n## Additional facts stated by the candidate\n${lines.map((l) => `- ${l}`).join("\n")}`;
const values = (r) => r.issues.map((i) => i.value.toLowerCase());
const run = (text, source = SOURCE_V, extra = {}) => checkText({ text, sourceText: source, ...extra });
const gated = (text, source = SOURCE_V) => checkText({ text, sourceText: source, engineGate: engine });

const BLOCK = [
  ["Completed a bachelor's degree in commerce", ["bachelor's degree"]],
  ["holds a master's degree in finance", ["master's degree"]],
  ["b.tech graduate who managed vendor contracts", ["b.tech"]],
  ["pmp and cfa charterholder", ["pmp", "cfa"]],
  ["Ranked 1st among analysts", ["ranked 1st"]],
  ["Ranked first in the region", ["ranked first"]],
  ["Second-highest rated analyst", ["second-highest"]],
  ["top 5 performer in the team", ["top 5"]],
  ["Best performer award", ["best performer", "award"]],
  ["Over a decade of experience in finance", ["decade"]],
  ["several years of experience in finance", ["several years"]],
  ["extensive experience across many years", ["many years"]],
  ["fluent in german and french", ["german", "french"]],
  ["Bilingual analyst who managed vendor contracts", ["bilingual"]],
  ["native tamil speaker", ["tamil"]],
];
for (const [text, want] of BLOCK) {
  test(`blocks: ${text}`, () => {
    const r = run(text);
    assert.equal(r.verdict, "block");
    const got = values(r);
    for (const w of want) assert.ok(got.includes(w), `${JSON.stringify(got)} should include ${w}`);
  });
}

test("blocks: a bullet does not support a title word", () => {
  const src = SOURCE_V.replace("**Senior Analyst**", "**Analyst**");
  const r = run("Assistant manager for vendor contracts", src.replace("- Handled budgets of ₹2 crore", "- Handled budgets of ₹2 crore\n- Reported to the Finance Manager"));
  assert.ok(values(r).includes("manager"));
  assert.equal(run("Assistant manager for vendor contracts", src.replace("**Analyst**", "**Assistant Manager**")).issues.some((i) => i.value.toLowerCase() === "manager"), false);
});

test("blocks: mixed-script token and wholly non-Latin lines are unreadable, with no value to attest", () => {
  const mixed = run("Certified expеrt in vendor management");
  assert.ok(mixed.issues.some((i) => i.kind === "unreadable" && i.value === ""));
  const deva = run("वित्त विश्लेषक");
  assert.ok(deva.issues.some((i) => i.kind === "unreadable"));
  assert.equal(deva.verdict, "block");
  // A Cyrillic-only look-alike token also blocks.
  assert.ok(run("Led еxреrt reporting").issues.some((i) => i.kind === "unreadable"));
});

test("passes: a non-Latin token that the facts contain verbatim", () => {
  const tok = "वित्त";
  const r = run(`Led ${tok} reporting`, withExtra(SOURCE_V, `Handled ${tok} reporting`));
  assert.equal(r.issues.some((i) => i.kind === "unreadable"), false);
});

test("coverage: scope-not-checked and unknown reasons block, no-count-claims-recognized does not", () => {
  const withReason = (reason) => checkText({
    text: "Managed a team of 4 analysts", sourceText: SOURCE_V,
    engineGate: () => ({ invented: [], unsupportedFacts: [], forbidden: [], coverage: reason ? { reason, message: "x" } : null }),
  });
  for (const reason of ["scope-not-checked", "some-future-reason"]) {
    const r = withReason(reason);
    assert.equal(r.verdict, "block");
    assert.ok(r.issues.some((i) => i.kind === "coverage" && i.value === ""), reason);
  }
  assert.deepEqual(NON_BLOCKING_COVERAGE, ["no-count-claims-recognized"]);
  assert.equal(withReason("no-count-claims-recognized").verdict, "pass");
  assert.equal(withReason(null).verdict, "pass");
});

test("number context: counts held only about something else block", () => {
  assert.ok(values(run("Led a team of 12 analysts", withExtra(SOURCE_V, "Supported the audit of 12 branches"))).includes("12 analysts"));
  const minutes = "Cut run time from 40 minutes to 12 minutes";
  assert.ok(values(run("Led a team of 12 analysts across reporting", withExtra(SOURCE_V, minutes))).includes("12 analysts"));
  assert.ok(values(run("Led a team of 12 analysts", withExtra(SOURCE_V, "Reduced time to 12 minutes"))).includes("12 analysts"));
});

test("a bare crore or lakh figure followed by a plural noun is a count, not money", () => {
  const a = run("Managed 2 crore analysts", SOURCE_V);
  assert.equal(a.verdict, "block");
  assert.ok(values(a).includes("2 crore analysts"));
  const b = run("Managed 2 crore customers", withExtra(SOURCE_V, "Handled ₹2 crore budgets for 300 customers"));
  assert.ok(values(b).includes("2 crore customers"));
  for (const ok of ["Handled budgets of 2 crore", "Handled 2 crore budgets", "Handled 2 crore worth of budgets"]) {
    assert.equal(run(ok, SOURCE_V).issues.length, 0, ok);
  }
});

// The engine verbs arrive with P1-19; until it merges the engine passes this line, so the case waits for it.
test("engine: Led vs Assisted still blocks through the engine gate", (t) => {
  if (!engineHasP119) return t.skip("engine P1-19 not merged here");
  const r = gated("Led vendor contracts", withExtra(SOURCE_V.replace("- Managed vendor contracts\n", ""), "Assisted with vendor contracts"));
  assert.equal(r.verdict, "block");
});

const PASS = [
  ["Ranked 1st among analysts", withExtra(SOURCE_V, "Ranked 1st among analysts"), []],
  ["Completed a bachelor's degree in commerce", withExtra(SOURCE_V, "bachelor's degree in commerce"), []],
  ["Fluent in German and English", withExtra(SOURCE_V, "Fluent in German"), ["english"]],
  ["Assistant manager for vendor contracts", SOURCE_V.replace("**Senior Analyst**", "**Assistant Manager**"), []],
  ["Vice President of finance", SOURCE_V.replace("**Senior Analyst**", "**VP**"), []],
  ["Sr. Manager", SOURCE_V.replace("**Senior Analyst**", "**Senior Manager**"), []],
];
for (const [text, source, blocked] of PASS) {
  test(`passes with the fact: ${text}`, () => {
    const got = values(run(text, source));
    assert.deepEqual(got.filter((v) => v), blocked);
  });
}

test("honest lines pass, strict alone and with the engine", () => {
  const bad = [];
  for (const line of HONEST) {
    if (run(line).verdict === "block") bad.push(["strict", line]);
    if (gated(line).verdict === "block") bad.push(["engine", line]);
  }
  assert.deepEqual(bad, []);
});

test("memo: read-only, keyed on content, never leaks between sources", () => {
  const a = factTokenSet(SOURCE_V);
  assert.throws(() => a.add("x"), TypeError);
  assert.equal(factTokenSet(SOURCE_V.slice()), a);
  const other = factTokenSet("Python only");
  assert.equal(other.has("infosys"), false);
  assert.equal(factTokenSet(SOURCE_V).has("python"), false);
  assert.equal(run("Led reporting").verdict, "pass");
  assert.equal(run("Led reporting", "Python only").verdict, "pass");
  assert.equal(unsupportedClaimWords("global expert", "global").length, 1);
  assert.ok(CLAIM_FAMILIES.credential);
  assert.ok(numberClaims(SOURCE_V).length > 0);
});

test("worst case: an adversarial one-line 30k fact base stays cheap cold", () => {
  const sources = [
    "30% 40% 2x ₹5 crore ".repeat(1500).slice(0, 30000),
    "Senior Manager Certified Expert Global ".repeat(800).slice(0, 30000),
    "वित्त ".repeat(5000).slice(0, 30000),
    "a".repeat(30000),
    "12, ".repeat(7500),
  ];
  for (const [i, src] of sources.entries()) {
    const t0 = performance.now();
    run("Led a team of 12 analysts, ranked 1st, certified expert across 3 crore analysts", src);
    const ms = performance.now() - t0;
    assert.ok(ms < 500, `source ${i} cold: ${ms.toFixed(0)} ms`);
    const t1 = performance.now();
    for (let k = 0; k < 5; k++) run("Led reporting", src);
    assert.ok(performance.now() - t1 < 500, `source ${i} warm`);
  }
});
