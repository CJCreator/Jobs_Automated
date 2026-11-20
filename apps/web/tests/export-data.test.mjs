// P2-2: the data export. One user's rows only, an empty account, and no secrets in the output.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { recordConsent } from "../src/lib/db/consents.mjs";
import { reserve } from "../src/lib/db/trial.mjs";
import { exportUserData } from "../src/lib/db/export.mjs";

let db;
before(async () => {
  db = await createDb();
});
after(async () => {
  await db.close();
});

async function seed(tag) {
  const user = await repo.upsertUserByEmail(db, { email: `${tag}@example.com`, name: `Name ${tag}` });
  await repo.saveResume(db, user.id, { filename: `${tag}-resume.pdf`, rawText: `raw text ${tag}` });
  await repo.saveFacts(db, user.id, { contact: { name: `Person ${tag}` }, skills: [`skill-${tag}`] });
  const made = await repo.createJobWithTailoring(db, user.id, {
    title: `Title ${tag}`,
    company: `Company ${tag}`,
    jdText: `jd ${tag} `.repeat(40),
    suggestions: [{ id: "s1", status: "pending", note: `note ${tag}` }],
    provider: "gemini",
    model: "m",
  });
  await recordConsent(db, user.id, { noticeVersion: "v1", purpose: "storage" });
  await reserve(db, user.id, "tailorings");
  await repo.createVerificationToken(db, { identifier: `${tag}@example.com`, token: `verification-token-${tag}`, expires: new Date(Date.now() + 1e6) });
  return { user, ...made };
}

function keyNames(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keyNames(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keyNames(v, out);
    }
  }
  return out;
}

test("an export holds all of A's rows from each table and none of B's", async () => {
  const a = await seed("exp-a-marker");
  const b = await seed("exp-b-marker");
  const out = await exportUserData(db, a.user.id);
  const text = JSON.stringify(out);
  assert.equal(out.format, "rolewright-export");
  assert.equal(out.version, 1);
  assert.ok(!Number.isNaN(Date.parse(out.exportedAt)));
  assert.equal(out.account.email, "exp-a-marker@example.com");
  assert.deepEqual(out.facts.facts.skills, ["skill-exp-a-marker"]);
  assert.equal(out.resumes.length, 1);
  assert.equal(out.resumes[0].raw_text, "raw text exp-a-marker");
  assert.equal(out.jobs.length, 1);
  assert.equal(out.jobs[0].company, "Company exp-a-marker");
  assert.equal(out.tailorings.length, 1);
  assert.equal(out.tailorings[0].id, a.id);
  assert.equal(out.tailorings[0].suggestions[0].note, "note exp-a-marker");
  assert.equal(out.consents.length, 1);
  assert.equal(out.trial.tailorings_used, 1);
  assert.ok(!text.includes("exp-b-marker"), "B's marker must not appear");
  assert.ok(!text.includes(b.user.id));
  assert.ok(!text.includes("verification-token"));
  JSON.parse(text);
});

test("an empty account exports cleanly", async () => {
  const user = await repo.upsertUserByEmail(db, { email: "exp-empty@example.com" });
  const out = await exportUserData(db, user.id);
  assert.equal(out.account.email, "exp-empty@example.com");
  assert.equal(out.facts, null);
  assert.deepEqual([out.resumes, out.jobs, out.tailorings, out.consents], [[], [], [], []]);
  assert.equal(out.trial, null);
});

test("the output has no key named key, token or password", async () => {
  const a = await seed("exp-keys");
  const names = [...keyNames(await exportUserData(db, a.user.id))];
  assert.deepEqual(names.filter((n) => /key|token|password|secret/i.test(n)), []);
});

test("the route follows the conventions: user required, rate limited, attachment, no-store", () => {
  const src = readFileSync(new URL("../src/app/api/account/export/route.ts", import.meta.url), "utf8");
  assert.match(src, /route\("account\.export"/);
  assert.match(src, /await requireUser\(state\)/);
  assert.match(src, /await takeRateLimit\("export", userId\)/);
  assert.match(src, /attachment; filename="rolewright-data-/);
  assert.match(src, /"Cache-Control": "no-store"/);
});
