// The app's claim lists and the engine's are twins:
//   apps/web/src/lib/claims.mjs (CLAIM_FAMILIES, NON_BLOCKING_COVERAGE)
//   packages/engine/verify-cv-facts.mjs (CLAIM_FAMILIES, COVERAGE_REASONS)
// This test is the control. Change one list and this fails until the other follows.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_FAMILIES, APP_ONLY_KINDS, APP_ONLY_FAMILIES, NON_BLOCKING_COVERAGE, C_SUITE_RULE, checkText } from "../src/lib/claims.mjs";
import { importEngineFile } from "../src/lib/server/engine.mjs";
import { SOURCE_V } from "./fixtures/honest-lines.mjs";

const SHARED_KINDS = ["credential", "seniority", "scope", "expertise"];
const APP = "apps/web/src/lib/claims.mjs";
const ENGINE = "packages/engine/verify-cv-facts.mjs";

// What P1-19 added to the engine lists. The app must hold all of it whether or not the
// engine on this branch does yet.
const P119 = {
  credential: ["toppers", "diplomas", "ph d", "post graduate", "post-graduate"],
  seniority: ["seniors", "seniormost", "senior-most", "principals", "heads of", "avp", "svp", "evp", "mgr", "gm", "general manager", "c-suite", "cxo", "cxos"],
  scope: ["pan-india", "pan india"],
  expertise: ["expertly", "gurus", "veterans"],
};
// "Award-winning" is exempt in the engine but not in the app (owner decision, P1-20 review 2):
// the app passes it only when the facts mention an award. Tested below.
const P119_EXEMPT = ["Wrote the executive summary", "Enterprise reporting for close"];

let engine;
before(async () => {
  engine = await importEngineFile("verify-cv-facts.mjs");
});

const norm = (families) => families.map((f) => [...f].sort().join("\u0000")).sort();
const forms = (kind) => new Set(CLAIM_FAMILIES[kind].flat());

test("the app holds every form P1-19 added to the engine lists", () => {
  for (const [kind, added] of Object.entries(P119)) {
    for (const form of added) assert.ok(forms(kind).has(form), `${APP} is missing "${form}" in ${kind} (added to ${ENGINE} by P1-19)`);
  }
});

test("the app's exemptions match the engine's (executive summary, enterprise reporting); award-winning is stricter", () => {
  for (const line of P119_EXEMPT) {
    const r = checkText({ text: line, sourceText: "Led month-end close at Infosys" });
    const claimIssues = r.issues.filter((i) => ["credential", "seniority", "scope", "expertise"].includes(i.kind));
    assert.deepEqual(claimIssues, [], line);
  }
  // "award-winning": the app is stricter than the engine on purpose.
  assert.ok(checkText({ text: "Award-winning close team", sourceText: "Led month-end close at Infosys" }).issues.some((i) => i.value === "Award-winning"));
  assert.equal(checkText({ text: "Award-winning close team", sourceText: "Led month-end close at Infosys\n- Won the CFO Excellence Award 2022" }).verdict, "pass");
  // The bare words still block.
  assert.ok(checkText({ text: "Executive reporting", sourceText: "Led close" }).issues.some((i) => i.kind === "seniority"));
});

test("shared claim families equal the engine's, kind by kind", () => {
  assert.ok(engine.CLAIM_FAMILIES, `${ENGINE} must export CLAIM_FAMILIES for ${APP} to compare against`);
  assert.deepEqual(Object.keys(engine.CLAIM_FAMILIES).sort(), [...SHARED_KINDS].sort(), `${ENGINE} and ${APP} disagree on which kinds are shared`);
  for (const kind of SHARED_KINDS) {
    assert.deepEqual(norm(CLAIM_FAMILIES[kind]), norm(engine.CLAIM_FAMILIES[kind]), `${kind} families differ between ${APP} and ${ENGINE}`);
  }
});

test("every kind in the app is shared with the engine or declared app-only", () => {
  assert.deepEqual(Object.keys(CLAIM_FAMILIES).sort(), [...SHARED_KINDS].sort());
  for (const kind of Object.keys(APP_ONLY_FAMILIES)) {
    assert.ok(SHARED_KINDS.includes(kind) || APP_ONLY_KINDS.includes(kind), `${kind} in ${APP} is neither shared nor in APP_ONLY_KINDS`);
  }
  assert.deepEqual([...APP_ONLY_KINDS].sort(), ["language", "rank", "tenure"]);
});

test("every engine coverage reason is non-blocking in the app or blocks", () => {
  assert.ok(engine.COVERAGE_REASONS, `${ENGINE} must export COVERAGE_REASONS for ${APP} to compare against`);
  for (const reason of engine.COVERAGE_REASONS) {
    const r = checkText({
      text: "Managed a team of 4 analysts", sourceText: SOURCE_V,
      engineGate: () => ({ invented: [], unsupportedFacts: [], forbidden: [], coverage: { reason, message: "x" } }),
    });
    if (NON_BLOCKING_COVERAGE.includes(reason)) assert.notEqual(r.verdict, "block", `${reason} is listed non-blocking in ${APP}`);
    else assert.ok(r.issues.some((i) => i.kind === "coverage"), `${reason} from ${ENGINE} must block in ${APP}`);
  }
  for (const reason of NON_BLOCKING_COVERAGE) assert.ok(engine.COVERAGE_REASONS.includes(reason), `${reason} is not an engine coverage reason`);
});

// The C-suite audience rule is a twin too (P1-19c in the engine, withoutExemptions in the app).
// Until the engine exports its rule, this pins the app to P1-19c's pass and block lines and fails
// as soon as the engine exports anything C-suite-shaped, so the parity check below gets written.
const C_SUITE_PASS = ["a C-suite narrative", "a C-suite sponsor", "Built the platform using a C-suite sponsor.",
  "Presented quarterly results to the C-suite", "Reported risks to the C-suite", "Prepared C-suite reporting packs",
  "Briefed C-suite stakeholders monthly"];
const C_SUITE_BLOCK = ["C-suite executive with 10 years in finance", "Served as a C-suite leader", "Was the C-suite sponsor",
  "worked as a c-suite sponsor", "I am a C-suite audience", "Promoted to the C-suite", "Briefly promoted to the C-suite",
  "Presented results and was promoted to the C-suite", "Recommended for promotion to the C-suite",
  "Proposed for elevation to the C-suite", "Reported results then ascended to the C-suite", "Presented my transition to the C-suite",
  "Briefed on my move to the C-suite", "pitched himself to the c-suite", "C-suite engagement lead", "served on c-suite review boards",
  "Member of the C-suite — reviews all budgets", "- Member of the C-suite\n- Reviews vendor contracts", "C-suite reporting",
  "Appointed C-suite sponsor", "Named C-suite sponsor", "Acting C-suite sponsor", "Member of the C-suite\nSponsors the annual offsite",
  "Member of the C-suite\nStakeholders included the board"];

test("the C-suite audience rule is pinned to the engine's", () => {
  const src = "Led month-end close at Infosys";
  const cSuite = (line) => checkText({ text: line, sourceText: src }).issues.some((i) => i.kind === "seniority" && i.value.toLowerCase() === "c-suite");
  for (const line of C_SUITE_PASS) assert.equal(cSuite(line), false, `${line} must pass in ${APP} (P1-19c pass list)`);
  for (const line of C_SUITE_BLOCK) assert.equal(cSuite(line), true, `${line} must block in ${APP} (P1-19c block list)`);
  if (engine.C_SUITE_RULE) {
    assert.deepEqual({ ...C_SUITE_RULE }, { ...engine.C_SUITE_RULE }, `the C-suite rule differs between ${APP} and ${ENGINE}`);
  } else {
    const shaped = Object.keys(engine).filter((k) => /c_?suite|audience/i.test(k));
    assert.deepEqual(shaped, [], `${ENGINE} now exports a C-suite rule (${shaped.join(", ")}): export it as C_SUITE_RULE with the same fields as ${APP} so this test compares them`);
  }
});
