// P1-21: a figure passes only when the facts use the same figure about the same thing.
import test from "node:test";
import assert from "node:assert/strict";
import { SOURCE, HONEST } from "./fixtures/honest-lines.mjs";
import { unsupportedNumberContexts } from "../src/lib/number-context.mjs";

const FACTS = `${SOURCE}\n- Supported the audit of 12 branches\n- Supported 3 audits`;
const blocked = (text, facts = FACTS) => unsupportedNumberContexts(text, facts);

const MUST_BLOCK = [
  "Managed a team of 12 analysts",
  "Led a team of 12 analysts",
  "Reduced costs by 30%",
  "Grew revenue 30% using SQL",
  "Led 12 analysts across branches",
  "Reduced costs by 30% at month-end",
  "Revenue up 30% in month",
];

const MUST_PASS = [
  "Audited 12 branches",
  "Supported audits of 12 branches",
  "Improved month-end efficiency by 30%",
  "Reduced turnaround time (TAT) by 30%",
  // The figure sits inside other tokens or sentences, not in the claim's neighbourhood.
  "Joined Infosys in 2014 and went on to manage a team of 4 analysts",
  "Q3 close: supported 3 audits",
];

// Documented passes: wrong in substance, but blocking them needs a rule that also blocks honest lines.
// Each shares a noun with the facts' use of the figure, or hides its subject from the window.
const KNOWN_GAPS = [
  "Led 12 branch analysts", // shares "branch" with "12 branches"
  "Led 12 analysts, auditing branches", // a gerund is not a noun, and the comma phrase is out of reach
  "Led 12 audit analysts", // shares "audit"
  "Led 3 audit teams", // shares "audit" with "3 audits"
  "Managed 4 analyst teams", // shares "analyst" and "team" with the team of 4 analysts
  "Increased Power BI adoption 30%", // tool words in the fact sentence count as support
  "Saved ₹2 crore", // "Saved" is a verb and no noun follows, so there is nothing to judge
  "Raised 2 crore funding", // "funding" reads as a verb; no noun left to judge
  "Led 12\nanalysts", // a line break ends the sentence, so "analysts" is out of reach
  "4 years of people management experience", // shares "year"/"experience" with the 4 years of experience fact
];

// Known false blocks: honest lines the rule blocks. Attesting the value clears them.
const KNOWN_FALSE_BLOCKS = ["Supported statutory audit for 12 locations"];

test("must block: the right figure about the wrong thing", () => {
  for (const line of MUST_BLOCK) {
    const r = blocked(line);
    assert.ok(r.length > 0, `should block: ${line}`);
    assert.ok(r.every((x) => typeof x.value === "string" && typeof x.raw === "string"));
  }
});

test("a figure whose key is not in the facts is the existing check's job", () => {
  assert.deepEqual(blocked("Managed budgets of 4 crore"), []);
  assert.deepEqual(blocked("Managed a team of 99 analysts"), []);
});

test("must pass: figures used about the same thing", () => {
  for (const line of MUST_PASS) assert.deepEqual(blocked(line), [], line);
});

test(`no honest line is blocked, against the source alone (${HONEST.length} lines)`, () => {
  const wrong = HONEST.map((line) => ({ line, r: blocked(line, SOURCE) })).filter((x) => x.r.length);
  assert.deepEqual(wrong, []);
});

test("no honest line is blocked once extra facts exist", () => {
  const wrong = HONEST.map((line) => ({ line, r: blocked(line) })).filter((x) => x.r.length);
  assert.deepEqual(wrong, []);
});

test("known gaps stay documented passes", () => {
  for (const line of KNOWN_GAPS) assert.deepEqual(blocked(line), [], `gap: ${line}`);
});

test("known false blocks stay documented, and attesting the value clears them", () => {
  for (const line of KNOWN_FALSE_BLOCKS) {
    const r = blocked(line);
    assert.ok(r.length > 0, `still blocked: ${line}`);
    assert.deepEqual(blocked(line, `${FACTS}\n- ${r[0].value}`), [], line);
  }
});

test("a figure inside another token is not read as the claim", () => {
  assert.deepEqual(blocked("Joined Infosys in 2014 and went on to manage a team of 4 analysts"), []);
  assert.deepEqual(blocked("Q3 close: supported 3 audits"), []);
});

test("dates in the facts do not turn a count into a wildcard", () => {
  assert.ok(unsupportedNumberContexts("Led 12 analysts", "06/2019 – 12/2023\n- Audited 12 branches").length > 0);
});

test("pathological input stays fast", () => {
  const t0 = process.hrtime.bigint();
  unsupportedNumberContexts("Led 12 analysts", "12 a ".repeat(6000));
  const dots = ". ".repeat(15000) + "12 analysts";
  unsupportedNumberContexts("Led 12 analysts", dots);
  unsupportedNumberContexts(dots, "Led 12 analysts");
  unsupportedNumberContexts("12 a ".repeat(6000), "Led 12 analysts");
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 150, `took ${ms.toFixed(1)} ms`);
});

test("12 a repeated for 5,000 characters is judged in under 20 ms", () => {
  const facts = "12 a ".repeat(1000);
  unsupportedNumberContexts("Led 12 analysts", facts); // warm
  const t0 = process.hrtime.bigint();
  unsupportedNumberContexts("Led 12 analysts", facts + " ");
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 20, `took ${ms.toFixed(1)} ms`);
});

test("years are exempt", () => {
  assert.deepEqual(blocked("Worked on cloud migration, 2019"), []);
  assert.deepEqual(blocked("Joined Acme Corp in 2023"), []);
});

test("value is short and confirming it as a fact clears the line", () => {
  for (const line of MUST_BLOCK) {
    const r = blocked(line);
    for (const { value } of r) {
      assert.ok(value.length > 0 && value.length <= 60, value);
      assert.deepEqual(blocked(line, `${FACTS}\n- ${value}`), [], `attesting "${value}" should clear: ${line}`);
    }
  }
  assert.equal(blocked("Managed a team of 12 analysts")[0].value, "12 analysts");
  assert.equal(blocked("Reduced costs by 30%")[0].value, "30% costs");
});

test("an inflated count is judged by what it counts", () => {
  const facts = "- Managed a team of 4 analysts\n- Reduced close time by 4 days";
  assert.deepEqual(blocked("Managed a team of 4 analysts", facts), []);
  assert.ok(blocked("Managed 4 vendors", facts).length > 0);
});

test("cost: a 600-character line against 30,000 characters of facts takes under 2 ms once cached", () => {
  const filler = [];
  for (let i = 0; filler.join("\n").length < 30000; i++) {
    filler.push(`- Handled ${i % 50 + 5} accounts for region ${i} and cut ${i % 40 + 1}% of manual rework in the ledger`);
  }
  const facts = filler.join("\n");
  const line = "Managed a team of 12 analysts across 3 regions while cutting 7% of rework in the ledger. ".repeat(7).slice(0, 600);
  unsupportedNumberContexts(line, facts); // warm the per-facts cache
  const runs = 20;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) unsupportedNumberContexts(line, facts);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / runs;
  assert.ok(ms < 2, `took ${ms.toFixed(2)} ms`);
});
