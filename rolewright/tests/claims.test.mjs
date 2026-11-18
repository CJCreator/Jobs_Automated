import { test } from "node:test";
import assert from "node:assert/strict";
import { numberClaims, unsupportedNames, factTokenSet, checkText } from "../src/lib/claims.mjs";

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

const keys = (text) => numberClaims(text).map((c) => c.key);
const keyOf = (text) => {
  const k = keys(text);
  assert.equal(k.length, 1, `expected exactly one claim in ${JSON.stringify(text)}, got ${JSON.stringify(k)}`);
  return k[0];
};
const check = (text, extra = {}) => checkText({ text, sourceText: SOURCE, ...extra });

// ---------------------------------------------------------------- numberClaims

const SAME = [
  ["₹2 crore", "Rs. 2 Cr", "Rs.2 crore", "INR 20,000,000", "2 crores", "₹2,00,00,000", "20 million rupees", "2 crore ₹"],
  ["18 LPA", "₹18 lakh", "Rs 18,00,000", "18 lakhs"],
  ["30%", "30 percent", "30 pct", "30 per cent", "30 %"],
  ["$1.5M", "USD 1,500,000"],
  ["10k", "10,000"],
  ["3x", "3 x"],
  ["1.5 lakh", "1,50,000"],
  ["5+ years", "5 years"],
  ["twelve analysts", "12 analysts"],
  ["twenty-five analysts", "25 analysts"],
  ["a twelve-person team", "a 12-person team"],
  ["Managed 10–12 analysts", "Managed 10 analysts and 12 analysts"],
];
for (const group of SAME) {
  test(`numberClaims: same claim, ${group.join(" / ")}`, () => {
    const claimsOf = (t) => [...new Set(keys(t))].sort().join(",");
    const first = claimsOf(group[0]);
    for (const text of group) assert.equal(claimsOf(text), first, `${text} should read like ${group[0]}`);
  });
}

test("numberClaims: different claims stay different", () => {
  assert.notEqual(keyOf("30%"), keyOf("30"));
  assert.notEqual(keyOf("₹2 crore"), keyOf("₹5 crore"));
  assert.notEqual(keyOf("$2M"), keyOf("₹2M"));
  assert.notEqual(keyOf("4"), keyOf("12"));
  assert.notEqual(keyOf("3x"), keyOf("3"));
  assert.notEqual(keyOf("30 per cent"), keyOf("45 per cent"));
});

test("numberClaims: names that contain digits are not figures", () => {
  for (const text of ["B2B", "Web3", "v2", "24/7", "H1B", "ISO-certified", "one of the"]) {
    assert.deepEqual(keys(text), [], text);
  }
});

test("numberClaims: years, counts and ordinals", () => {
  assert.deepEqual(keys("2019"), ["2019|year"]);
  assert.deepEqual(keys("2019–2023").sort(), ["2019|year", "2023|year"]);
  assert.deepEqual(keys("2,019 users"), ["2019|count"]);
  assert.deepEqual(keys("Ranked 1st, then 2nd and 4th"), []);
});

test("numberClaims: edges of the string", () => {
  assert.deepEqual(keys("30% faster close"), ["30|percent"]);
  assert.deepEqual(keys("grew revenue by 30%."), ["30|percent"]);
  assert.deepEqual(keys("Rs.75"), ["75|money:INR"]);
  assert.deepEqual(keys("Saved Rs.75 per order"), ["75|money:INR"]);
  assert.deepEqual(keys("one of the"), []);
});

test("numberClaims: look-alike characters cannot hide a figure", () => {
  assert.equal(keyOf("₹5 crore"), keyOf("₹5 crore"));
  assert.equal(keyOf("₹５ crore"), keyOf("₹5 crore"));
  assert.equal(keyOf("₹5​ crore"), keyOf("₹5 crore"));
  assert.equal(keyOf("५ lakh"), keyOf("5 lakh"));
});

test("numberClaims: ranges give both ends the unit", () => {
  assert.deepEqual(keys("30–45%").sort(), ["30|percent", "45|percent"]);
  assert.deepEqual(keys("10-12 analysts").sort(), ["10|count", "12|count"]);
  assert.deepEqual(keys("₹10–12 lakh").sort(), ["1000000|money:INR", "1200000|money:INR"]);
});

test("numberClaims: vague amounts are claims when the facts never said them", () => {
  assert.deepEqual(keys("thousands of users"), ["thousands|vague"]);
  assert.deepEqual(keys("a dozen analysts"), ["12|count"]);
});

// ------------------------------------------------------------ unsupportedNames

const facts = factTokenSet(SOURCE);

test("unsupportedNames: names in the facts pass, others are listed once", () => {
  assert.deepEqual(unsupportedNames("SQL and Power BI at Infosys", facts), []);
  assert.deepEqual(unsupportedNames("Tableau, Tableau and Snowflake", facts), ["Tableau", "Snowflake"]);
});

test("unsupportedNames: a clause-opening verb is not a name, a clause-opening tool is", () => {
  assert.deepEqual(unsupportedNames("Spearheaded the close", facts), []);
  assert.deepEqual(unsupportedNames("Tableau dashboards for close", facts), ["Tableau"]);
  assert.deepEqual(unsupportedNames("Closed books. Snowflake migration", facts), ["Snowflake"]);
});

test("unsupportedNames: a name mid-sentence is never excused", () => {
  assert.deepEqual(unsupportedNames("Worked closely with Tableau", facts), ["Tableau"]);
  assert.deepEqual(unsupportedNames("Cut cost using Spring Boot", facts), ["Spring", "Boot"]);
  assert.deepEqual(unsupportedNames("Spring Boot services", facts), ["Spring", "Boot"]);
});

test("unsupportedNames: brackets, quotes, slashes and ampersands", () => {
  assert.deepEqual(unsupportedNames("(Reporting lead) for close", facts), []);
  assert.deepEqual(unsupportedNames('"Cut" close time via SQL/Power BI & Excel', facts), []);
  assert.deepEqual(unsupportedNames("Used SQL/Tableau", facts), ["Tableau"]);
});

test("unsupportedNames: hyphenated compounds", () => {
  assert.deepEqual(unsupportedNames("Cross-functional reporting", facts), []);
  assert.deepEqual(unsupportedNames("Data-driven close", facts), []);
  assert.deepEqual(unsupportedNames("Tableau-based dashboards", facts), ["Tableau"]);
});

test("unsupportedNames: money units are not names", () => {
  assert.deepEqual(unsupportedNames("Budgets of Rs. 2 Cr and 18 LPA", facts), []);
});

// ------------------------------------------------------------------ checkText

const BLOCK = [
  ["Led a team of 12 analysts", "12"],
  ["Handled budgets of ₹5 crore", "5 crore"],
  ["Saved 40 lakh annually", "40 lakh"],
  ["Built dashboards using Tableau", "Tableau"],
  ["Worked with Google on reporting", "Google"],
  ["Reduced close time by 45%", "45%"],
  ["Certified CPA managing audits", "CPA"],
  ["Used Python and AWS for reporting", "Python"],
  ["Used Python and AWS for reporting", "AWS"],
  ["Tableau dashboards for month-end close", "Tableau"],
  ["Managed a team of four analysts and twelve interns", "twelve"],
  ["Promoted to Finance Manager at Infosys", "Manager"],
  ["Improved reporting accuracy to 99.9%", "99.9%"],
];
for (const [text, value] of BLOCK) {
  test(`blocks: ${text} (${value})`, () => {
    const r = check(text);
    assert.equal(r.verdict, "block");
    assert.ok(
      r.issues.some((i) => i.value.toLowerCase().includes(value.toLowerCase())),
      `expected an issue naming ${value}, got ${JSON.stringify(r.issues)}`,
    );
  });
}

test("a job title that is not in the facts is caught only because it is capitalised", () => {
  // Design note: "Finance Manager" blocks on the word "Manager". Lower-case
  // "finance manager" would pass; that is a known gap of the name check.
  assert.equal(check("Promoted to Finance Manager at Infosys").verdict, "block");
});

const HONEST = [
  "Cut month-end close time by 30% with SQL and Power BI",
  "Managed a team of 4 analysts",
  "Led month-end close reporting, reducing close time by 30%",
  "Handled budgets of ₹2 crore",
  "Handled budgets of Rs. 2 Cr",
  "Finance analyst with 4 years of experience in reporting",
  "Streamlined month-end close using SQL, cutting close time by 30%",
  "Spearheaded month-end close improvements using Power BI",
  "Responsible for budgets of ₹2 crore at Infosys",
  "Partnered with analysts to speed up month-end close",
  "Senior Analyst at Infosys, 2019–2023",
  "Slashed month-end close time by 30% via SQL/Power BI.",
  "Shortened the month-end close by 30% (SQL & Power BI).",
  "Orchestrated a 4-analyst team handling month-end close",
  "Directed a team of 4 analysts.",
  "Reporting lead for a team of 4 analysts",
  "Analyst's month-end close time reduced by 30%, using SQL and Power BI",
  "Owned budgets worth ₹2 crore",
  "Stewarded ₹2 crore in budgets",
  "End-to-end ownership of month-end close reporting",
  "Cross-functional reporting for month-end close",
  "Month-end close time down 30% through SQL and Power BI automation",
  "Supervised 4 analysts; handled ₹2 crore budgets",
  "Championed faster month-end close, trimming 30% off close time using SQL",
  "Accelerated month-end close by 30% leveraging Power BI",
  "Mentored a 4-person analyst team",
  "Finance analyst (4 years) specialising in reporting and month-end close",
  "Experienced finance analyst, 4 years in reporting and month-end close.",
  "Reporting and month-end close specialist with 4 years of experience",
  "Delivered 30% faster month-end close with SQL and Power BI",
  "Oversaw a team of four analysts",
  "Administered budgets of ₹2 crore",
  "Optimised month-end close, reducing time by 30% with SQL, Power BI",
  '"Reduced" month-end close time by 30% using SQL and Power BI',
  "(Senior Analyst) Managed a team of 4 analysts",
  "Self-driven finance analyst with 4 years of experience in reporting",
  "Hands-on finance analyst: 4 years of reporting and month-end close",
  "Reduced month-end close time by 30%. Managed 4 analysts.",
  "Reduced month-end close time by 30% - using SQL and Power BI",
  "Reduced month-end close time by 30% | Handled budgets of ₹2 crore",
  "Pioneered a faster month-end close, cutting time by 30% using Power BI",
  "Reengineered month-end close, reducing time by 30% using SQL",
  "Revamped reporting for month-end close with Power BI",
  "Led a four-person analyst team",
  "Handled ₹2 crore budgets",
  " Reduced close time by 30%",
  "Finance analyst with 4 years' experience in reporting",
  "Bengaluru-based finance analyst with 4 years of experience in reporting",
  "Data-driven reporting for month-end close using SQL/Power BI/Excel",
  "Excel, SQL, and Power BI for month-end close reporting",
  "Automated month-end close reporting in Power BI, cutting close time by 30%",
  "Instituted a leaner month-end close, 30% faster, using SQL",
  "Boosted reporting efficiency by cutting month-end close time 30% with SQL",
  "Trimmed the month-end close by 30% through Power BI dashboards",
  "Embedded SQL and Power BI into month-end close, reducing time by 30%",
  "Month-end close reporting at Infosys: managed 4 analysts",
  "Teamed with 4 analysts on month-end close reporting",
  "Reduced month-end close time by 30 percent using SQL and Power BI",
  "Managed ₹2 crore budgets for the Bengaluru team",
  "Heading a team of 4 analysts, responsible for month-end close",
  "Finance analyst with over 4 years of experience in month-end close",
  "B.Com graduate from Christ University, finance analyst in reporting",
  "Facilitated month-end close with Power BI reporting",
  "Guided 4 analysts through month-end close",
  "Leveraged Excel and SQL for month-end close reporting",
  "Utilised SQL and Power BI to reduce month-end close time by 30%",
  "Finance analyst: reporting and month-end close, 4 years",
  "Spearheaded month-end close reporting for a 4-analyst team",
  "Co-ordinated month-end close across a team of 4 analysts",
  "Reduced month-end close time by 30% using SQL and Power BI.",
  "Month-end close: reduced time by 30% using SQL and Power BI",
  "Redesigned month-end close using Power BI, reducing close time by 30%",
  "Refined month-end close process, cut time by 30% using SQL",
  "Qualified finance analyst with 4 years of experience in reporting and month-end close",
  "Reporting & month-end close specialist (4 yrs)",
  "Month-end close lead; managed 4 analysts",
  "SQL-based reporting for month-end close",
  "Power BI-driven month-end close reporting",
  "Budget stewardship: ₹2 crore",
  "Close-process automation using SQL",
  "Team lead for 4 analysts",
  "Results-oriented analyst experienced in month-end close",
  "Analyst, Infosys (2019–2023)",
  "Infosys Senior Analyst: Reduced close time by 30%",
  "Delivered a 30% reduction in month-end close time using SQL and Power BI",
  "Hands-on with SQL, Power BI and Excel",
  "Streamlined month-end close — 30% faster with SQL",
  "Reduced month-end close by 30% [SQL, Power BI]",
  "Overseeing budgets of ₹2 crore",
  "Governance over ₹2 crore of budgets",
  "Mastery of SQL and Power BI for month-end close",
  "Proficiency in SQL, Power BI and Excel",
  "Expertise in month-end close reporting",
  "Stewardship of ₹2 crore budgets",
  "Turnaround of month-end close, 30% faster, using SQL",
  "Speedier month-end close (30%) using Power BI",
  "Triple-checked reporting for month-end close",
  "Analyst focused on reporting accuracy during month-end close",
  "Whole-team reporting for month-end close",
  "Day-to-day reporting for month-end close using SQL",
  "Highly organised finance analyst, 4 years in reporting",
  "Meticulous finance analyst with 4 years of experience",
  "Seasoned finance analyst who handled ₹2 crore budgets",
  "Fast month-end close: 30% quicker with Power BI",
  "Month-end close: 30% faster",
  "Mentorship of a 4-analyst team",
  "Spreadsheet-driven reporting in Excel for month-end close",
  "Assisted in month-end close reporting; handled ₹2 crore budgets",
  "Chaired weekly reporting reviews for month-end close",
  "Calibrated reporting for month-end close",
  "Kept month-end close on track for a team of 4 analysts",
  "Four analysts managed through month-end close",
  "Budget oversight of ₹2 crore",
  "Handled budgets of ₹ 2 crore",
  "Handled budgets worth ₹2,00,00,000",
  "Cut month-end close time by 30 per cent using SQL and Power BI",
];

test(`false flags: honest rewordings that introduce no new fact (${HONEST.length} lines)`, () => {
  const wronglyBlocked = HONEST.map((text) => ({ text, r: check(text) }))
    .filter(({ r }) => r.verdict === "block")
    .map(({ text, r }) => `${text}  [${r.issues.map((i) => i.value).join(", ")}]`);
  assert.deepEqual(wronglyBlocked, []);
});

test("false flags: known sentence-initial nouns outside the vocabulary are flagged, not passed", () => {
  // The cost of erring towards flagging: an uncommon capitalised noun at the
  // start of a line looks the same as a tool name. One click to attest fixes it.
  assert.equal(check("Zeitgeist-aware reporting for month-end close").verdict, "block");
});

test("honest rewordings do not trip the engine-free checks in any case or spacing", () => {
  assert.equal(check("MANAGED A TEAM OF 4 ANALYSTS").verdict, "pass");
  assert.equal(check("managed   a team of 4 analysts").verdict, "pass");
});

// Adversarial probes: each smuggles in a new claim.
const MUST_BLOCK_PROBES = [
  ["Managed twelve analysts", "twelve"],
  ["Managed a dozen analysts", "dozen"],
  ["Reduced close time by 45 per cent", "45"],
  ["Handled budgets of ₹5 crore", "5"],
  ["Handled budgets of ₹５ crore", "5"],
  ["Handled budgets of ₹5​ crore", "5"],
  ["Handled budgets of 5 crore ₹", "5"],
  ["Top 5% of analysts", "5%"],
  ["Managed 10-12 analysts", "10"],
  ["Managed 4–12 analysts", "12"],
  ["Cut close time by 30–45%", "45"],
  ["Q3 reporting lead", "Q3"],
  ["Reduced close time by ~40%", "40"],
  ["Reduced close time by nearly 50%", "50"],
  ["Managed ５ analysts", "5"],
  ["Led a twelve-person team", "twelve"],
  ["Led a twenty-five-person team", "twenty"],
  ["Handled 30 million rupees", "30 million"],
  ["Serving thousands of users", "thousands"],
  ["Used SQL in 100% of reports", "100%"],
  ["Managed a team of 4 analysts across 3 regions", "3"],
];
for (const [text, value] of MUST_BLOCK_PROBES) {
  test(`probe blocks: ${JSON.stringify(text)}`, () => {
    const r = check(text);
    assert.equal(r.verdict, "block");
    assert.ok(r.issues.some((i) => i.value.toLowerCase().includes(value.toLowerCase())), JSON.stringify(r.issues));
  });
}

// Known gaps: the design cannot catch these without flagging honest wording.
// If one of these starts failing because it now blocks, delete it from the list.
const KNOWN_GAPS = [
  "Used python for reporting",
  "Built tableau dashboards",
  "Reduced close time in half the time",
  "Doubled revenue",
  "Halved the time to close",
];
for (const text of KNOWN_GAPS) {
  test(`known gap (not blocked by strict checks alone): ${JSON.stringify(text)}`, () => {
    assert.notEqual(check(text).verdict, "block");
  });
}

test("probe: an ordinal is a position, not a count", () => {
  assert.equal(check("Ranked 1st in month-end close reporting").verdict, "pass");
});

// --------------------------------------------------------------- checkText API

test("cannotConfirm blocks the phrase for good, even once it is in the facts", () => {
  const first = check("Built dashboards using Tableau", { cannotConfirm: ["Tableau"] });
  assert.equal(first.verdict, "block");
  assert.ok(first.issues.some((i) => i.kind === "blocked" && i.value === "Tableau"));
  const later = checkText({
    text: "Built dashboards using Tableau",
    sourceText: `${SOURCE}\n- Tableau`,
    cannotConfirm: ["Tableau"],
  });
  assert.equal(later.verdict, "block");
  assert.ok(later.issues.some((i) => i.kind === "blocked"));
});

test("cannotConfirm is a whole-word match, case-insensitive", () => {
  assert.equal(check("Managed a team of 4 analysts", { cannotConfirm: ["Java"] }).verdict, "pass");
  assert.equal(check("Managed a team of 4 analysts", { cannotConfirm: ["analysts"] }).verdict, "block");
  assert.equal(check("Managed a team of 4 ANALYSTS", { cannotConfirm: ["analysts"] }).verdict, "block");
  assert.equal(check("Managed a team of 4 analysts", { cannotConfirm: ["", "  "] }).verdict, "pass");
});

test("engineGate findings are merged, de-duplicated, and engineRan is set", () => {
  let called = null;
  const engineGate = (text, opts) => {
    called = { text, sourceText: opts.sourceText };
    return { invented: ["45%"], unsupportedFacts: [{ kind: "tool", value: "snowflake" }], forbidden: [] };
  };
  const r = check("Cut close time by 45% using Snowflake", { engineGate });
  assert.equal(r.engineRan, true);
  assert.equal(called.sourceText, SOURCE);
  assert.equal(r.verdict, "block");
  const values = r.issues.map((i) => i.value.toLowerCase());
  assert.equal(values.filter((v) => v === "45%").length, 1);
  assert.equal(values.filter((v) => v === "snowflake").length, 1);
});

test("engineGate findings alone are enough to block", () => {
  const engineGate = () => ({ invented: [], unsupportedFacts: [{ kind: "scope", value: "owned" }], forbidden: ["rockstar"] });
  const r = check("Managed a team of 4 analysts", { engineGate });
  assert.equal(r.verdict, "block");
  assert.deepEqual(r.issues.map((i) => i.kind).sort(), ["forbidden", "scope"]);
});

test("without engineGate, engineRan is false", () => {
  assert.equal(check("Managed a team of 4 analysts").engineRan, false);
});

test("advisory lists job-description words the facts never used, and only warns", () => {
  const jdText = "We need someone to manage stakeholders and own the close calendar.";
  const r = check("Partnered with stakeholders to speed up month-end close", {
    before: "Managed a team of 4 analysts",
    jdText,
  });
  assert.deepEqual(r.issues, []);
  assert.ok(r.advisory.includes("stakeholders"));
  assert.equal(r.verdict, "warn");
});

test("advisory skips words already in the facts or the original line", () => {
  const jdText = "Senior analyst with experience in reporting and SQL";
  const r = check("Finance analyst with 4 years of experience in reporting", { jdText });
  assert.deepEqual(r.advisory, []);
  assert.equal(r.verdict, "pass");
});

test("a block outranks advisory warnings", () => {
  const r = check("Led a team of 12 stakeholders", { jdText: "manage stakeholders" });
  assert.equal(r.verdict, "block");
});

test("empty and missing input does not throw", () => {
  assert.equal(checkText({ text: "", sourceText: "" }).verdict, "pass");
  assert.equal(checkText({}).verdict, "pass");
  assert.deepEqual(numberClaims(undefined), []);
});
