import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkText } from "../src/lib/claims.mjs";

const SOURCE = `# Asha Rao
asha.rao@example.com | Bengaluru

## Summary
Finance analyst with 4 years of experience in reporting and month-end close.

## Experience

### Infosys — Bengaluru
**Senior Analyst**
2019 – 2023
- Reduced month-end close time by 30% using SQL and Power BI
- Managed a team of 4 analysts
- Handled budgets of ₹2 crore

## Education
- B.Com, Christ University, 2019

## Skills
SQL, Power BI, Excel`;

let verifyFactsFromText;

before(async () => {
  // The engine resolves a data root from the environment at import time. An
  // empty temp directory means it can never read this checkout's own files.
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  ({ verifyFactsFromText } = await import("../../../packages/engine/verify-cv-facts.mjs"));
});

const engine = (text) => verifyFactsFromText(text, { sourceText: SOURCE });
const gated = (text) => checkText({ text, sourceText: SOURCE, engineGate: verifyFactsFromText });

test("the engine blocks an invented percentage", () => {
  const r = engine("Reduced month-end close time by 45% using SQL and Power BI");
  assert.equal(r.verdict, "block");
  assert.ok(r.invented.some((v) => String(v).includes("45")), JSON.stringify(r.invented));
});

test("the engine blocks tools the facts never mention", () => {
  const r = engine("Built month-end close reporting using Tableau and Snowflake");
  assert.equal(r.verdict, "block");
  const values = r.unsupportedFacts.map((f) => String(f.value).toLowerCase());
  assert.ok(values.some((v) => v.includes("tableau")), JSON.stringify(r.unsupportedFacts));
  assert.ok(values.some((v) => v.includes("snowflake")), JSON.stringify(r.unsupportedFacts));
});

test("the engine does not block a faithful reworded line", () => {
  const r = engine("Cut month-end close time by 30% with SQL and Power BI");
  assert.notEqual(r.verdict, "block", JSON.stringify(r));
});

test("combined: an invented percentage blocks and the engine ran", () => {
  const r = gated("Reduced month-end close time by 45% using SQL and Power BI");
  assert.equal(r.engineRan, true);
  assert.equal(r.verdict, "block");
  assert.ok(r.issues.some((i) => i.value.includes("45")));
});

test("combined: unsupported tools block and are reported once each", () => {
  const r = gated("Built month-end close reporting using Tableau and Snowflake");
  assert.equal(r.engineRan, true);
  assert.equal(r.verdict, "block");
  const values = r.issues.map((i) => i.value.toLowerCase());
  assert.equal(values.filter((v) => v === "tableau").length, 1);
  assert.equal(values.filter((v) => v === "snowflake").length, 1);
});

test("combined: a head-count the engine misses is still blocked by the strict layer", () => {
  const text = "Managed a team of 12 analysts";
  const r = gated(text);
  assert.equal(r.engineRan, true);
  assert.equal(r.verdict, "block");
  assert.ok(r.issues.some((i) => i.value === "12"));
});

test("combined: a slash-separated tool list is not read as one invented tool", () => {
  const r = gated("Data-driven reporting for month-end close using SQL/Power BI/Excel");
  assert.equal(r.engineRan, true);
  assert.notEqual(r.verdict, "block", JSON.stringify(r.issues));
});

test("known gap: a scope claim with no figure or tool passes both layers", { todo: "needs a stronger scope check" }, () => {
  assert.equal(gated("Owned the entire finance function").verdict, "block");
});

test("combined: honest rewording is not blocked by either layer", () => {
  const r = gated("Cut month-end close time by 30% with SQL and Power BI");
  assert.equal(r.engineRan, true);
  assert.notEqual(r.verdict, "block", JSON.stringify(r.issues));
});
