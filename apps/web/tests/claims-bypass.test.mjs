import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkText } from "../src/lib/claims.mjs";
import { SOURCE, SOURCE_V, HONEST } from "./fixtures/honest-lines.mjs";

let verifyFactsFromText;

before(async () => {
  // An empty temp root means the engine can never read this checkout's own files.
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  ({ verifyFactsFromText } = await import("../../../packages/engine/verify-cv-facts.mjs"));
});

const strict = (text, sourceText) => checkText({ text, sourceText });
const gated = (text, sourceText) => checkText({ text, sourceText, engineGate: verifyFactsFromText });

// Claim words (credential, seniority, scope, expertise) the facts do not contain.
const MUST_BLOCK = [
  ["Managed Global vendor contracts", ["Global"]],
  ["Led a Certified Expert vendor programme", ["Certified", "Expert"]],
  ["Managed global vendor contracts", ["global"]],
  ["Certified expert in vendor management", ["certified", "expert"]],
  ["Expert in SQL and Power BI", ["Expert"]],
  ["Senior Principal analyst managing vendor contracts", ["Principal"]],
  ["Global lead for month-end close", ["Global"]],
  ["Chartered accountant who reduced month-end close time by 30%", ["Chartered"]],
  ["certified chartered accountant managing vendor contracts", ["certified", "chartered"]],
  ["Head of Finance who managed vendor contracts", ["Head of"]],
  ["Owned the entire finance function", ["entire"]],
  ["Led regional and international vendor contracts", ["regional", "international"]],
  ["Promoted to finance manager at Infosys", ["manager"]],
];
for (const [text, words] of MUST_BLOCK) {
  for (const [label, run] of [["strict layer", strict], ["with engine gate", gated]]) {
    test(`blocks (${label}): ${text}`, () => {
      const r = run(text, SOURCE_V);
      assert.equal(r.verdict, "block", JSON.stringify(r.issues));
      for (const word of words) {
        assert.ok(
          r.issues.some((i) => i.value.toLowerCase() === word.toLowerCase()),
          `expected an issue with value ${JSON.stringify(word)}, got ${JSON.stringify(r.issues)}`,
        );
      }
    });
  }
}

test("claim-word issues carry a kind and the standard message", () => {
  const r = strict("Chartered accountant managing vendor contracts", SOURCE_V);
  const issue = r.issues.find((i) => i.value === "Chartered");
  assert.equal(issue.kind, "credential");
  assert.equal(issue.message, '"Chartered" is not in your confirmed facts.');
  assert.equal(strict("Owned the entire finance function", SOURCE_V).issues.find((i) => i.value === "entire").kind, "scope");
  assert.equal(strict("Expert in SQL", SOURCE_V).issues.find((i) => i.value === "Expert").kind, "expertise");
  assert.equal(strict("Director of finance", SOURCE_V).issues.find((i) => i.value === "Director").kind, "seniority");
});

test("claim words are caught in any letter case", () => {
  for (const text of ["MANAGED GLOBAL VENDOR CONTRACTS", "managed global vendor contracts", "Managed GlObAl vendor contracts"]) {
    assert.equal(strict(text, SOURCE_V).verdict, "block", text);
  }
});

// Already blocked by the strict layer; they must stay blocked. Engine-alone is P0-1b.
test("guard: an employer the facts never name stays blocked", () => {
  const r = gated("Managed vendor contracts at Acme Corp", SOURCE_V);
  assert.equal(r.verdict, "block");
  assert.ok(r.issues.some((i) => i.value === "Acme"), JSON.stringify(r.issues));
});

test("guard: a magnitude the facts never state stays blocked", () => {
  const r = gated("Managed vendor contracts for 14M evaluations per month", SOURCE_V);
  assert.equal(r.verdict, "block");
  assert.ok(r.issues.some((i) => i.value.includes("14M")), JSON.stringify(r.issues));
});

test(`no honest line is blocked by the strict layer (${HONEST.length} lines)`, () => {
  const wronglyBlocked = HONEST.map((text) => ({ text, r: strict(text, SOURCE) }))
    .filter(({ r }) => r.verdict === "block")
    .map(({ text, r }) => `${text}  [${r.issues.map((i) => i.value).join(", ")}]`);
  assert.deepEqual(wronglyBlocked, []);
});

test(`no honest line is blocked with the engine gate (${HONEST.length} lines)`, () => {
  const wronglyBlocked = HONEST.map((text) => ({ text, r: gated(text, SOURCE) }))
    .filter(({ r }) => r.verdict === "block")
    .map(({ text, r }) => `${text}  [${r.issues.map((i) => i.value).join(", ")}]`);
  assert.deepEqual(wronglyBlocked, []);
});

// Claim words the facts do contain (in any form of the word) are not flagged.
const SUPPORTED = [
  [`${SOURCE_V}\n- Managed Global vendor contracts`, ["Oversaw global vendor contracts", "Managed vendor contracts globally"]],
  [`${SOURCE_V}\nCertified Scrum Master`, ["Certified Scrum Master managing vendor contracts", "Scrum Master certification"]],
  [SOURCE, ["Senior analyst who managed a team of 4 analysts"]],
  [`${SOURCE_V}\nExpert`, ["Expert in SQL and Power BI"]],
];
for (const [facts, lines] of SUPPORTED) {
  for (const text of lines) {
    test(`passes when the facts support the word: ${text}`, () => {
      const r = strict(text, facts);
      assert.notEqual(r.verdict, "block", JSON.stringify(r.issues));
      const g = gated(text, facts);
      assert.notEqual(g.verdict, "block", JSON.stringify(g.issues));
    });
  }
}
