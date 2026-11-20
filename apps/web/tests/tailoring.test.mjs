import { test } from "node:test";
import assert from "node:assert/strict";
import { factBaseText, normalizeFacts, tailorableLines } from "../src/lib/facts.mjs";
import {
  TailoringError,
  applyAction,
  buildSuggestions,
  checkSuggestion,
  exportBlockers,
  freshChecks,
} from "../src/lib/tailoring.mjs";

const EXP = "exp-infosys";
const REF = {
  close: `bullet:${EXP}:b-close-time`,
  team: `bullet:${EXP}:b-team-size`,
  budget: `bullet:${EXP}:b-budget-size`,
};

function ashaFacts(extra = {}) {
  return normalizeFacts({
    contact: { name: "Asha Rao", email: "asha.rao@example.com", location: "Bengaluru", confirmed: true },
    summary: { text: "Finance analyst with 4 years of experience in reporting and month-end close.", confirmed: true },
    experience: [{
      id: EXP, company: "Infosys", title: "Senior Analyst", location: "Bengaluru", start: "2019", end: "2023", confirmed: true,
      bullets: [
        { id: "b-close-time", text: "Reduced month-end close time by 30% using SQL and Power BI", confirmed: true },
        { id: "b-team-size", text: "Managed a team of 4 analysts", confirmed: true },
        { id: "b-budget-size", text: "Handled budgets of ₹2 crore", confirmed: true },
      ],
    }],
    education: [{ school: "Christ University", degree: "B.Com", year: "2019", confirmed: true }],
    skills: [{ name: "SQL", confirmed: true }, { name: "Power BI", confirmed: true }, { name: "Excel", confirmed: true }],
    ...extra,
  }, { trustConfirmed: true });
}

/** A stand-in for the engine gate that finds nothing and records what it saw. */
function stubGate() {
  const seen = [];
  const gate = (text, opts) => {
    seen.push({ text, sourceText: opts.sourceText });
    return { invented: [], unsupportedFacts: [], forbidden: [] };
  };
  return { gate, seen };
}

/** The confirmed facts' text and lists, as a route would pass them. */
function ctxFor(facts) {
  return { sourceText: factBaseText(facts), cannotConfirm: facts.cannotConfirm };
}

const NOW = new Date("2026-11-18T09:30:00Z");
const JD = "We are hiring a finance analyst who knows SQL, Tableau and month-end close reporting. ".repeat(4);

function suggestion(ref, finalText, decision = "pending", over = {}) {
  return {
    id: `s-${ref.split(":").pop()}`,
    ref,
    kind: ref === "summary" ? "summary" : "bullet",
    context: "Senior Analyst, Infosys",
    before: "",
    after: finalText,
    rationale: "",
    check: { verdict: "pass", issues: [], advisory: [], engineRan: true },
    decision,
    finalText,
    ...over,
  };
}

function expectError(fn, status, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof TailoringError, `expected a TailoringError, got ${err}`);
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test("buildSuggestions makes full, checked suggestions from the AI's rewrites", () => {
  const facts = ashaFacts();
  const lines = tailorableLines(facts);
  const { gate } = stubGate();
  const raw = [
    { ref: REF.close, after: "  Cut month-end close time by 30% with SQL and Power BI reporting ", rationale: "Matches the job." },
    { ref: REF.team, after: "Led a team of 12 analysts across reporting", rationale: "Shows scale." },
    { ref: REF.team, after: "A second rewrite of the same line is dropped" },
    { ref: "bullet:nope:nope", after: "Not one of the user's lines" },
    { ref: REF.budget, after: "   " },
  ];
  const out = buildSuggestions(raw, lines, { ...ctxFor(facts), jdText: JD, engineGate: gate });
  assert.equal(out.length, 2);
  const [close, team] = out;
  assert.match(close.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(close.id, team.id);
  assert.equal(close.before, "Reduced month-end close time by 30% using SQL and Power BI");
  assert.equal(close.after, "Cut month-end close time by 30% with SQL and Power BI reporting");
  assert.equal(close.finalText, close.after);
  assert.equal(close.decision, "pending");
  assert.equal(close.kind, "bullet");
  assert.equal(close.context, "Senior Analyst, Infosys");
  assert.equal(close.rationale, "Matches the job.");
  assert.notEqual(close.check.verdict, "block");
  assert.equal(close.check.engineRan, true);
  assert.equal(team.check.verdict, "block");
  assert.deepEqual(team.check.issues.map((i) => i.value), ["12"]);
});

test("checkSuggestion checks the final text, not the AI's original", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const s = suggestion(REF.team, "Managed a team of 4 analysts", "pending", { after: "Led a team of 12 analysts" });
  const checked = checkSuggestion(s, { ...ctxFor(facts), engineGate: gate });
  assert.equal(checked.check.verdict, "pass");
  assert.equal(checked.after, "Led a team of 12 analysts");
});

test("accepting a blocked suggestion is refused, even when its stored check says pass", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "Led a team of 12 analysts across reporting")];
  expectError(() => applyAction(facts, list, list[0].id, { action: "accept" }, { jdText: JD, engineGate: gate }), 409, "blocked");
});

test("accepting a faithful suggestion records the decision and a fresh check", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [suggestion(REF.close, "Cut month-end close time by 30% with SQL and Power BI reporting", "pending", { check: { verdict: "block", issues: [], advisory: [], engineRan: false } })];
  const { suggestions, factsChanged } = applyAction(facts, list, list[0].id, { action: "accept" }, { jdText: JD, engineGate: gate });
  assert.equal(factsChanged, false);
  assert.equal(suggestions[0].decision, "accepted");
  assert.notEqual(suggestions[0].check.verdict, "block");
  assert.equal(suggestions[0].check.engineRan, true);
});

test("reject only changes the decision", () => {
  const facts = ashaFacts();
  const list = [suggestion(REF.team, "Led a team of 12 analysts", "pending")];
  const { suggestions } = applyAction(facts, list, list[0].id, { action: "reject", decision: "accepted" }, { engineGate: stubGate().gate });
  assert.equal(suggestions[0].decision, "rejected");
});

test("edit validates length, re-checks the new wording and puts the decision back to pending", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "Led a team of 12 analysts across reporting", "pending")];
  const ctx = { jdText: JD, engineGate: gate };
  expectError(() => applyAction(facts, list, list[0].id, { action: "edit", text: "   " }, ctx), 400, "invalid_text");
  expectError(() => applyAction(facts, list, list[0].id, { action: "edit", text: "x".repeat(601) }, ctx), 400, "invalid_text");
  expectError(() => applyAction(facts, list, list[0].id, { action: "edit" }, ctx), 400, "invalid_text");

  const { suggestions } = applyAction(facts, list, list[0].id, { action: "edit", text: " Managed and mentored a team of 4 analysts " }, ctx);
  assert.equal(suggestions[0].finalText, "Managed and mentored a team of 4 analysts");
  assert.equal(suggestions[0].after, "Led a team of 12 analysts across reporting", "the AI's original is kept for the diff");
  assert.equal(suggestions[0].decision, "pending");
  assert.notEqual(suggestions[0].check.verdict, "block");

  const accepted = [{ ...suggestions[0], decision: "accepted" }];
  const again = applyAction(facts, accepted, accepted[0].id, { action: "edit", text: "Led a team of 12 analysts" }, ctx);
  assert.equal(again.suggestions[0].decision, "pending");
  assert.equal(again.suggestions[0].check.verdict, "block");
});

test("attesting a value that is not one of the suggestion's current issues is refused", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "Led a team of 12 analysts across reporting")];
  const ctx = { jdText: JD, engineGate: gate, now: NOW };
  expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: "Tableau" }, ctx), 400, "not_an_issue");
  expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: "I led 50 people" }, ctx), 400, "not_an_issue");
  expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: "" }, ctx), 400, "invalid_value");
  expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: 12 }, ctx), 400, "invalid_value");
  // A stored check is not a source of "current issues" either.
  const tampered = [{ ...list[0], check: { verdict: "block", issues: [{ kind: "name", value: "Google", message: "" }], advisory: [], engineRan: true } }];
  expectError(() => applyAction(facts, tampered, tampered[0].id, { action: "attest", value: "Google" }, ctx), 400, "not_an_issue");
});

test("attest adds a confirmed, user-stated fact and the blocked suggestion then passes", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [
    suggestion(REF.team, "Led a team of 12 analysts across reporting"),
    suggestion(REF.budget, "Oversaw 12 vendor contracts and budgets of ₹2 crore"),
  ];
  const ctx = { jdText: JD, engineGate: gate, now: NOW };
  const out = applyAction(facts, list, list[0].id, { action: "attest", value: " 12 " }, ctx);
  assert.equal(out.factsChanged, true);
  assert.equal(out.facts.extras.length, 1);
  const extra = out.facts.extras[0];
  // P1-20: the figure is stored with what it is about, so one attest clears the line.
  assert.equal(extra.text, "12 analysts");
  assert.equal(extra.confirmed, true);
  assert.equal(extra.source, "user");
  assert.equal(extra.statedAt, "2026-11-18");
  assert.equal(facts.extras.length, 0, "the input facts are not mutated");
  assert.notEqual(out.suggestions[0].check.verdict, "block");
  // Every suggestion is re-checked against the new facts: 12 is confirmed for analysts, not contracts.
  assert.equal(out.suggestions[1].check.verdict, "block");
  assert.deepEqual(out.suggestions[1].check.issues.map((i) => i.value), ["12 vendor"]);
  // The confirmed fact is about analysts: 12 of something else still blocks.
  const offices = checkSuggestion(suggestion(REF.team, "Grew the team to 12 offices"), { ...ctxFor(out.facts), engineGate: gate });
  assert.equal(offices.check.verdict, "block");

  // Once stated, it is no longer an issue, so it cannot be attested a second time.
  expectError(() => applyAction(out.facts, out.suggestions, list[0].id, { action: "attest", value: "12" }, ctx), 400, "not_an_issue");

  // An unconfirmed extra with the text an attest would add is confirmed in place, not duplicated.
  const pendingExtra = ashaFacts({ extras: [{ id: "x-twelve", text: "12 analysts", confirmed: false }] });
  const again = applyAction(pendingExtra, list, list[0].id, { action: "attest", value: "12" }, ctx);
  assert.equal(again.facts.extras.length, 1);
  assert.equal(again.facts.extras[0].id, "x-twelve");
  assert.equal(again.facts.extras[0].confirmed, true);
});

test("attest is refused for a value the user said they can't confirm, before any other rule", () => {
  const facts = ashaFacts({ cannotConfirm: ["12"] });
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "Led a team of 12 analysts across reporting")];
  expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: "12" }, { engineGate: gate }), 409, "cannot_confirm");
});

test("no refusal message repeats what the request sent", () => {
  const marker = "Zq9 marker <b>";
  const facts = ashaFacts({ cannotConfirm: [marker] });
  const { gate } = stubGate();
  const list = [suggestion(REF.team, `Led a team of 12 analysts ${marker}`)];
  const attempts = [
    { action: "attest", value: marker },
    { action: "attest", value: ` ${marker.toUpperCase()} ` },
    { action: "cannot_confirm", value: `${marker} x` },
    { action: "edit", text: `${marker}`.repeat(100) },
    { action: marker },
  ];
  for (const input of attempts) {
    assert.throws(() => applyAction(facts, list, list[0].id, input, { engineGate: gate }), (err) => {
      assert.ok(err instanceof TailoringError);
      assert.ok(!err.message.toLowerCase().includes("zq9"), `${input.action}: ${err.message}`);
      return true;
    });
  }
});

test("cannot_confirm needs a current issue, records it, and un-accepts an accepted suggestion that contains it", () => {
  // The user had confirmed "12" and accepted a line using it, then removed that fact.
  const facts = ashaFacts();
  const { gate } = stubGate();
  const accepted = suggestion(REF.team, "Led a team of 12 analysts", "accepted");
  const other = suggestion(REF.budget, "Trained 12 new hires and handled budgets of ₹2 crore", "pending");
  const list = [accepted, other];
  const ctx = { jdText: JD, engineGate: gate, now: NOW };

  expectError(() => applyAction(facts, list, other.id, { action: "cannot_confirm", value: "Tableau" }, ctx), 400, "not_an_issue");

  const out = applyAction(facts, list, other.id, { action: "cannot_confirm", value: "12" }, ctx);
  assert.equal(out.factsChanged, true);
  assert.deepEqual(out.facts.cannotConfirm, ["12"]);
  assert.equal(out.suggestions[0].decision, "pending", "the accepted suggestion containing it went back to pending");
  assert.equal(out.suggestions[0].check.verdict, "block");
  assert.ok(out.suggestions[0].check.issues.some((i) => i.kind === "blocked" && i.value === "12"));

  // And a later attest of the same value is refused.
  expectError(() => applyAction(out.facts, out.suggestions, other.id, { action: "attest", value: "12" }, ctx), 409, "cannot_confirm");
});

test("an unknown suggestion is 404 and an unknown action is 400", () => {
  const facts = ashaFacts();
  const list = [suggestion(REF.team, "Managed a team of 4 analysts")];
  expectError(() => applyAction(facts, list, "missing", { action: "accept" }, { engineGate: stubGate().gate }), 404, "not_found");
  expectError(() => applyAction(facts, list, list[0].id, { action: "approve" }, { engineGate: stubGate().gate }), 400, "invalid_action");
});

test("exportBlockers recomputes every check: a stored pass on 'team of 12' is still reported", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [
    suggestion(REF.close, "Cut month-end close time by 30% with SQL and Power BI reporting", "accepted"),
    suggestion(REF.team, "Led a team of 12 analysts across reporting", "accepted", { check: { verdict: "pass", issues: [], advisory: [], engineRan: true } }),
    suggestion(REF.budget, "Handled budgets of ₹2 crore using Tableau at Google", "rejected"),
    suggestion("summary", "Finance analyst managing ₹5 crore portfolios.", "pending"),
  ];
  const blockers = exportBlockers(facts, list, { jdText: JD, engineGate: gate });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].sid, list[1].id);
  assert.equal(blockers[0].ref, REF.team);
  assert.deepEqual(blockers[0].issues.map((i) => i.value), ["12"]);
});

test("exportBlockers checks exactly the text the export would contain", () => {
  const facts = ashaFacts();
  const { gate, seen } = stubGate();
  const list = [suggestion(REF.close, "  Cut month-end close time by 30% with SQL and Power BI reporting  ", "accepted")];
  assert.deepEqual(exportBlockers(facts, list, { engineGate: gate }), []);
  assert.deepEqual(seen.map((s) => s.text), ["Cut month-end close time by 30% with SQL and Power BI reporting"]);
  assert.match(seen[0].sourceText, /Managed a team of 4 analysts/);

  // An accepted suggestion for a line that is no longer in the facts is not exported, so not checked.
  const orphan = [suggestion("bullet:gone:gone", "Led a team of 12 analysts", "accepted")];
  assert.deepEqual(exportBlockers(facts, orphan, { engineGate: gate }), []);
});

test("exportBlockers honours the engine gate's findings and the can't-confirm list", () => {
  const facts = ashaFacts({ cannotConfirm: ["Power BI reporting"] });
  const flagging = () => ({ invented: [], unsupportedFacts: [{ kind: "scope", value: "Led" }], forbidden: [] });
  const list = [suggestion(REF.team, "Led a team of 4 analysts", "accepted")];
  const blockers = exportBlockers(facts, list, { engineGate: flagging });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].issues[0].kind, "scope");

  const blocked = [suggestion(REF.close, "Cut month-end close time by 30% with SQL and Power BI reporting", "accepted")];
  const b2 = exportBlockers(facts, blocked, { engineGate: stubGate().gate });
  assert.equal(b2.length, 1);
  assert.equal(b2[0].issues[0].kind, "blocked");
});

test("exportBlockers fails closed when the engine gate is missing", () => {
  const facts = ashaFacts();
  const none = exportBlockers(facts, [], {});
  assert.equal(none.length, 1);
  assert.equal(none[0].issues[0].kind, "engine");
  const withAccepted = exportBlockers(facts, [suggestion(REF.team, "Managed a team of 4 analysts", "accepted")], { engineGate: undefined });
  assert.equal(withAccepted.length, 1);
});

test("freshChecks shows checks against the current facts without touching decisions", () => {
  const facts = ashaFacts();
  const list = [suggestion(REF.team, "Led a team of 12 analysts", "accepted")];
  const out = freshChecks(facts, list, { engineGate: stubGate().gate });
  assert.equal(out[0].decision, "accepted");
  assert.equal(out[0].check.verdict, "block");
});

// P0-1a
test("attesting a claim word on a blocked suggestion adds the fact and unblocks it", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [suggestion(REF.close, "Expert in SQL and Power BI for month-end close", "pending")];
  const ctx = { jdText: JD, engineGate: gate, now: NOW };
  const before = checkSuggestion(list[0], { ...ctxFor(facts), engineGate: gate });
  assert.equal(before.check.verdict, "block");
  assert.ok(before.check.issues.some((i) => i.kind === "expertise" && i.value === "Expert"), JSON.stringify(before.check.issues));
  expectError(() => applyAction(facts, list, list[0].id, { action: "accept" }, ctx), 409, "blocked");

  const out = applyAction(facts, list, list[0].id, { action: "attest", value: "Expert" }, ctx);
  assert.equal(out.factsChanged, true);
  assert.equal(out.facts.extras.length, 1);
  assert.equal(out.facts.extras[0].text, "Expert");
  assert.equal(out.facts.extras[0].confirmed, true);
  assert.notEqual(out.suggestions[0].check.verdict, "block", JSON.stringify(out.suggestions[0].check.issues));
  const accepted = applyAction(out.facts, out.suggestions, list[0].id, { action: "accept" }, ctx);
  assert.equal(accepted.suggestions[0].decision, "accepted");
});

test("exportBlockers returns the exact exported line as text", () => {
  const facts = ashaFacts();
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "  Owned the entire finance function  ", "accepted")];
  const blockers = exportBlockers(facts, list, { engineGate: gate });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].text, "Owned the entire finance function");
  assert.ok(blockers[0].issues.some((i) => i.value === "entire"));
  // With no engine gate there is no line to show, but the field is still a string.
  assert.equal(exportBlockers(facts, list, {})[0].text, "");
});

// --- P1-20: attesting each new kind of issue, and issues with no value ---------------

const attestCases = [
  ["rank", "Ranked 1st among analysts", "Ranked 1st"],
  ["tenure", "Over a decade of experience in finance", "decade"],
  ["language", "Fluent in German", "German"],
  ["credential", "Completed a bachelor's degree in commerce", "bachelor's degree"],
  ["number context", "Oversaw 4 vendor contracts", "4 vendor"],
];
for (const [name, text, value] of attestCases) {
  test(`attest unblocks a ${name} issue`, () => {
    const facts = ashaFacts();
    const { gate } = stubGate();
    const list = [suggestion(REF.team, text)];
    const ctx = { engineGate: gate, now: NOW };
    const before = checkSuggestion(list[0], { ...ctxFor(facts), engineGate: gate });
    assert.equal(before.check.verdict, "block");
    assert.ok(before.check.issues.some((i) => i.value.toLowerCase() === value.toLowerCase()), JSON.stringify(before.check.issues));
    const out = applyAction(facts, list, list[0].id, { action: "attest", value }, ctx);
    const left = out.suggestions[0].check.issues.map((i) => i.value.toLowerCase());
    assert.ok(!left.includes(value.toLowerCase()), `${value} should be cleared, left ${JSON.stringify(left)}`);
    assert.notEqual(out.suggestions[0].check.verdict, "block", `one attest unblocks it, left ${JSON.stringify(left)}`);
  });
}

test("an issue with an empty value can be neither attested nor marked", () => {
  const facts = ashaFacts();
  const gate = () => ({ invented: [], unsupportedFacts: [], forbidden: [], coverage: { reason: "scope-not-checked" } });
  const list = [suggestion(REF.team, "Managed a team of 4 analysts")];
  const checked = checkSuggestion(list[0], { ...ctxFor(facts), engineGate: gate });
  assert.ok(checked.check.issues.some((i) => i.kind === "coverage" && i.value === ""));
  for (const action of ["attest", "cannot_confirm"]) {
    for (const value of ["", "  ", undefined]) {
      expectError(() => applyAction(facts, list, list[0].id, { action, value }, { engineGate: gate }), 400, "invalid_value");
    }
  }
});

// P1-20 round 2: every new must-block line is cleared by attesting what it flags, through
// applyAction, so each new form survives the round trip through an added fact.
const ROUND2_LINES = [
  "longstanding member of the finance team", "several yrs in finance", "Analyst with years experience in finance",
  "Analyst with years' experience in finance", "long-time finance analyst", "multi-year finance analyst",
  "multi-lingual analyst", "bi-lingual analyst", "tri-lingual analyst", "Fluent in bangla at work", "Fluent in polish at work",
  "Fluent in farsi at work", "Fluent in several languages",
  "m.c.a graduate", "b.b.a graduate", "p.g.d.m graduate", "m.b.b.s graduate", "ll.b graduate", "l.l.b graduate",
  "b tech graduate", "b. tech graduate", "b com graduate", "b. com graduate", "m sc graduate",
  "commerce graduate (hons)", "qualified ca", "c.a by training", "company secretary for the board", "m.phil in economics",
  "b.ed holder", "master of business administration", "master in finance",
  "top performer in the team", "top-rated analyst", "top-ranked analyst", "top scorer in the batch", "topped the batch",
  "won first prize at the hackathon", "runner-up at the case competition", "named in the merit list",
  "star performer of the team", "employee of the month", "passed in first division", "silver medal in commerce",
  "1st in class", "first in her batch", "came first in the university", "came in first", "finished in second place",
  "secured 1st place in the quiz",
  // the rest of the new rows, so every new form makes the round trip
  "Long-standing member of the finance team", "Fluent in multiple languages", "Fluent in many languages",
  ...["konkani", "nepali", "sindhi", "kashmiri", "maithili", "bhojpuri", "marwari", "tulu", "manipuri", "hindustani", "sinhala",
    "persian", "turkish", "thai", "vietnamese", "malay", "indonesian", "swahili", "hebrew", "greek", "swedish", "cantonese"]
    .map((l) => `Fluent in ${l} at work`),
  "b.c.a graduate", "m tech graduate", "b sc graduate", "m com graduate", "cleared ca final",
  "top-performing analyst", "top achiever in finance", "employee of the quarter", "employee of the year",
  "bronze medal in commerce", "2nd in the batch", "finished second in the region",
  "Served as a C-suite leader", "Promoted to the C-suite", "Presented results and was promoted to the C-suite",
  // review 2: dotted degrees, years ... experience, award-winning
  "analyst with an M.S. in finance", "a B.A. in economics", "an LL.M. in tax", "a postgrad qualification",
  "years of rich experience in finance", "yrs. of experience in audit", "An award-winning analyst",
];
test("P1-20 round 2: one attest per flagged item clears every new must-block line", () => {
  const { gate } = stubGate();
  const ctx = { engineGate: gate, now: NOW };
  const needed = {};
  for (const text of ROUND2_LINES) {
    let facts = ashaFacts({ education: [] });
    let list = [suggestion(REF.team, text)];
    let check = checkSuggestion(list[0], { ...ctxFor(facts), engineGate: gate }).check;
    assert.equal(check.verdict, "block", text);
    let attests = 0;
    while (check.verdict === "block") {
      const issue = check.issues.find((i) => i.value);
      assert.ok(issue, `${text}: blocked with nothing to attest ${JSON.stringify(check.issues)}`);
      assert.ok(attests < 3, `${text}: still blocked after ${attests} attests ${JSON.stringify(check.issues)}`);
      const out = applyAction(facts, list, list[0].id, { action: "attest", value: issue.value }, ctx);
      facts = out.facts;
      list = out.suggestions;
      check = list[0].check;
      attests++;
    }
    needed[text] = attests;
  }
  // Each line flags exactly one thing, so each needs exactly one attest.
  assert.deepEqual(Object.entries(needed).filter(([, n]) => n !== 1), []);
});

test("attesting a bare figure is refused when its phrase is on the can't-confirm list", () => {
  const facts = ashaFacts({ cannotConfirm: ["12 analysts"] });
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "Led a team of 12 analysts across reporting")];
  expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: "12" }, { engineGate: gate, now: NOW }), 409, "cannot_confirm");
});

// P1-20 review 2, edit 1: an attest stores a string that backs every later line, so it must
// not carry a claim the user was not asked about. Facts: title "Analyst", no extras.
const LAUNDER = [
  // [line attested, value attested, another line that must stay blocked]
  ["Led 12 senior analysts", "12", "Senior Finance Analyst driving month-end close"],
  ["Led 12 expеrts", "12", "Month-end close expеrts"],
  ["Hired 12 Deloitte auditors", "12", "Worked with Deloitte on month-end close"],
  ["Sеnior analyst for month-end close", "Sеnior", "Month-end close for sеnior staff"],
  ["Handled 2 crore directors", "2 crore directors", "Director of reporting"],
  ["Won first Deloitte director prize", null, "Director at Deloitte"],
];
for (const [line, value, other] of LAUNDER) {
  test(`attest cannot launder a claim: ${line}`, () => {
    const facts = ashaFacts();
    facts.experience = facts.experience.map((e) => ({ ...e, title: "Analyst" }));
    const { gate } = stubGate();
    const ctx = { engineGate: gate, now: NOW };
    const list = [suggestion(REF.team, line), suggestion(REF.budget, other)];
    const issues = checkSuggestion(list[0], { ...ctxFor(facts), engineGate: gate }).check.issues;
    const v = value ?? issues.find((i) => i.kind === "rank")?.value;
    assert.ok(issues.some((i) => i.value === v), `${line}: ${JSON.stringify(issues)}`);
    let after = facts;
    try {
      after = applyAction(facts, list, list[0].id, { action: "attest", value: v }, ctx).facts;
    } catch (err) {
      assert.ok(err instanceof TailoringError && err.status === 409 && err.code === "confirm_others_first", String(err));
    }
    // Whatever was stored, the other line is still blocked.
    const o = checkSuggestion(list[1], { ...ctxFor(after), engineGate: gate });
    assert.equal(o.check.verdict, "block", `${other} after attesting ${v}: stored ${JSON.stringify(after.extras.map((x) => x.text))}`);
  });
}

test("attest refusals: a claim word or name inside the stored string is refused with 409", () => {
  const facts = ashaFacts();
  facts.experience = facts.experience.map((e) => ({ ...e, title: "Analyst" }));
  const { gate } = stubGate();
  const ctx = { engineGate: gate, now: NOW };
  for (const [line, v] of [["Handled 2 crore directors", "2 crore directors"], ["Sеnior analyst for month-end close", "Sеnior"]]) {
    const list = [suggestion(REF.team, line)];
    expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: v }, ctx), 409, "confirm_others_first");
  }
  // The phrase skips nouns that are claims: "12 analysts", not "12 senior"; "12 auditors", not "12 Deloitte".
  for (const [line, stored] of [["Led 12 senior analysts", "12 analysts"], ["Hired 12 Deloitte auditors", "12 auditors"], ["Led 12 expеrts", "12"]]) {
    const list = [suggestion(REF.team, line)];
    const out = applyAction(facts, list, list[0].id, { action: "attest", value: "12" }, ctx);
    assert.equal(out.facts.extras[0].text, stored, line);
  }
  // The honest case still clears in one attest.
  const list = [suggestion(REF.team, "Led a team of 12 analysts across reporting")];
  const out = applyAction(ashaFacts(), list, list[0].id, { action: "attest", value: "12" }, ctx);
  assert.equal(out.facts.extras[0].text, "12 analysts");
  assert.notEqual(out.suggestions[0].check.verdict, "block");
});

// P1-20 final review: a rank span that holds a figure ("Secured 12 clients, first") cannot be
// attested whole, or "12" would be confirmed for anything. "top 5" still can.
const RANK_SPANS = [
  ["Secured 12 clients, first in the region", "Managed 12 clients"],
  ["Placed 12 analysts. First to automate close", "Managed 12 analysts"],
  ["Ranked 12 analysts first", "Managed 12 analysts"],
];
for (const [line, other] of RANK_SPANS) {
  test(`attest cannot launder a figure through a rank span: ${line}`, () => {
    const facts = ashaFacts();
    const { gate } = stubGate();
    const list = [suggestion(REF.team, line), suggestion(REF.budget, other)];
    const issues = checkSuggestion(list[0], { ...ctxFor(facts), engineGate: gate }).check.issues;
    const span = issues.find((i) => i.kind === "rank")?.value;
    assert.ok(span && /12/.test(span), JSON.stringify(issues));
    expectError(() => applyAction(facts, list, list[0].id, { action: "attest", value: span }, { engineGate: gate, now: NOW }), 409, "confirm_others_first");
    assert.equal(checkSuggestion(list[1], { ...ctxFor(facts), engineGate: gate }).check.verdict, "block", other);
  });
}

test("a rank shaped 'top N' is still attested with its figure in one step", () => {
  const { gate } = stubGate();
  const list = [suggestion(REF.team, "top 5 performer in the team")];
  const out = applyAction(ashaFacts(), list, list[0].id, { action: "attest", value: "top 5" }, { engineGate: gate, now: NOW });
  assert.equal(out.facts.extras[0].text, "top 5");
  assert.notEqual(out.suggestions[0].check.verdict, "block", JSON.stringify(out.suggestions[0].check.issues));
});

// KNOWN_GAP (asserts today's behaviour, not the goal): a lower-case name next to a figure reads as an
// ordinary noun, so attesting the figure stores "12 deloitte", and the capitalised name then passes
// elsewhere. Closing it needs a name dictionary or case-insensitive name reading (Phase 2).
const KNOWN_GAP_LOWERCASE_NAMES = [
  ["Hired 12 deloitte auditors", "12", "12 deloitte", "Worked with Deloitte on month-end close"],
  ["Hired 12 kpmg auditors", "12", "12 kpmg", "Worked with KPMG on month-end close"],
  ["Hired 12 google engineers", "12", "12 google", "Worked with Google on month-end close"],
  ["Built 12 tableau dashboards", "12", "12 tableau", "Built Tableau reports for month-end close"],
  ["Wrote 12 python scripts", "12", "12 python", "Wrote Python scripts for month-end close"],
  ["Top 3 deloitte partner", "3", "3 deloitte", "Worked with Deloitte on month-end close"],
  ["Reduced 30% deloitte", "30% deloitte", "30% deloitte", "Worked with Deloitte on month-end close"],
];
for (const [line, value, stored, other] of KNOWN_GAP_LOWERCASE_NAMES) {
  test(`KNOWN_GAP: lower-case name in an attest: ${line}`, () => {
    const facts = ashaFacts();
    const { gate } = stubGate();
    const list = [suggestion(REF.team, line), suggestion(REF.budget, other)];
    assert.equal(checkSuggestion(list[1], { ...ctxFor(facts), engineGate: gate }).check.verdict, "block", `${other} blocks before`);
    const out = applyAction(facts, list, list[0].id, { action: "attest", value }, { engineGate: gate, now: NOW });
    assert.equal(out.facts.extras[0].text, stored);
    assert.notEqual(out.suggestions[1].check.verdict, "block", `KNOWN_GAP: ${other} passes after attesting "${stored}"`);
  });
}
