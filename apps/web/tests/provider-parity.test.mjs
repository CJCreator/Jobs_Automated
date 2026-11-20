import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.ROLEWRIGHT_ALLOW_MOCK_LLM = "1";
const { COLUMNS, FIXTURES_DIR, loadFixtures, main, run } = await import("../scripts/provider-parity.mjs");

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/provider-parity.mjs");
const FAKE_KEY = "fake-parity-key-7f3a9c1e5b2d4086";

const cellsOf = (line) => line.slice(1, -1).split(" | ").map((s) => s.trim());

test("five fixtures, each an invented person with confirmed facts and a job description", () => {
  const fixtures = loadFixtures();
  assert.equal(fixtures.length, 5);
  for (const f of fixtures) {
    assert.ok(f.jdText.length >= 200, f.id);
    assert.ok(f.facts.experience.every((e) => e.confirmed), f.id);
    assert.match(f.facts.contact.email, /@example\.com$/, f.id);
  }
});

test("run() against the mock gives the table shape and counts", async () => {
  const { rows, summary, markdown } = await run({ provider: "mock" });
  assert.equal(rows.length, 5);
  const lines = markdown.split("\n");
  assert.equal(lines.length, 2 + 5 + 1);
  assert.deepEqual(cellsOf(lines[0]), COLUMNS);
  for (const l of lines) assert.equal(cellsOf(l).length, COLUMNS.length, l);
  assert.match(lines.at(-1), /^\| ALL \| mock \| mock-1 \|/);
  for (const r of rows) {
    assert.equal(r.error, "");
    assert.ok(r.rewrites > 0);
    assert.equal(r.pass + r.warn + r.block, r.rewrites);
    assert.ok(r.after.covered >= r.before.covered);
    assert.equal(r.after.total, r.before.total);
  }
  // The mock invents figures and employers on purpose, so most rewrites must block.
  assert.ok(summary.block > summary.pass);
  assert.equal(summary.rewrites, rows.reduce((a, r) => a + r.rewrites, 0));
  assert.ok(summary.blockKinds.number > 0);
});

test("the output holds no fixture text and no model text", async () => {
  const { markdown } = await run({ provider: "mock" });
  const words = new Set();
  for (const f of loadFixtures()) {
    for (const t of [f.jdText, f.facts.summary.text, f.facts.contact.name, ...f.facts.experience.flatMap((e) => [e.company, ...e.bullets.map((b) => b.text)])]) {
      for (const w of t.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 6) words.add(w.toLowerCase());
    }
  }
  const out = markdown.toLowerCase();
  // Fixture ids are the only names allowed; strip them before looking for fixture words.
  const stripped = out.replace(/\d\d-[a-z-]+/g, "");
  for (const w of words) assert.ok(!stripped.includes(w), `output contains fixture word "${w}"`);
  for (const mockText of ["month-end close", "tableau", "analysts across"]) assert.ok(!stripped.includes(mockText), mockText);
});

test("a failing provider is recorded as a code, never its message", async () => {
  const { rows, markdown } = await run({ provider: "openai", model: "gpt-x", key: FAKE_KEY, fixtures: loadFixtures().slice(0, 1), gate: () => ({}) });
  assert.match(rows[0].error, /^[\w-]+$/);
  assert.ok(!markdown.includes(FAKE_KEY));
});

test("a key never appears in stdout, stderr or the report", async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "parity-"));
  const out = path.join(dir, "report.md");
  // A hidden provider fails fast in a child process, with the key in its environment.
  const hidden = spawnSync(process.execPath, [SCRIPT, "--provider", "openai", "--model", "m", "--out", out], { env: { ...process.env, PARITY_KEY: FAKE_KEY }, encoding: "utf8" });
  assert.notEqual(hidden.status, 0);
  // A launch provider with the network stubbed: every request fails with an error that names the key and the URL.
  const realFetch = globalThis.fetch;
  const seenKeys = [];
  globalThis.fetch = async (url, init) => {
    seenKeys.push(init?.headers?.["x-goog-api-key"]);
    throw new Error(`connect failed for ${url} with ${FAKE_KEY}`);
  };
  const captured = [];
  const w1 = process.stdout.write, w2 = process.stderr.write;
  process.stdout.write = (c) => (captured.push(String(c)), true);
  process.stderr.write = (c) => (captured.push(String(c)), true);
  try {
    await main(["--provider", "gemini", "--model", "gemini-x", "--out", out], { ...process.env, PARITY_KEY: FAKE_KEY });
  } finally {
    process.stdout.write = w1;
    process.stderr.write = w2;
    globalThis.fetch = realFetch;
  }
  assert.ok(seenKeys.length > 0 && seenKeys.every((k) => k === FAKE_KEY), "the key is sent to the provider only");
  const report = fs.readFileSync(out, "utf8");
  assert.match(report, /\| ALL \| gemini \| gemini-x \|/);
  assert.match(report, /\| network \|/);
  for (const text of [hidden.stdout, hidden.stderr, report, ...captured]) assert.ok(!text.includes(FAKE_KEY));
});

test("the key is refused as an argument, and a real provider needs it in the environment", async () => {
  await assert.rejects(main(["--provider", "gemini", "--model", "m", "--key", FAKE_KEY], {}), (e) => !e.message.includes(FAKE_KEY));
  await assert.rejects(main(["--provider", "gemini", "--model", "m"], {}), /PARITY_KEY/);
  await assert.rejects(main(["--provider", "mock"], {}), /ROLEWRIGHT_ALLOW_MOCK_LLM/);
  await assert.rejects(main(["--provider", "openai", "--model", "m"], { PARITY_KEY: FAKE_KEY }), /hidden provider/);
  await assert.rejects(main(["--trial"], {}), /No trial provider/);
});

test("--out appends the table to the file", () => {
  const out = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "parity-")), "r.md");
  for (let i = 0; i < 2; i++) {
    const r = spawnSync(process.execPath, [SCRIPT, "--provider", "mock", "--out", out], { env: process.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  }
  assert.equal(fs.readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("| ALL")).length, 2);
});

test("the script exits non-zero when the engine gate cannot load", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--provider", "mock"], {
    env: { ...process.env, CAREER_OPS_CODE_ROOT: path.join(FIXTURES_DIR, "no-engine-here") },
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /fact check is not available/);
});
