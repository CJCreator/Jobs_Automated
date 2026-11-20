// Erasure below account level (P1-18): one tailoring with its job description,
// and the stored text of uploaded resumes. Both run through db.withUser, so
// row-level security decides whose rows they can reach.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { normalizeFacts } from "../src/lib/facts.mjs";

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
  assert.equal(await repo.deleteResumeTexts(db, a.id), 2);
  assert.equal(await count("resumes", a.id), 0);
  assert.equal(await count("resumes", b.id), 2, "the other user's resumes are untouched");
  assert.equal(await count("fact_bases", a.id), 1, "confirmed facts stay");
  assert.equal((await repo.getFacts(db, a.id)).summary.text, "A summary");
  assert.equal(await repo.deleteResumeTexts(db, a.id), 0);
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
