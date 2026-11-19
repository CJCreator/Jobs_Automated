import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFacts } from "../src/lib/facts.mjs";
import { foundInUpload, reconcileUpload, squash } from "../src/lib/fact-source.mjs";

const UPLOAD = [
  "Asha Rao  asha.rao@example.com  Bengaluru",
  "Finance analyst with 4 years of experience in reporting and month-end close.",
  "Infosys - Senior Analyst   2019 - 2023",
  "- Reduced month-end close time by 30% using SQL and Power BI",
  "- Managed a team of 4 analysts across the reporting func-",
  "tion and the shared services desk",
  "- Handled budgets of ₹2 crore",
  "B.Com, Christ University 2019",
  "Skills: SQL, Power BI, Excel",
].join("\n");

const proposedRaw = () => ({
  contact: { name: "Asha Rao", email: "asha.rao@example.com", location: "Bengaluru" },
  summary: "Finance analyst with 4 years of experience in reporting and month-end close.",
  experience: [{
    company: "Infosys", title: "Senior Analyst", start: "2019", end: "2023",
    bullets: ["Reduced month-end close time by 30% using SQL and Power BI", "Managed a team of 4 analysts across the reporting function and the shared services desk", "Handled budgets of ₹2 crore"],
  }],
  education: [{ school: "Christ University", degree: "B.Com", field: "", year: "2019" }],
  skills: ["SQL", "Power BI", "Excel"],
});
const proposed = (mutate) => { const r = proposedRaw(); mutate?.(r); return normalizeFacts(r, { trustConfirmed: false }); };
const confirmedAll = (v) => {
  if (Array.isArray(v)) return v.map(confirmedAll);
  if (v && typeof v === "object") {
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, confirmedAll(x)]));
    if ("confirmed" in o) o.confirmed = true;
    return o;
  }
  return v;
};

test("squash keeps only lower-case letters and digits", () => {
  assert.equal(squash("Power-BI,  Year 2019!"), "powerbiyear2019");
});

test("a bullet copied exactly is found", () => {
  assert.equal(foundInUpload(UPLOAD, "bullet", { text: "Handled budgets of ₹2 crore" }), true);
});

test("the same bullet with a line break and a hyphen break in the upload is found", () => {
  assert.equal(
    foundInUpload(UPLOAD, "bullet", { text: "Managed a team of 4 analysts across the reporting function and the shared services desk" }),
    true,
  );
});

test("a bullet with 12 where the upload says 4 is not found", () => {
  assert.equal(foundInUpload(UPLOAD, "bullet", { text: "Managed a team of 12 analysts across the reporting function" }), false);
});

test("a skill absent from the upload is not found", () => {
  assert.equal(foundInUpload(UPLOAD, "skill", { name: "Tableau" }), false);
  assert.equal(foundInUpload(UPLOAD, "skill", { name: "Excel" }), true);
});

test("a job whose title is not in the upload is not found", () => {
  assert.equal(foundInUpload(UPLOAD, "job", { company: "Infosys", title: "Vice President", start: "2019", end: "2023" }), false);
  assert.equal(foundInUpload(UPLOAD, "job", { company: "Infosys", title: "Senior Analyst", start: "2019", end: "2023" }), true);
});

test("empty fields are ignored", () => {
  assert.equal(foundInUpload(UPLOAD, "education", { school: "Christ University", degree: "B.Com", field: "", year: "2019" }), true);
  assert.equal(foundInUpload(UPLOAD, "job", { company: "Infosys", title: "Senior Analyst", start: "", end: "" }), true);
});

test("contact and summary are checked by their fields", () => {
  assert.equal(foundInUpload(UPLOAD, "contact", { name: "Asha Rao", email: "asha.rao@example.com" }), true);
  assert.equal(foundInUpload(UPLOAD, "contact", { name: "Asha Rao", email: "other@example.com" }), false);
  assert.equal(foundInUpload(UPLOAD, "summary", { text: "Finance leader with 15 years" }), false);
});

test("reconcile: a faithful upload has no model items", () => {
  const out = reconcileUpload({}, proposed(), UPLOAD);
  const items = [out.summary, ...out.experience, ...out.experience.flatMap((e) => e.bullets), ...out.education, ...out.skills];
  assert.ok(items.every((i) => i.source === "upload"));
});

test("reconcile: an item the upload does not contain is labelled model and unconfirmed", () => {
  const out = reconcileUpload({}, proposed((r) => { r.skills.push("Tableau"); r.experience[0].bullets.push("Led a team of 12 analysts"); }), UPLOAD);
  assert.equal(out.skills.find((s) => s.name === "Tableau").source, "model");
  assert.equal(out.skills.find((s) => s.name === "SQL").source, "upload");
  assert.equal(out.experience[0].bullets.find((b) => b.text.includes("12")).source, "model");
  assert.ok(out.skills.every((s) => s.confirmed === false));
});

test("reconcile: a re-upload of the same resume keeps every confirmation and id", () => {
  const first = reconcileUpload({}, proposed(), UPLOAD);
  const stored = confirmedAll(first);
  const again = reconcileUpload(stored, proposed(), UPLOAD);
  assert.deepEqual(again, stored);
  assert.equal(again.experience[0].id, stored.experience[0].id);
  assert.deepEqual(again.experience[0].bullets.map((b) => b.id), stored.experience[0].bullets.map((b) => b.id));
});

test("reconcile: a changed bullet is unconfirmed with a new id; the others keep theirs", () => {
  const stored = confirmedAll(reconcileUpload({}, proposed(), UPLOAD));
  const upload2 = UPLOAD.replace("by 30%", "by 35%");
  const out = reconcileUpload(stored, proposed((r) => { r.experience[0].bullets[0] = "Reduced month-end close time by 35% using SQL and Power BI"; }), upload2);
  const [changed, same] = out.experience[0].bullets;
  assert.equal(changed.confirmed, false);
  assert.notEqual(changed.id, stored.experience[0].bullets[0].id);
  assert.equal(same.confirmed, true);
  assert.equal(same.id, stored.experience[0].bullets[1].id);
  assert.equal(out.experience[0].confirmed, true);
});

test("reconcile: a bullet now missing from the PDF is gone", () => {
  const stored = confirmedAll(reconcileUpload({}, proposed(), UPLOAD));
  const out = reconcileUpload(stored, proposed((r) => { r.experience[0].bullets.pop(); }), UPLOAD);
  assert.equal(out.experience[0].bullets.length, 2);
  assert.ok(!out.experience[0].bullets.some((b) => b.text.includes("budgets")));
});

test("reconcile: a model item is never auto-confirmed, even if the user confirmed it before", () => {
  const withModel = proposed((r) => r.skills.push("Tableau"));
  const stored = confirmedAll(reconcileUpload({}, withModel, UPLOAD));
  assert.equal(stored.skills.find((s) => s.name === "Tableau").source, "model");
  const out = reconcileUpload(stored, proposed((r) => r.skills.push("Tableau")), UPLOAD);
  const tableau = out.skills.find((s) => s.name === "Tableau");
  assert.equal(tableau.confirmed, false);
  assert.equal(tableau.source, "model");
});

test("reconcile: extras and cannotConfirm come from the stored facts", () => {
  const stored = normalizeFacts({ extras: [{ text: "Won an award", confirmed: true }], cannotConfirm: ["12"] }, { trustConfirmed: true });
  const out = reconcileUpload(stored, proposed(), UPLOAD);
  assert.deepEqual(out.cannotConfirm, ["12"]);
  assert.equal(out.extras[0].text, "Won an award");
  assert.equal(out.extras[0].confirmed, true);
});
