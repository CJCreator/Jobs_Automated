// P1-5b: keyword coverage before and after the accepted changes (ADR 0016).
// Coverage is information only: it never changes a suggestion or its check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFacts } from "../src/lib/facts.mjs";
import { MAX_KEYWORDS, MAX_TEXT_CHARS } from "../src/lib/keyword-match.mjs";
import { coverageFor, MAX_MISSING } from "../src/app/api/tailorings/[id]/coverage/coverage-for.mjs";

const facts = normalizeFacts({
  contact: { name: "Asha Rao", email: "asha@example.com", confirmed: true },
  summary: { text: "Finance analyst.", confirmed: true },
  experience: [{
    id: "exp-1", company: "Infosys", title: "Analyst", start: "2019", end: "2023", confirmed: true,
    bullets: [{ id: "b1", text: "Built monthly reports", confirmed: true }],
  }],
  education: [],
  skills: [{ name: "Excel", confirmed: true }],
}, { trustConfirmed: true });

// normalizeFacts assigns its own ids, so the ref is read back from the facts.
const REF = `bullet:${facts.experience[0].id}:${facts.experience[0].bullets[0].id}`;

const JD = "We need an analyst with SQL, Python and Excel experience.";

const sug = (decision, finalText) => ({
  id: "s1", ref: REF, kind: "bullet", context: "", before: "Built monthly reports", after: finalText,
  rationale: "", check: { verdict: "pass", issues: [], advisory: [], engineRan: true }, decision, finalText,
});

test("before and after differ when an accepted suggestion adds a JD term", () => {
  const out = coverageFor(facts, [sug("accepted", "Built monthly reports using SQL")], JD);
  assert.ok(out.after.covered > out.before.covered);
  assert.equal(out.before.total, out.after.total);
  assert.ok(out.before.total >= 2);
  assert.ok(!out.missing.includes("SQL"));
  assert.ok(out.missing.includes("Python"));
});

test("pending and rejected suggestions do not change the after count", () => {
  for (const decision of ["pending", "rejected"]) {
    const out = coverageFor(facts, [sug(decision, "Built monthly reports using SQL")], JD);
    assert.deepEqual(out.after, out.before);
  }
});

test("coverage does not change the suggestions it is given", () => {
  const list = [sug("accepted", "Built monthly reports using SQL")];
  const copy = structuredClone(list);
  coverageFor(facts, list, JD);
  assert.deepEqual(list, copy);
});

test("job-description text with regex characters does not throw", () => {
  const jd = "Needs C++ , C#, .NET, (SQL) [Python] a*b+c? ^$|\\ {2,} and Excel";
  assert.doesNotThrow(() => coverageFor(facts, [], jd));
});

test("an empty job description gives zero totals", () => {
  const out = coverageFor(facts, [], "");
  assert.equal(out.before.total, 0);
  assert.deepEqual(out.missing, []);
});

test("the missing list holds at most 30", () => {
  assert.equal(MAX_MISSING, 30);
  const out = coverageFor(facts, [], JD);
  assert.ok(out.missing.length <= MAX_MISSING);
});

test("an oversized job description is bounded, not thrown on", () => {
  const jd = `${JD} `.repeat(Math.ceil((MAX_TEXT_CHARS * 2) / JD.length));
  assert.ok(jd.length > MAX_TEXT_CHARS);
  const out = coverageFor(facts, [], jd);
  assert.ok(out.before.total <= MAX_KEYWORDS);
});

test("a resume over the port's text cap raises RangeError for the route to answer", () => {
  const big = structuredClone(facts);
  big.experience[0].bullets[0].text = "x ".repeat(MAX_TEXT_CHARS);
  assert.throws(() => coverageFor(big, [], JD), RangeError);
});
