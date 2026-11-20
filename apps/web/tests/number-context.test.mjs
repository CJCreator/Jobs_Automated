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
];

const MUST_PASS = ["Audited 12 branches", "Supported audits of 12 branches"];

// Documented passes: wrong in substance, but blocking them needs a rule that also blocks honest lines.
// "Led 12 analysts across branches" is blocked at the window of 2 words; it is a gap at 3 and 4.
const KNOWN_GAPS = ["Led 12 branch analysts"];

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
