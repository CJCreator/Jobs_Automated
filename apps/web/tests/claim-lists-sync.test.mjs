// The app's claim lists and the engine's are twins:
//   apps/web/src/lib/claims.mjs (CLAIM_FAMILIES, NON_BLOCKING_COVERAGE)
//   packages/engine/verify-cv-facts.mjs (CLAIM_FAMILIES, COVERAGE_REASONS)
// This test is the control. Change one list and this fails until the other follows.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_FAMILIES, APP_ONLY_KINDS, APP_ONLY_FAMILIES, NON_BLOCKING_COVERAGE, checkText } from "../src/lib/claims.mjs";
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
const P119_EXEMPT = ["Wrote the executive summary", "Enterprise reporting for close", "Award-winning close team"];

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

test("the app's exemptions match the engine's: executive summary, enterprise reporting, award-winning", () => {
  for (const line of P119_EXEMPT) {
    const r = checkText({ text: line, sourceText: "Led month-end close at Infosys" });
    const claimIssues = r.issues.filter((i) => ["credential", "seniority", "scope", "expertise"].includes(i.kind));
    assert.deepEqual(claimIssues, [], line);
  }
  // The bare words still block.
  assert.ok(checkText({ text: "Executive reporting", sourceText: "Led close" }).issues.some((i) => i.kind === "seniority"));
});

test("shared claim families equal the engine's, kind by kind", (t) => {
  if (!engine.CLAIM_FAMILIES) {
    // Engine before P1-19: nothing to compare yet. The snapshot test above keeps the app honest,
    // and this test fails after the merge if the engine's export differs.
    t.diagnostic(`${ENGINE} does not export CLAIM_FAMILIES yet (P1-19 not merged here)`);
    return;
  }
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

test("every engine coverage reason is non-blocking in the app or blocks", (t) => {
  if (!engine.COVERAGE_REASONS) {
    t.diagnostic(`${ENGINE} does not export COVERAGE_REASONS yet (P1-19 not merged here)`);
    return;
  }
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
