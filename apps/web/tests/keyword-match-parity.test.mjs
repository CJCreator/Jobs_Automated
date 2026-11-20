// Parity: the app's keyword-match port must give the engine's answers.
// The engine file is the twin (packages/engine/keyword-match.mjs); this test is
// the control. Also covers the port's input caps and a few safety checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importEngineFile } from "../src/lib/server/engine.mjs";
import * as port from "../src/lib/keyword-match.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "keyword-match");
const read = (name) => fs.readFileSync(path.join(DIR, name), "utf8");
const engine = await importEngineFile("keyword-match.mjs");

test("fixtures: six job descriptions paired with six resumes", () => {
  for (let i = 1; i <= 6; i += 1) {
    assert.ok(read(`jd-${i}.txt`).length > 50);
    assert.ok(read(`resume-${i}.txt`).length > 50);
  }
});

for (let i = 1; i <= 6; i += 1) {
  test(`parity: fixture pair ${i} (keywords and coverage)`, () => {
    const jd = read(`jd-${i}.txt`);
    const resume = read(`resume-${i}.txt`);
    const keywords = port.keywordsFromJdText(jd);
    assert.deepEqual(keywords, engine.keywordsFromJdText(jd));
    assert.ok(keywords.length > 0, "the fixture should yield keywords");
    assert.deepEqual(
      port.analyzeCoverage(keywords, resume),
      engine.analyzeCoverage(engine.keywordsFromJdText(jd), resume),
    );
  });
}

test("the Indian-terms fixture really exercises CTC, GST and Tally", () => {
  const resume = read("resume-2.txt");
  const result = port.analyzeCoverage(["CTC", "GST", "Tally", "TDS", "Power BI"], resume);
  assert.deepEqual(result.present, ["CTC", "GST", "Tally", "TDS"]);
  assert.deepEqual(result.missing, ["Power BI"]);
  assert.deepEqual(result, engine.analyzeCoverage(["CTC", "GST", "Tally", "TDS", "Power BI"], resume));
});

test("parity: small pure helpers", () => {
  assert.deepEqual(port.SYNONYMS, engine.SYNONYMS);
  for (const term of ["LLMs", "k8s", "aws", "Node.js", "  C++ ", "ci/cd"]) {
    assert.equal(port.normalizeText(term), engine.normalizeText(term));
    assert.deepEqual(port.variantForms(term), engine.variantForms(term));
    assert.deepEqual(port.expandTerms(term), engine.expandTerms(term));
    assert.equal(port.countOccurrences(term, "Used LLMs, k8s, AWS, node.js and C++ and ci/cd"),
      engine.countOccurrences(term, "Used LLMs, k8s, AWS, node.js and C++ and ci/cd"));
    assert.equal(port.keywordCount(term, "k8s and LLM and aws"), engine.keywordCount(term, "k8s and LLM and aws"));
  }
});

const HTML = [
  "<p>Hello &amp; welcome</p>",
  "<div>Skills: <b>Python</b>, SQL<!-- hidden --></div>",
  "<script>alert(1)</script foo><p>Visible</p>",
  "<style >p{}</style ><h1>Title</h1> &lt;tag&gt; &amp;lt;",
  "<SCRIPT type='x'>x()</SCRIPT ><span>It&#39;s&nbsp;fine &quot;ok&quot;</span>",
];

test("parity: htmlToText on five snippets", () => {
  for (const html of HTML) assert.equal(port.htmlToText(html), engine.htmlToText(html), html);
  assert.equal(port.htmlToText(HTML[2]), "Visible");
});

test("analyzeCoverage refuses text over 60,000 characters", () => {
  assert.doesNotThrow(() => port.analyzeCoverage(["python"], "a".repeat(60_000)));
  assert.throws(() => port.analyzeCoverage(["python"], "a".repeat(60_001)), RangeError);
});

test("analyzeCoverage refuses more than 200 keywords", () => {
  const ok = Array.from({ length: 200 }, (_, i) => `kw${i}`);
  assert.doesNotThrow(() => port.analyzeCoverage(ok, "text"));
  assert.throws(() => port.analyzeCoverage([...ok, "one more"], "text"), RangeError);
});

test("the engine keeps its behaviour on large input", () => {
  assert.doesNotThrow(() => engine.analyzeCoverage(["python"], "a".repeat(60_001)));
});

test("job-description text with regex characters does not throw", () => {
  const jd = "Needs C++, (a+b)*, [x], $1, .*, \\d+ and node.js/express.";
  assert.doesNotThrow(() => port.keywordsFromJdText(jd));
  assert.doesNotThrow(() => port.analyzeCoverage(["(a+b)*", "[x", "$1", ".*", "\\"], jd));
  assert.deepEqual(port.analyzeCoverage(["(a+b)*", ".*"], jd).present, ["(a+b)*", ".*"]);
});

test("the port imports nothing", () => {
  const src = fs.readFileSync(path.join(DIR, "..", "..", "..", "src", "lib", "keyword-match.mjs"), "utf8");
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /\bfetch\(|node:fs|child_process/);
});
