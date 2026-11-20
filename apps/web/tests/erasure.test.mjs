// Erasure below account level (P1-18): one tailoring with its job description,
// and the stored text of uploaded resumes. Both run through db.withUser, so
// row-level security decides whose rows they can reach.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { buildResume, normalizeFacts } from "../src/lib/facts.mjs";
import { exportBlockers } from "../src/lib/tailoring.mjs";
import { withoutResumeFacts } from "../src/lib/fact-source.mjs";

let db;
before(async () => {
  db = await createDb();
});
after(async () => {
  await db.close();
});

const count = async (table, userId, where = "") =>
  (await db.system.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1 ${where}`, [userId])).rows[0].n;

async function userWithTailoring(email) {
  const user = await repo.upsertUserByEmail(db, { email });
  const made = await repo.createJobWithTailoring(db, user.id, {
    title: "Analyst",
    company: "Acme",
    jdText: "x".repeat(250),
    suggestions: [{ id: "s1", status: "pending" }],
    provider: "gemini",
    model: "m",
  });
  return { user, ...made };
}

test("deleteTailoring removes the tailoring, its suggestions and its job", async () => {
  const a = await userWithTailoring("erase-a@example.com");
  assert.equal(await repo.deleteTailoring(db, a.user.id, a.id), true);
  assert.equal(await repo.getTailoring(db, a.user.id, a.id), null);
  assert.equal(await count("tailorings", a.user.id), 0);
  assert.equal(await count("jobs", a.user.id), 0);
});

test("another user's delete finds nothing and leaves the row", async () => {
  const a = await userWithTailoring("erase-owner@example.com");
  const b = await repo.upsertUserByEmail(db, { email: "erase-other@example.com" });
  assert.equal(await repo.deleteTailoring(db, b.id, a.id), false);
  assert.equal(await count("tailorings", a.user.id), 1);
  assert.equal(await count("jobs", a.user.id), 1);
  assert.ok(await repo.getTailoring(db, a.user.id, a.id));
});

test("a missing or malformed id deletes nothing", async () => {
  const a = await userWithTailoring("erase-missing@example.com");
  assert.equal(await repo.deleteTailoring(db, a.user.id, "00000000-0000-4000-8000-000000000000"), false);
  assert.equal(await repo.deleteTailoring(db, a.user.id, "not-a-uuid"), false);
  assert.equal(await count("tailorings", a.user.id), 1);
});

test("a job shared by two tailorings survives the first delete and goes with the second", async () => {
  const a = await userWithTailoring("erase-shared@example.com");
  const second = await repo.createTailoring(db, a.user.id, { jobId: a.jobId, suggestions: [], provider: "gemini", model: "m" });
  assert.equal(await repo.deleteTailoring(db, a.user.id, a.id), true);
  assert.equal(await count("jobs", a.user.id), 1, "job kept while another tailoring uses it");
  assert.equal(await count("tailorings", a.user.id), 1);
  assert.equal(await repo.deleteTailoring(db, a.user.id, second.id), true);
  assert.equal(await count("jobs", a.user.id), 0);
});

test("deleteResumeTexts removes only the caller's resumes and keeps confirmed facts", async () => {
  const a = await repo.upsertUserByEmail(db, { email: "erase-resume-a@example.com" });
  const b = await repo.upsertUserByEmail(db, { email: "erase-resume-b@example.com" });
  for (const u of [a, b]) {
    await repo.saveResume(db, u.id, { filename: "r1.pdf", rawText: "Resume one" });
    await repo.saveResume(db, u.id, { filename: "r2.pdf", rawText: "Resume two" });
    await repo.saveFacts(db, u.id, normalizeFacts({ summary: { text: "A summary", confirmed: true } }, { trustConfirmed: true }));
  }
  assert.deepEqual(await repo.deleteResumeTexts(db, a.id), { deleted: 2, factsRemoved: 0 });
  assert.equal(await count("resumes", a.id), 0);
  assert.equal(await count("resumes", b.id), 2, "the other user's resumes are untouched");
  assert.equal(await count("fact_bases", a.id), 1, "confirmed facts stay");
  assert.equal((await repo.getFacts(db, a.id)).summary.text, "A summary");
  assert.deepEqual(await repo.deleteResumeTexts(db, a.id), { deleted: 0, factsRemoved: 0 });
});

test("both deletes go through withUser, never db.system", () => {
  const src = readFileSync(new URL("../src/lib/db/repo.mjs", import.meta.url), "utf8");
  for (const name of ["deleteTailoring", "deleteResumeTexts"]) {
    const start = src.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    const body = src.slice(start, src.indexOf("\nexport ", start + 10));
    assert.match(body, /db\.withUser\(/);
    assert.doesNotMatch(body, /db\.system/);
  }
});

// ---- facts mode ------------------------------------------------------------

const item = (over) => ({ confirmed: true, source: "upload", ...over });
function mixedFacts() {
  return normalizeFacts(
    {
      contact: { name: "Asha Rao", email: "asha@example.com", confirmed: true },
      summary: item({ text: "Finance analyst from the upload" }),
      experience: [
        item({
          id: "j-up-id", company: "Infosys", title: "Analyst", bullets: [
            item({ id: "b-up-id", text: "Confirmed upload bullet" }),
            item({ id: "b-un-id", text: "Unconfirmed upload bullet", confirmed: false }),
            item({ id: "b-mo-id", text: "Model bullet", source: "model", confirmed: false }),
          ],
        }),
        item({
          id: "j-mixed-id", company: "Wipro", title: "Lead", bullets: [
            item({ id: "b-m1-id", text: "Upload bullet under mixed job" }),
            item({ id: "b-m2-id", text: "My own bullet", source: "user" }),
          ],
        }),
        item({ id: "j-user-id", company: "Own Co", title: "Founder", source: "user", bullets: [item({ id: "b-u1-id", text: "User bullet", source: "user" })] }),
        item({ id: "j-model-id", company: "Ghost", title: "Invented", source: "model", confirmed: false, bullets: [] }),
      ],
      education: [item({ id: "e-up-id", school: "Christ", degree: "B.Com" }), item({ id: "e-user-id", school: "Mine", degree: "MBA", source: "user" })],
      skills: [item({ id: "k-up-id", name: "SQL" }), item({ id: "k-un-id", name: "Excel", confirmed: false }), item({ id: "k-user-id", name: "Tally", source: "user" })],
      extras: [{ id: "extra-1", text: "Won an award", confirmed: true, statedAt: "2026-01-01" }],
      cannotConfirm: ["Led 50 people"],
    },
    { trustConfirmed: true },
  );
}

test("default mode leaves the facts exactly as they were", async () => {
  const u = await repo.upsertUserByEmail(db, { email: "erase-default@example.com" });
  await repo.saveResume(db, u.id, { filename: "r.pdf", rawText: "text" });
  const facts = mixedFacts();
  await repo.saveFacts(db, u.id, facts);
  await repo.deleteResumeTexts(db, u.id);
  assert.deepEqual(await repo.getFacts(db, u.id), facts);
});

test("withoutResumeFacts removes upload and model items of every kind, confirmed or not", () => {
  const { facts, removed, kept } = withoutResumeFacts(mixedFacts());
  assert.equal(facts.summary.text, "");
  assert.equal(facts.summary.confirmed, false);
  assert.equal(facts.summary.source, "upload");
  assert.deepEqual(facts.experience.map((j) => j.id), ["j-mixed-id", "j-user-id"]);
  assert.deepEqual(facts.experience[0].bullets.map((b) => b.id), ["b-m2-id"]);
  assert.deepEqual(facts.experience[1].bullets.map((b) => b.id), ["b-u1-id"]);
  assert.deepEqual(facts.education.map((e) => e.id), ["e-user-id"]);
  assert.deepEqual(facts.skills.map((k) => k.id), ["k-user-id"]);
  // summary 1, jobs j-up-id and j-model-id 2, bullets b-up-id b-un-id b-mo-id b-m1-id 4, education 1, skills 2
  assert.equal(removed, 10);
  // jobs j-mixed-id j-user-id 2, bullets b-m2-id b-u1-id 2, education 1, skills 1
  assert.equal(kept, 6);
});

test("withoutResumeFacts keeps extras, cannotConfirm and contact, and the input is not mutated", () => {
  const before = mixedFacts();
  const snapshot = structuredClone(before);
  const { facts } = withoutResumeFacts(before);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(facts.extras, snapshot.extras);
  assert.deepEqual(facts.cannotConfirm, snapshot.cannotConfirm);
  assert.deepEqual(facts.contact, snapshot.contact);
});

test("facts mode stores the reduced facts, and user B is untouched", async () => {
  const a = await repo.upsertUserByEmail(db, { email: "erase-facts-a@example.com" });
  const b = await repo.upsertUserByEmail(db, { email: "erase-facts-b@example.com" });
  const factsB = mixedFacts();
  for (const u of [a, b]) {
    await repo.saveResume(db, u.id, { filename: "r.pdf", rawText: "text" });
    await repo.saveFacts(db, u.id, mixedFacts());
  }
  assert.deepEqual(await repo.deleteResumeTexts(db, a.id, { facts: true }), { deleted: 1, factsRemoved: 10 });
  assert.deepEqual(await repo.getFacts(db, a.id), withoutResumeFacts(mixedFacts()).facts);
  assert.deepEqual(await repo.getFacts(db, b.id), factsB);
  assert.equal(await count("resumes", b.id), 1);
});

test("with no facts row and no resumes the result is zeros, twice, in both modes", async () => {
  const u = await repo.upsertUserByEmail(db, { email: "erase-empty@example.com" });
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await repo.deleteResumeTexts(db, u.id, { facts: true }), { deleted: 0, factsRemoved: 0 });
  }
  assert.deepEqual(await repo.deleteResumeTexts(db, u.id), { deleted: 0, factsRemoved: 0 });
});

test("a saved suggestion on a removed line builds no line", () => {
  const { facts } = withoutResumeFacts(mixedFacts());
  const accepted = [{ id: "s1", ref: "bullet:j-up-id:b-up-id", decision: "accepted", finalText: "Reworded old bullet" }];
  const { resume, changed } = buildResume(facts, accepted);
  assert.deepEqual(changed, []);
  assert.ok(!resumeTextOf(resume).includes("Reworded old bullet"));
});

test("when every fact came from the resume the built resume is empty", () => {
  const all = normalizeFacts(
    { summary: item({ text: "S" }), experience: [item({ id: "j", company: "A", title: "B", bullets: [item({ id: "b", text: "x" })] })], education: [item({ school: "S" })], skills: [item({ name: "k" })] },
    { trustConfirmed: true },
  );
  const { resume } = buildResume(withoutResumeFacts(all).facts, []);
  assert.equal(resume.summary, "");
  assert.deepEqual([resume.experience, resume.education, resume.skills], [[], [], []]);
});

test("an accepted rewrite on a kept user line still gets a fresh export check", () => {
  const { facts } = withoutResumeFacts(mixedFacts());
  const seen = [];
  const engineGate = (text) => {
    seen.push(text);
    return { invented: [], unsupportedFacts: [], forbidden: [] };
  };
  const suggestions = [{ id: "s2", ref: "bullet:j-mixed-id:b-m2-id", decision: "accepted", finalText: "My own bullet, reworded" }];
  exportBlockers(facts, suggestions, { jdText: "", engineGate });
  assert.ok(seen.includes("My own bullet, reworded"), "the gate ran on the exported text");
});

function resumeTextOf(resume) {
  return JSON.stringify(resume);
}
