import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkText } from "../src/lib/claims.mjs";
import { SOURCE, SOURCE_V, HONEST } from "./fixtures/honest-lines.mjs";

let verifyFactsFromText;

before(async () => {
  // An empty temp root: the engine finds no config file, so only its built-in checks run.
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  ({ verifyFactsFromText } = await import("../../../packages/engine/verify-cv-facts.mjs"));
});

const gated = (text, sourceText) => checkText({ text, sourceText, engineGate: verifyFactsFromText });

const BYPASSES = [
  "Managed vendor contracts at Acme Corp",
  "Managed vendor contracts for 14M evaluations per month",
  "Processed 14M evaluations per month",
  "Managed Global vendor contracts",
  "Led a Certified Expert vendor programme",
];
for (const text of BYPASSES) {
  test(`through checkText with the engine gate: ${text}`, () => {
    const r = gated(text, SOURCE_V);
    assert.equal(r.engineRan, true);
    assert.equal(r.verdict, "block", JSON.stringify(r.issues));
  });

  test(`the engine alone blocks it, with no config: ${text}`, () => {
    const r = verifyFactsFromText(text, { sourceText: SOURCE_V });
    assert.equal(r.verdict, "block", JSON.stringify(r));
  });
}

test(`no honest line is blocked with the real engine gate (${HONEST.length} lines)`, () => {
  const wronglyBlocked = HONEST.map((text) => ({ text, r: gated(text, SOURCE) }))
    .filter(({ r }) => r.verdict === "block")
    .map(({ text, r }) => `${text}  [${r.issues.map((i) => i.value).join(", ")}]`);
  assert.deepEqual(wronglyBlocked, []);
});
