// P2-6: the PDF bundle, with the Chromium renderer stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeFacts } from "../src/lib/facts.mjs";
import { BundleError, MAX_BUNDLE_TAILORINGS, buildPdfBundle, gateAndRender } from "../src/lib/server/pdf-bundle.mjs";
import { readZip } from "./zip.test.mjs";

const EXP = "exp-infosys";
const REF = `bullet:${EXP}:b-team-size`;
const gate = () => ({ invented: [], unsupportedFacts: [], forbidden: [] });
const runGate = async (fn) => fn();

function facts(name = "Asha Rao") {
  return normalizeFacts({
    contact: { name, email: "asha.rao@example.com", location: "Bengaluru", confirmed: true },
    experience: [{ id: EXP, company: "Infosys", title: "Senior Analyst", start: "2019", end: "2023", confirmed: true,
      bullets: [{ id: "b-team-size", text: "Managed a team of 4 analysts", confirmed: true }] }],
    skills: [{ name: "SQL", confirmed: true }],
  }, { trustConfirmed: true });
}

const sugg = (after, decision = "accepted") => ({ id: "s1", ref: REF, kind: "bullet", before: "Managed a team of 4 analysts", after, finalText: after, decision, checks: { verdict: "pass" } });
const ok = (id, title = "Finance Analyst") => ({ id, title, suggestions: [sugg("Managed a team of 4 analysts")], jdText: "" });
const blocked = (id) => ({ id, title: "Secret Role", suggestions: [sugg("Led a team of 12 analysts spread across Mumbai")], jdText: "" });

function stub() {
  const rendered = [];
  let active = 0;
  let maxActive = 0;
  const render = async (html) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setImmediate(r));
    rendered.push(html);
    active--;
    return Buffer.from("%PDF-stub");
  };
  return { render, rendered, maxActive: () => maxActive };
}

function run(tailorings, over = {}) {
  const map = new Map(tailorings.map((t) => [t.id, t]));
  const s = stub();
  const p = buildPdfBundle({
    listIds: async () => tailorings.map((t) => t.id),
    load: async (id) => map.get(id) ?? null,
    facts: facts(),
    engineGate: gate,
    runGate,
    render: s.render,
    date: new Date("2026-11-20T00:00:00Z"),
    ...over,
  });
  return { p, s };
}

test("only passing tailorings are rendered; the zip holds their PDFs and a README", async () => {
  const { p, s } = run([ok("a"), blocked("b"), ok("c", "Data Lead")]);
  const { zip, included } = await p;
  assert.equal(included, 2);
  assert.equal(s.rendered.length, 2);
  const names = readZip(zip).map((f) => f.name);
  assert.deepEqual(names, ["rolewright-Finance-Analyst-1.pdf", "rolewright-Data-Lead-3.pdf", "README.txt"]);
  assert.equal(s.maxActive(), 1, "rendered one at a time");
});

test("a blocked tailoring appears in README.txt by reason only, with no content", async () => {
  const { p } = run([ok("a"), blocked("b")]);
  const files = readZip((await p).zip);
  const readme = files.find((f) => f.name === "README.txt").data.toString();
  assert.match(readme, /rolewright-Secret-Role-2\.pdf: fact_gate/);
  assert.ok(!/Mumbai|12 analysts|asha/i.test(readme));
  for (const f of files.filter((x) => x.name.endsWith(".pdf"))) assert.ok(!f.data.toString().includes("Mumbai"));
});

test("nothing accepted-and-confirmed is listed as nothing_confirmed", async () => {
  const empty = normalizeFacts({}, { trustConfirmed: true });
  const { p } = run([ok("a")], { facts: empty });
  const { zip, included } = await p;
  assert.equal(included, 0);
  assert.match(readZip(zip)[0].data.toString(), /nothing_confirmed/);
});

test("another user's tailorings are never loaded: the bundle only asks for the ids it was given", async () => {
  const mine = [ok("a")];
  const loaded = [];
  const { p } = run(mine, { load: async (id) => (loaded.push(id), id === "a" ? mine[0] : null) });
  await p;
  assert.deepEqual(loaded, ["a"]);
  // A foreign id that the scoped loader cannot see is skipped, not rendered.
  const { p: p2, s } = run([ok("a")], { listIds: async () => ["a", "theirs"], load: async (id) => (id === "a" ? mine[0] : null) });
  assert.equal((await p2).included, 1);
  assert.equal(s.rendered.length, 1);
});

test("the cap holds and says so in the README", async () => {
  const many = Array.from({ length: MAX_BUNDLE_TAILORINGS + 5 }, (_, i) => ok(`t${i}`));
  const { p, s } = run(many);
  const { zip, included } = await p;
  assert.equal(included, MAX_BUNDLE_TAILORINGS);
  assert.equal(s.rendered.length, MAX_BUNDLE_TAILORINGS);
  assert.match(readZip(zip).at(-1).data.toString(), /5 older tailorings: over_cap/);
});

test("the 25 MB limit stops the bundle with a safe error", async () => {
  const big = Buffer.alloc(14 * 1024 * 1024, 1);
  const { p } = run([ok("a"), ok("b")], { render: async () => big });
  await assert.rejects(p, (e) => e instanceof BundleError && e.code === "bundle_too_large" && e.status === 413 && !/Finance/.test(e.message));
});

test("a failed render is listed and the rest continue; other errors stop the bundle", async () => {
  let n = 0;
  const render = async () => {
    if (++n === 1) throw Object.assign(new Error("x"), { code: "pdf_failed" });
    return Buffer.from("%PDF");
  };
  const { zip, skipped } = await run([ok("a"), ok("b")], { render }).p;
  assert.deepEqual(skipped.map((s) => s.reason), ["render_failed"]);
  assert.ok(readZip(zip).some((f) => f.name.endsWith("-2.pdf")));
  await assert.rejects(run([ok("a")], { render: async () => { throw new Error("boom"); } }).p, /boom/);
});

test("the renderer never sees a blocked resume", async () => {
  const s = stub();
  const r = await gateAndRender(facts(), blocked("b"), { engineGate: gate, runGate, render: s.render });
  assert.equal(r.ok, false);
  assert.equal(s.rendered.length, 0);
});

test("both routes use gateAndRender, with no second copy of the gate", () => {
  const src = (p) => readFileSync(new URL(`../src/app/api/${p}`, import.meta.url), "utf8");
  assert.match(src("tailorings/[id]/export/route.ts"), /gateAndRender\(/);
  assert.doesNotMatch(src("tailorings/[id]/export/route.ts"), /exportBlockers/);
  assert.match(src("account/export/pdfs/route.ts"), /buildPdfBundle\(/);
  assert.doesNotMatch(src("account/export/pdfs/route.ts"), /exportBlockers/);
});
