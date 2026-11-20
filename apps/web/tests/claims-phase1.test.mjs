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
before(async () => {
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  const mod = await import("../../../packages/engine/verify-cv-facts.mjs");
  engine = mod.verifyFactsFromText;
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
  // The message names the token it could not read, as written.
  assert.match(mixed.issues.find((i) => i.kind === "unreadable").message, /"expеrt"/);
  assert.match(deva.issues.find((i) => i.kind === "unreadable").message, /"वित्त"/);
});

test("unreadable: a token the facts contain verbatim is readable, even one NFKC turns Greek (µs, kΩ)", () => {
  const src = withExtra(SOURCE_V, "Cut API latency to 200 µs", "Designed a 10 kΩ sensor circuit");
  for (const line of ["Cut API latency to 200 µs", "Designed a 10 kΩ sensor circuit"]) {
    assert.equal(run(line, src).verdict, "pass", line);
    assert.equal(gated(line, src).verdict, "pass", `${line} (engine)`);
  }
  // Without the fact, the same token is still unreadable; a look-alike the facts lack still blocks.
  assert.ok(run("Cut API latency to 200 µs", withExtra(SOURCE_V, "Cut API latency to 200")).issues.some((i) => i.kind === "unreadable"));
  assert.ok(run("Certified expеrt in vendor management", src).issues.some((i) => i.kind === "unreadable"));
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

const CRORE_FACT = "Managed a team of 4 analysts, handled budgets of \u20b92 crore";
test("2 crore analysts against the single combined fact blocks; money lines still pass", () => {
  const src = `## Experience\n### Infosys\n**Analyst**\n- ${CRORE_FACT}`;
  assert.ok(values(run("Managed 2 crore analysts", src)).includes("2 crore analysts"));
  assert.equal(run("Handled budgets of 2 crore", src).issues.length, 0);
  assert.equal(run(`Managed a team of 4 analysts and \u20b92 crore budgets`, src).issues.length, 0);
});

// Known gaps (documented, not closed here: P1-19c widens the rule): the noun must follow the figure directly and end in "s".
test("KNOWN GAPS: crore counts the rule does not reach", () => {
  const src = `## Experience\n### Infosys\n**Analyst**\n- ${CRORE_FACT}\n- Handled \u20b92 crore budgets for 300 customers`;
  const passes = ["Managed 2 crore active customers", "Managed 2 crore people", "Managed 2 crore staff", "Managed 2 crore+ customers"];
  const out = Object.fromEntries(passes.map((t) => [t, run(t, src).verdict]));
  console.log("crore gap probe:", JSON.stringify(out));
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

test("engine: Led vs Assisted still blocks through the engine gate", () => {
  const r = gated("Led vendor contracts", withExtra(SOURCE_V.replace("- Managed vendor contracts\n", ""), "Assisted with vendor contracts"));
  assert.equal(r.verdict, "block");
});

// ---- round 2: variants and new words (owner-approved), each must block --------------

// SOURCE_V without its degree, so spaced and dotted forms of B.Com are not backed.
const NO_DEGREE = SOURCE_V.replace("- B.Com, Christ University, 2019", "- Christ University, 2019");
export const NEW_BLOCK = [
  // tenure variants and new words
  ["longstanding member of the finance team", "longstanding"],
  ["Long-standing member of the finance team", "long-standing"],
  ["several yrs in finance", "several yrs"],
  ["Analyst with years experience in finance", "years experience"],
  ["Analyst with years' experience in finance", "years' experience"],
  ["long-time finance analyst", "long-time"],
  ["multi-year finance analyst", "multi-year"],
  // language variants and new words
  ["multi-lingual analyst", "multi-lingual"], ["bi-lingual analyst", "bi-lingual"], ["tri-lingual analyst", "tri-lingual"],
  ...["bangla", "konkani", "nepali", "sindhi", "kashmiri", "maithili", "bhojpuri", "marwari", "tulu", "manipuri", "hindustani",
    "sinhala", "persian", "farsi", "turkish", "thai", "vietnamese", "malay", "indonesian", "swahili", "hebrew", "greek", "polish",
    "swedish", "cantonese"].map((l) => [`Fluent in ${l} at work`, l]),
  ["Fluent in several languages", "several languages"], ["Fluent in multiple languages", "multiple languages"],
  ["Fluent in many languages", "many languages"],
  // credential variants and new words
  ...["m.c.a", "b.b.a", "b.c.a", "p.g.d.m", "m.b.b.s", "ll.b", "l.l.b", "b tech", "b. tech", "m tech", "b com", "b. com", "b sc",
    "m sc", "m com"].map((c) => [`${c} graduate who managed vendor contracts`, c]),
  ["commerce graduate (hons)", "hons"],
  ["qualified ca who managed vendor contracts", "ca"], ["cleared ca final", "ca"], ["c.a by training", "c.a"],
  ["company secretary for the board", "company secretary"], ["m.phil in economics", "m.phil"], ["b.ed holder", "b.ed"],
  ["master of business administration", "master of"], ["master in finance", "master in"],
  // review 2, edit 3: dotted short degrees and "postgrad"
  ["analyst with an M.S. in finance", "m.s"], ["a B.A. in economics", "b.a"], ["an LL.M. in tax", "ll.m"],
  ["a postgrad qualification", "postgrad"], ["a post grad qualification", "post grad"], ["an M.A. in economics", "m.a"],
  ["a B.S. in finance", "b.s"], ["an M.E. in civil engineering", "m.e"], ["an M.Ed. in education", "m.ed"],
  ["a B.Pharm graduate", "b.pharm"], ["a BBM graduate", "bbm"], ["a b.b.m graduate", "b.b.m"], ["an llm in tax", "llm"],
  // review 2, edit 4: words between "years" and "experience", "yrs."
  ["years of rich experience in finance", "years of rich experience"],
  ["years of solid finance experience", "years of solid finance experience"],
  ["yrs. of experience in audit", "yrs. of experience"], ["several yrs. in audit", "several yrs."],
  // review 2, edit 7 (owner decision): award-winning needs an award in the facts
  ["An award-winning analyst", "award-winning"],
  // rank new words and ordinal contexts
  ["top performer in the team", "top performer"], ["top-performing analyst", "top-performing"], ["top-rated analyst", "top-rated"],
  ["top-ranked analyst", "top-ranked"], ["top scorer in the batch", "top scorer"], ["top achiever in finance", "top achiever"],
  ["topped the batch", "topped"], ["won first prize at the hackathon", "first prize"],
  ["runner-up at the case competition", "runner-up"], ["named in the merit list", "merit list"],
  ["star performer of the team", "star performer"], ["employee of the month", "employee of the month"],
  ["employee of the quarter", "employee of the quarter"], ["employee of the year", "employee of the year"],
  ["passed in first division", "first division"], ["silver medal in commerce", "silver medal"],
  ["bronze medal in commerce", "bronze medal"], ["1st in class", "1st in class"], ["first in her batch", "first in her batch"],
  ["2nd in the batch", "2nd in the batch"], ["came first in the university", "came first"], ["came in first", "came in first"],
  ["finished second in the region", "finished second"], ["finished in second place", "finished in second place"],
  ["secured 1st place in the quiz", "secured 1st place"],
  // C-suite as the candidate's role (mirrors P1-19c)
  ["C-suite executive with 4 years in finance", "c-suite"], ["Served as a C-suite leader", "c-suite"],
  ["C-suite reporting", "c-suite"], ["Promoted to the C-suite", "c-suite"], ["C-suite leader of finance", "c-suite"],
  ["Presented results and was promoted to the C-suite", "c-suite"],
  // review 2, edit 6: leaky shapes; each must report "c-suite" itself
  ["Recommended for promotion to the C-suite", "c-suite"], ["Presented my transition to the C-suite", "c-suite"],
  ["Member of the C-suite — reviews all budgets", "c-suite"], ["I am a C-suite audience", "c-suite"],
  ["Member of the C-suite\nReports to the finance director", "c-suite"], ["Member of the C-suite\nReports weekly", "c-suite"],
  ["- Member of the C-suite\n- Reviews vendor contracts", "c-suite"],
  ["worked as a c-suite sponsor", "c-suite"], ["pitched himself to the c-suite", "c-suite"],
  ["C-suite engagement lead", "c-suite"], ["served on c-suite review boards", "c-suite"],
  ["Was the C-suite sponsor", "c-suite"], ["Briefly promoted to the C-suite", "c-suite"],
  ["Proposed for elevation to the C-suite", "c-suite"], ["Reported results then ascended to the C-suite", "c-suite"],
  ["Briefed on my move to the C-suite", "c-suite"],
  // P1-19c d40cf15: more role predicates; an audience noun on the next line is not "after" the match
  ["Appointed C-suite sponsor", "c-suite"], ["Named C-suite sponsor", "c-suite"], ["Acting C-suite sponsor", "c-suite"],
  ["Member of the C-suite\nSponsors the annual offsite", "c-suite"], ["Member of the C-suite\nStakeholders included the board", "c-suite"], ["Presented to CXOs", "cxos"],
];
for (const [text, want] of NEW_BLOCK) {
  test(`blocks (round 2): ${text}`, () => {
    const r = run(text, NO_DEGREE);
    assert.equal(r.verdict, "block");
    assert.ok(values(r).includes(want), `${JSON.stringify(values(r))} should include ${want}`);
  });
}

test("ordinals with no rank context pass: place, batch, finished", () => {
  for (const line of ["Put the first controls in place for month-end close", "The second review took place in Power BI",
    "Onboarded the first batch of analysts", "Finished the first month-end close in Power BI"]) {
    assert.equal(run(line).issues.some((i) => i.kind === "rank"), false, line);
  }
});

test("one phrase gives one rank issue: top-ranked, first prize", () => {
  assert.deepEqual(run("top-ranked analyst").issues.filter((i) => i.kind === "rank").map((i) => i.value), ["top-ranked"]);
  assert.deepEqual(run("won first prize at the hackathon").issues.filter((i) => i.kind === "rank").map((i) => i.value), ["first prize"]);
});

test("C-suite as an audience is not a seniority claim (strict layer; mirrors P1-19c)", () => {
  for (const line of ["Built the deck using a C-suite narrative.", "Built the platform using a C-suite sponsor.",
    "a C-suite narrative", "a C-suite sponsor", "Presented quarterly results to the C-suite",
    "Prepared C-suite reporting packs", "Briefed C-suite stakeholders monthly", "Reported risks to the C-suite"]) {
    assert.deepEqual(run(line).issues, [], line);
  }
});

test("crore: a non-noun after a bare crore figure is not a count", () => {
  for (const line of ["Handled budgets of 2 crore towards vendors", "Handled budgets of 2 crore plus", "Handled budgets of 2 crore this year"]) {
    assert.deepEqual(run(line).issues, [], line);
  }
  assert.ok(values(run("Managed 2 crore analysts")).includes("2 crore analysts"));
  assert.ok(values(run("Managed 2 crore customers")).includes("2 crore customers"));
});

test("an absent figure is confirmed with what it is about", () => {
  const r = run("Led a team of 12 analysts across reporting");
  const issue = r.issues.find((i) => i.value === "12");
  assert.equal(issue.attestAs, "12 analysts");
  assert.equal(issue.message, 'The figure "12" is not in your confirmed facts. Confirm "12 analysts" only if it is true.');
  assert.equal(run("Led a team of 12 analysts across reporting", withExtra(SOURCE_V, "12 analysts")).verdict, "pass");
  assert.equal(run("Grew the team to 12 offices", withExtra(SOURCE_V, "12 analysts")).verdict, "block");
  // No noun near the figure: the bare figure is what gets confirmed.
  assert.equal(run("Scored 12").issues.find((i) => i.value === "12").attestAs, undefined);
});

const PASS = [
  ["Ranked 1st among analysts", withExtra(SOURCE_V, "Ranked 1st among analysts"), []],
  ["Completed a bachelor's degree in commerce", withExtra(SOURCE_V, "bachelor's degree in commerce"), []],
  ["Fluent in German and English", withExtra(SOURCE_V, "Fluent in German"), ["english"]],
  ["Assistant manager for vendor contracts", SOURCE_V.replace("**Senior Analyst**", "**Assistant Manager**"), []],
  ["Vice President of finance", SOURCE_V.replace("**Senior Analyst**", "**VP**"), []],
  ["Sr. Manager", SOURCE_V.replace("**Senior Analyst**", "**Senior Manager**"), []],
  // round 2: a fact in one spelling backs the others
  ["Commerce graduate with honours", SOURCE_V.replace("- B.Com, Christ University, 2019", "- B.Com (Hons), Christ University, 2019"), []],
  ["B. Com graduate from Christ University", SOURCE_V, []],
  ["Bilingual analyst", withExtra(SOURCE_V, "Bi-lingual in English and Hindi"), []],
  ["Speaks Bangla at work", withExtra(SOURCE_V, "Speaks Bengali"), []],
  ["MBA graduate", withExtra(SOURCE_V, "Master of Business Administration, IIM Bangalore"), ["mba"]],
  ["Came first in the batch", withExtra(SOURCE_V, "Came first in the batch"), []],
  ["Employee of the Month at Infosys", withExtra(SOURCE_V, "Employee of the Month"), []],
  ["Longstanding member of the finance team", withExtra(SOURCE_V, "Longstanding member of the finance team"), []],
  ["Presented quarterly results to the C-suite", SOURCE_V, []],
  // review 2, edit 7: an award in the facts backs "award-winning"; a figure before "years ... experience" exempts it
  ["An award-winning analyst", withExtra(SOURCE_V, "Won the CFO Excellence Award 2022"), []],
  ["An award-winning analyst", withExtra(SOURCE_V, "Was awarded the CFO Excellence Award"), []],
  ["An award-winning analyst", withExtra(SOURCE_V, "Won first prize at the state finance quiz"), ["award-winning"]],
  ["Finance analyst with 4 years of solid reporting experience", SOURCE_V, []],
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
    "C-suite ".repeat(3750),
    "1st in class came first ".repeat(1250).slice(0, 30000),
    "Presented results to the C-suite ".repeat(900).slice(0, 30000),
  ];
  for (const [i, src] of sources.entries()) {
    const t0 = performance.now();
    run("Led a team of 12 analysts, ranked 1st, certified expert across 3 crore analysts, presented to the C-suite, came first in class", src);
    const ms = performance.now() - t0;
    assert.ok(ms < 500, `source ${i} cold: ${ms.toFixed(0)} ms`);
    const t1 = performance.now();
    for (let k = 0; k < 5; k++) run("Led reporting", src);
    assert.ok(performance.now() - t1 < 500, `source ${i} warm`);
  }
});

// P1-19c money rules, as the app's own figure keys already hold them (value plus unit class):
// one rupee amount in any spelling is one claim, and money never backs a count.
test("money: rupee spellings are one amount; money never backs a count (mirrors P1-19c by key)", () => {
  const src = "## Experience\n**Analyst**\n- Handled budgets of ₹2 crore\n- Managed 3 analysts";
  for (const ok of ["Handled Rs. 2 Cr budgets", "Handled INR 200 lakh budgets", "Handled 2 crore rupees of budgets", "Handled ₹2,00,00,000 budgets"]) {
    assert.equal(run(ok, src).verdict, "pass", ok);
  }
  for (const bad of ["Managed 2 crore analysts", "Managed 2 analysts", "Handled ₹3 budgets"]) assert.equal(run(bad, src).verdict, "block", bad);
});
