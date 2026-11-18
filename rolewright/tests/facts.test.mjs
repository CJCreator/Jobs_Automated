import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyFacts,
  normalizeFacts,
  confirmationCounts,
  factBaseText,
  tailorableLines,
  buildResume,
  resumeText,
} from "../src/lib/facts.mjs";

/** A fact base where everything is confirmed, built through the trusted path. */
function confirmedFacts() {
  return normalizeFacts(
    {
      contact: { name: "Asha Rao", email: "asha.rao@example.com", location: "Bengaluru", confirmed: true },
      summary: { text: "Finance analyst with 4 years of experience.", confirmed: true },
      experience: [
        {
          id: "exp-infosys",
          company: "Infosys",
          title: "Senior Analyst",
          location: "Bengaluru",
          start: "2019",
          end: "2023",
          confirmed: true,
          bullets: [
            { id: "b-close", text: "Reduced month-end close time by 30% using SQL and Power BI", confirmed: true },
            { id: "b-team", text: "Managed a team of 4 analysts", confirmed: true },
            { id: "b-draft", text: "Handled budgets of ₹2 crore", confirmed: false },
          ],
        },
        {
          id: "exp-unconfirmed",
          company: "Wipro",
          title: "Analyst",
          confirmed: false,
          bullets: [{ id: "b-wipro", text: "Built Tableau dashboards", confirmed: true }],
        },
      ],
      education: [{ id: "edu-1", school: "Christ University", degree: "B.Com", year: "2019", confirmed: true }],
      skills: [
        { id: "sk-sql", name: "SQL", confirmed: true },
        { id: "sk-tab", name: "Tableau", confirmed: false },
      ],
      extras: [{ id: "ex-1", text: "Won the 2021 finance quiz", confirmed: true }],
    },
    { trustConfirmed: true },
  );
}

test("emptyFacts has the documented shape", () => {
  const f = emptyFacts();
  assert.deepEqual(Object.keys(f).sort(), ["cannotConfirm", "contact", "education", "experience", "extras", "skills", "summary"]);
  assert.equal(f.contact.confirmed, false);
  assert.equal(f.summary.confirmed, false);
});

test("normalizeFacts drops unknown keys and caps lengths", () => {
  const f = normalizeFacts({
    evil: "x",
    contact: { name: "A".repeat(500), email: "a@b.co", password: "hunter2", links: Array(20).fill("https://x.test") },
    summary: { text: "S".repeat(5000), extra: 1 },
    experience: [{ company: "Co", title: "T", salary: 9, bullets: [{ text: "B".repeat(2000), secret: 1 }] }],
  });
  assert.equal("evil" in f, false);
  assert.equal("password" in f.contact, false);
  assert.equal(f.contact.name.length, 200);
  assert.equal(f.contact.links.length, 8);
  assert.equal(f.summary.text.length, 1500);
  assert.equal("salary" in f.experience[0], false);
  assert.equal(f.experience[0].bullets[0].text.length, 600);
  assert.equal("secret" in f.experience[0].bullets[0], false);
});

test("normalizeFacts assigns ids and keeps well-formed ones", () => {
  const f = normalizeFacts({
    experience: [
      { id: "keep-this-id", company: "A", bullets: ["one", "two"] },
      { company: "B", bullets: [] },
    ],
  });
  assert.equal(f.experience[0].id, "keep-this-id");
  assert.ok(f.experience[1].id.length >= 6);
  assert.ok(f.experience[0].bullets.every((b) => typeof b.id === "string" && b.id.length >= 6));
});

test("normalizeFacts replaces repeated and malformed ids", () => {
  const f = normalizeFacts({
    experience: [
      { id: "same-id-1", company: "A", bullets: [{ id: "same-id-1", text: "x" }, { id: "same-id-1", text: "y" }] },
      { id: "same-id-1", company: "B" },
      { id: "no", company: "C" },
      { id: "has space!", company: "D" },
    ],
  });
  const ids = [f.experience.map((e) => e.id), f.experience[0].bullets.map((b) => b.id)].flat();
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(f.experience[0].id, "same-id-1");
  assert.notEqual(f.experience[2].id, "no");
});

test("normalizeFacts accepts bullets, skills and summary given as plain strings", () => {
  const f = normalizeFacts({
    summary: "Plain summary",
    experience: [{ company: "A", title: "T", bullets: ["First", "Second", "", "  "] }],
    skills: ["SQL", "Excel", ""],
  });
  assert.equal(f.summary.text, "Plain summary");
  assert.deepEqual(f.experience[0].bullets.map((b) => b.text), ["First", "Second"]);
  assert.deepEqual(f.skills.map((s) => s.name), ["SQL", "Excel"]);
});

test("normalizeFacts forces confirmed:false everywhere unless trustConfirmed", () => {
  const raw = {
    contact: { name: "A", confirmed: true },
    summary: { text: "s", confirmed: true },
    experience: [{ company: "A", confirmed: true, bullets: [{ text: "b", confirmed: true }] }],
    education: [{ school: "S", confirmed: true }],
    skills: [{ name: "SQL", confirmed: true }],
    extras: [{ text: "x", confirmed: true }],
  };
  const all = (f) => [
    f.contact.confirmed, f.summary.confirmed, f.experience[0].confirmed, f.experience[0].bullets[0].confirmed,
    f.education[0].confirmed, f.skills[0].confirmed, f.extras[0].confirmed,
  ];
  assert.deepEqual(all(normalizeFacts(raw)), Array(7).fill(false));
  assert.deepEqual(all(normalizeFacts(raw, { trustConfirmed: false })), Array(7).fill(false));
  assert.deepEqual(all(normalizeFacts(raw, { trustConfirmed: true })), Array(7).fill(true));
});

test("trustConfirmed only trusts a literal true", () => {
  const f = normalizeFacts({ skills: [{ name: "A", confirmed: "true" }, { name: "B", confirmed: 1 }] }, { trustConfirmed: true });
  assert.deepEqual(f.skills.map((s) => s.confirmed), [false, false]);
});

test("extras are always user-sourced, and cannotConfirm is de-duplicated", () => {
  const f = normalizeFacts({ extras: [{ text: "x", source: "upload" }], cannotConfirm: ["A", "A", " ", "B"] });
  assert.equal(f.extras[0].source, "user");
  assert.deepEqual(f.cannotConfirm, ["A", "B"]);
});

test("normalizeFacts survives garbage input", () => {
  for (const raw of [null, undefined, 5, "text", [], { experience: "no", skills: 3, contact: "x", summary: 7 }]) {
    const f = normalizeFacts(raw);
    assert.deepEqual(f.experience, []);
    assert.equal(f.summary.text, "");
  }
});

test("experience with neither company nor title is dropped", () => {
  assert.equal(normalizeFacts({ experience: [{ bullets: ["x"] }] }).experience.length, 0);
});

test("factBaseText includes only confirmed items", () => {
  const text = factBaseText(confirmedFacts());
  assert.match(text, /Asha Rao/);
  assert.match(text, /Reduced month-end close time by 30%/);
  assert.match(text, /Managed a team of 4 analysts/);
  assert.match(text, /Christ University/);
  assert.match(text, /^## Skills\nSQL$/m);
  assert.match(text, /Won the 2021 finance quiz/);
  // unconfirmed bullet under a confirmed job
  assert.doesNotMatch(text, /₹2 crore/);
  // confirmed bullet under an unconfirmed job
  assert.doesNotMatch(text, /Wipro|Tableau/);
});

test("factBaseText of an unconfirmed base is empty", () => {
  const f = normalizeFacts(confirmedFacts());
  assert.equal(factBaseText(f), "");
});

test("factBaseText follows the cv.md layout the engine reads", () => {
  const text = factBaseText(confirmedFacts());
  assert.match(text, /^## Experience$/m);
  assert.match(text, /^### Infosys — Bengaluru$/m);
  assert.match(text, /^\*\*Senior Analyst\*\*$/m);
  assert.match(text, /^2019 – 2023$/m);
});

test("factBaseText does not print an empty contact heading", () => {
  const f = normalizeFacts({ contact: { email: "a@b.co", confirmed: true } }, { trustConfirmed: true });
  assert.equal(factBaseText(f), "a@b.co");
});

test("tailorableLines returns only confirmed lines, with documented refs", () => {
  const lines = tailorableLines(confirmedFacts());
  assert.deepEqual(lines.map((l) => l.ref), ["summary", "bullet:exp-infosys:b-close", "bullet:exp-infosys:b-team"]);
  assert.deepEqual(lines.map((l) => l.kind), ["summary", "bullet", "bullet"]);
  assert.equal(lines[1].context, "Senior Analyst, Infosys");
  assert.equal(lines[2].text, "Managed a team of 4 analysts");
  assert.deepEqual(tailorableLines(normalizeFacts(confirmedFacts())), []);
});

const sug = (ref, decision, finalText, after = "unused") => ({ ref, decision, finalText, after });

test("buildResume applies only accepted suggestions and uses finalText", () => {
  const { resume, changed } = buildResume(confirmedFacts(), [
    sug("bullet:exp-infosys:b-close", "accepted", "Cut month-end close time by 30% with SQL and Power BI", "ignored after"),
    sug("bullet:exp-infosys:b-team", "rejected", "Rejected rewrite"),
    sug("summary", "pending", "Pending rewrite"),
  ]);
  assert.deepEqual(resume.experience[0].bullets, [
    "Cut month-end close time by 30% with SQL and Power BI",
    "Managed a team of 4 analysts",
  ]);
  assert.equal(resume.summary, "Finance analyst with 4 years of experience.");
  assert.deepEqual(changed, [{
    ref: "bullet:exp-infosys:b-close",
    before: "Reduced month-end close time by 30% using SQL and Power BI",
    after: "Cut month-end close time by 30% with SQL and Power BI",
  }]);
});

test("buildResume falls back to `after` when there is no finalText", () => {
  const { resume } = buildResume(confirmedFacts(), [{ ref: "summary", decision: "accepted", after: "Finance analyst, 4 years." }]);
  assert.equal(resume.summary, "Finance analyst, 4 years.");
});

test("buildResume ignores a suggestion whose ref does not exist or is not confirmed", () => {
  const { resume, changed } = buildResume(confirmedFacts(), [
    sug("bullet:exp-infosys:nope", "accepted", "Ghost line"),
    sug("bullet:exp-infosys:b-draft", "accepted", "Unconfirmed bullet rewrite"),
    sug("bullet:exp-unconfirmed:b-wipro", "accepted", "Unconfirmed job rewrite"),
  ]);
  assert.deepEqual(changed, []);
  assert.doesNotMatch(resumeText(resume), /Ghost|Unconfirmed|Wipro|Tableau/);
});

test("buildResume reports no change when the accepted text equals the original", () => {
  const { changed } = buildResume(confirmedFacts(), [sug("bullet:exp-infosys:b-team", "accepted", "Managed a team of 4 analysts")]);
  assert.deepEqual(changed, []);
});

test("buildResume ignores an accepted suggestion with empty text", () => {
  const { resume, changed } = buildResume(confirmedFacts(), [sug("summary", "accepted", "   ")]);
  assert.equal(resume.summary, "Finance analyst with 4 years of experience.");
  assert.deepEqual(changed, []);
});

test("buildResume renders only confirmed content", () => {
  const { resume } = buildResume(confirmedFacts());
  assert.deepEqual(resume.experience.map((e) => e.company), ["Infosys"]);
  assert.equal(resume.experience[0].dates, "2019 – 2023");
  assert.deepEqual(resume.skills, ["SQL"]);
  assert.deepEqual(resume.education, ["B.Com, Christ University, 2019"]);
  assert.equal(buildResume(normalizeFacts(confirmedFacts())).resume.contact, null);
});

test("buildResume does not leak an unconfirmed summary even when a suggestion targets it", () => {
  const f = confirmedFacts();
  f.summary.confirmed = false;
  const { resume, changed } = buildResume(f, [sug("summary", "accepted", "Invented summary")]);
  assert.equal(resume.summary, "");
  assert.deepEqual(changed, []);
});

test("confirmationCounts counts items and what is confirmed", () => {
  const counts = confirmationCounts(confirmedFacts());
  // contact, summary, 2 jobs, 4 bullets, 1 education, 2 skills, 1 extra
  assert.equal(counts.total, 12);
  assert.equal(counts.confirmed, 9);
  assert.deepEqual(confirmationCounts(emptyFacts()), { confirmed: 0, total: 0 });
  const unconfirmed = confirmationCounts(normalizeFacts(confirmedFacts()));
  assert.equal(unconfirmed.confirmed, 0);
  assert.equal(unconfirmed.total, 12);
});
