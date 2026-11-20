// P1-16: the model never gets more than MAX_LINES_SENT lines, and the counts are kept and returned.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/lib/db/index.mjs";
import * as repo from "../src/lib/db/repo.mjs";
import { MAX_LINES_SENT, MAX_SUGGESTIONS, countUsable, selectLines } from "../src/lib/tailoring.mjs";

const line = (n, kind = "bullet") => ({ ref: kind === "summary" ? "summary" : `bullet:e:b${n}`, kind, context: "c", text: `line ${n}` });

test("MAX_LINES_SENT is 60 and the suggestion cap is unchanged", () => {
  assert.equal(MAX_LINES_SENT, 60);
  assert.equal(MAX_SUGGESTIONS, 20);
});

test("selectLines puts the summary first, keeps bullet order and cuts at 60", () => {
  const bullets = Array.from({ length: 74 }, (_, i) => line(i));
  const lines = [...bullets.slice(0, 2), line(0, "summary"), ...bullets.slice(2)];
  const { sent, total } = selectLines(lines);
  assert.equal(total, 75);
  assert.equal(sent.length, 60);
  assert.equal(sent[0].ref, "summary");
  assert.deepEqual(sent.slice(1).map((l) => l.ref), bullets.slice(0, 59).map((l) => l.ref));
});

test("selectLines sends everything under the cap and copes with bad input", () => {
  const lines = [line(1), line(2)];
  assert.deepEqual(selectLines(lines), { sent: lines, total: 2 });
  assert.deepEqual(selectLines(undefined), { sent: [], total: 0 });
  assert.equal(selectLines(Array.from({ length: 60 }, (_, i) => line(i))).sent.length, 60);
});

test("countUsable counts distinct known refs with text, before the cap of 20", () => {
  const lines = Array.from({ length: 40 }, (_, i) => line(i));
  const raw = lines.map((l) => ({ ref: l.ref, after: "new wording" }));
  raw.push({ ref: lines[0].ref, after: "duplicate" }, { ref: "bullet:x:unknown", after: "x" }, { ref: lines[1].ref, after: "   " }, { ref: lines[2].ref, after: 5 }, null);
  assert.equal(countUsable(raw, lines), 40);
  assert.ok(countUsable(raw, lines) > MAX_SUGGESTIONS);
  assert.equal(countUsable("nope", lines), 0);
});

let db, A, B, tid;
before(async () => {
  db = await createDb();
  A = (await repo.upsertUserByEmail(db, { email: "a@example.com" })).id;
  B = (await repo.upsertUserByEmail(db, { email: "b@example.com" })).id;
  ({ id: tid } = await repo.createJobWithTailoring(db, A, {
    title: "T", company: "C", jdText: "x".repeat(250), suggestions: [], provider: "mock", model: "m",
    linesTotal: 74, linesSent: 60, rewritesReturned: 31,
  }));
});
after(async () => { await db?.close?.(); });

test("the counts are stored and returned by getTailoring", async () => {
  const t = await repo.getTailoring(db, A, tid);
  assert.equal(t.linesTotal, 74);
  assert.equal(t.linesSent, 60);
  assert.equal(t.rewritesReturned, 31);
});

test("old rows (no counts) read back as null", async () => {
  const { id } = await repo.createJobWithTailoring(db, A, { title: "T", company: "C", jdText: "x", suggestions: [], provider: "mock" });
  const t = await repo.getTailoring(db, A, id);
  assert.equal(t.linesTotal, null);
  assert.equal(t.linesSent, null);
  assert.equal(t.rewritesReturned, null);
});

test("another user cannot read the counts", async () => {
  assert.equal(await repo.getTailoring(db, B, tid), null);
});

test("counts must be non-negative integers", async () => {
  for (const bad of [-1, 1.5, "7", NaN]) {
    await assert.rejects(async () => repo.createJobWithTailoring(db, A, { title: "T", jdText: "x", suggestions: [], linesTotal: bad }));
  }
});
