// Provider parity (ADR 0003): runs the same synthetic fixtures through one provider and model
// and reports the fact-gate pass rate and keyword coverage. A provider or trial model stays hidden
// until its row here has been signed by the owner (docs/reviews/provider-parity.md).
//
//   node scripts/provider-parity.mjs --provider <id> [--model <id>] [--out <file>]
//   node scripts/provider-parity.mjs --trial [--out <file>]
//
// The key is read from PARITY_KEY in the environment only (never an argument) and is never
// printed, logged or written. --trial reads the ROLEWRIGHT_TRIAL_* variables the server uses.
// --provider mock needs ROLEWRIGHT_ALLOW_MOCK_LLM=1 and no key.
//
// It calls the same library functions as POST /api/tailorings (selectLines, suggestRewrites,
// buildSuggestions with the engine gate from loadFactGate). The output holds counts and fixture
// ids only: no resume or job-description text, and no model text.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildResume, factBaseText, normalizeFacts, resumeText, tailorableLines } from "../src/lib/facts.mjs";
import { analyzeCoverage, keywordsFromJdText } from "../src/lib/keyword-match.mjs";
import { suggestRewrites } from "../src/lib/llm/index.mjs";
import { isProviderAllowed, launchProviders } from "../src/lib/llm/providers.mjs";
import { loadFactGate } from "../src/lib/server/engine.mjs";
import { trialConfig } from "../src/lib/server/trial.mjs";
import { buildSuggestions, countUsable, selectLines } from "../src/lib/tailoring.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(HERE, "../tests/fixtures/parity");
const MOCK_MODEL = "mock-1";

export const COLUMNS = [
  "fixture", "provider", "model", "lines sent", "rewrites", "pass", "warn", "block",
  "block issue kinds", "coverage before", "coverage after", "ms", "error",
];

/** Fixture ids with their facts and job description, read from disk in name order. */
export function loadFixtures(dir = FIXTURES_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".facts.json"))
    .sort()
    .map((f) => {
      const id = f.replace(/\.facts\.json$/, "");
      const facts = normalizeFacts(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), { trustConfirmed: true });
      const jdText = fs.readFileSync(path.join(dir, `${id}.jd.txt`), "utf8").trim();
      return { id, facts, jdText };
    });
}

const cover = (keywords, text) => {
  const c = analyzeCoverage(keywords, text);
  return { covered: c.presentCount, total: c.total };
};

/** One fixture through one provider and model, the way the tailorings route does it. */
async function runOne({ fixture, provider, key, model, gate }) {
  const started = performance.now();
  const { id, facts, jdText } = fixture;
  const row = { fixture: id, provider, model, linesSent: 0, rewrites: 0, pass: 0, warn: 0, block: 0, blockKinds: {}, before: null, after: null, ms: 0, error: "" };
  try {
    const lines = tailorableLines(facts);
    const { sent } = selectLines(lines);
    row.linesSent = sent.length;
    const rewrites = await suggestRewrites({ provider, key, model, lines: sent, jdText });
    row.rewrites = countUsable(rewrites, sent);
    const suggestions = buildSuggestions(rewrites, sent, {
      sourceText: factBaseText(facts),
      jdText,
      cannotConfirm: facts.cannotConfirm,
      engineGate: gate,
    });
    for (const s of suggestions) {
      const verdict = s.check.verdict;
      row[verdict] = (row[verdict] ?? 0) + 1;
      if (verdict === "block") for (const i of s.check.issues) row.blockKinds[i.kind] = (row.blockKinds[i.kind] ?? 0) + 1;
    }
    const keywords = keywordsFromJdText(jdText);
    const accepted = suggestions.filter((s) => s.check.verdict !== "block").map((s) => ({ ...s, decision: "accepted" }));
    row.before = cover(keywords, resumeText(buildResume(facts, []).resume));
    row.after = cover(keywords, resumeText(buildResume(facts, accepted).resume));
  } catch (err) {
    // The code only. Messages can name a provider or carry request detail, so none is kept.
    row.error = typeof err?.code === "string" && /^[\w-]{1,40}$/.test(err.code) ? err.code : "failed";
  }
  row.ms = Math.round(performance.now() - started);
  return row;
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const cov = (c) => (c ? `${c.covered}/${c.total}` : "n/a");
const kinds = (o) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(" ") || "none";

/** Each count with its share of the rewrites that were checked. */
const share = (n, checked) => `${n} (${pct(n, checked)})`;

function summarise(rows, provider, model) {
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const blockKinds = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.blockKinds)) blockKinds[k] = (blockKinds[k] ?? 0) + v;
  const measured = rows.filter((r) => r.before && r.after);
  return {
    fixture: "ALL", provider, model,
    linesSent: sum((r) => r.linesSent), rewrites: sum((r) => r.rewrites),
    pass: sum((r) => r.pass), warn: sum((r) => r.warn), block: sum((r) => r.block), blockKinds,
    before: { covered: measured.reduce((a, r) => a + r.before.covered, 0), total: measured.reduce((a, r) => a + r.before.total, 0) },
    after: { covered: measured.reduce((a, r) => a + r.after.covered, 0), total: measured.reduce((a, r) => a + r.after.total, 0) },
    ms: sum((r) => r.ms),
    error: `${rows.filter((r) => r.error).length}/${rows.length} fixtures failed`,
  };
}

const cells = (r, isSummary) => {
  const checked = r.pass + r.warn + r.block;
  return [
    r.fixture, r.provider, r.model, r.linesSent, r.rewrites,
    isSummary ? share(r.pass, checked) : r.pass,
    isSummary ? share(r.warn, checked) : r.warn,
    isSummary ? share(r.block, checked) : r.block,
    kinds(r.blockKinds), cov(r.before), cov(r.after), r.ms, r.error || (isSummary ? "" : "none"),
  ];
};

/** The markdown table: one row per fixture and a summary row. */
export function toMarkdown(rows, summary) {
  const line = (c) => `| ${c.join(" | ")} |`;
  return [line(COLUMNS), line(COLUMNS.map(() => "---")), ...rows.map((r) => line(cells(r, false))), line(cells(summary, true))].join("\n");
}

/**
 * Run every fixture through one provider and model.
 * @param {{ provider: string, model?: string, key?: string, fixtures?: any[], gate?: Function }} opts
 *   `gate` defaults to the engine gate from loadFactGate(); it throws EngineUnavailableError when that cannot load.
 * @returns {Promise<{ rows: any[], summary: any, markdown: string }>}
 */
export async function run({ provider, model, key, fixtures = loadFixtures(), gate } = {}) {
  const engineGate = gate ?? (await loadFactGate());
  const useModel = provider === "mock" ? (model || MOCK_MODEL) : model;
  const rows = [];
  for (const fixture of fixtures) rows.push(await runOne({ fixture, provider, key, model: useModel, gate: engineGate }));
  const summary = summarise(rows, provider, useModel);
  return { rows, summary, markdown: toMarkdown(rows, summary) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--trial") out.trial = true;
    else if (a === "--provider" || a === "--model" || a === "--out") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value.`);
      out[a.slice(2)] = v;
    } else throw new Error(`Unknown argument ${a.startsWith("--key") ? "--key" : a.slice(0, 20)}. The key is read from PARITY_KEY, never an argument.`);
  }
  return out;
}

/** Redact any copy of a secret from text about to be printed or written. */
const redact = (text, secrets) => secrets.filter((s) => s && s.length >= 4).reduce((t, s) => t.split(s).join("[redacted]"), text);

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const secrets = [env.PARITY_KEY, ...trialConfig(env).map((c) => c.key)];
  const targets = [];
  if (args.trial) {
    if (args.provider || args.model) throw new Error("--trial takes no --provider or --model; it uses the ROLEWRIGHT_TRIAL_* variables.");
    for (const c of trialConfig(env)) targets.push(c);
    if (!targets.length) throw new Error("No trial provider is configured (ROLEWRIGHT_TRIAL_GEMINI_KEY and _MODEL, ROLEWRIGHT_TRIAL_OPENROUTER_KEY and _MODEL).");
  } else {
    const provider = args.provider;
    if (!provider) throw new Error("Usage: node scripts/provider-parity.mjs --provider <id> [--model <id>] [--out <file>]");
    if (provider === "mock") {
      if (env.ROLEWRIGHT_ALLOW_MOCK_LLM !== "1") throw new Error("The mock provider needs ROLEWRIGHT_ALLOW_MOCK_LLM=1.");
      if (!isProviderAllowed("mock")) throw new Error("The mock provider is not allowed in this environment.");
      targets.push({ provider, key: undefined, model: args.model || MOCK_MODEL });
    } else {
      if (!launchProviders(env).some((p) => p.id === provider)) throw new Error(`Unknown or hidden provider. Offered: ${launchProviders(env).map((p) => p.id).join(", ")}.`);
      if (!args.model) throw new Error("--model is required for a real provider.");
      if (!env.PARITY_KEY) throw new Error("Set PARITY_KEY in the environment to the provider key.");
      targets.push({ provider, key: env.PARITY_KEY, model: args.model });
    }
  }
  const gate = await loadFactGate(); // throws EngineUnavailableError before any model call
  const fixtures = loadFixtures();
  const blocks = [];
  for (const t of targets) blocks.push((await run({ ...t, fixtures, gate })).markdown);
  const text = redact(blocks.join("\n\n") + "\n", secrets);
  if (args.out) fs.appendFileSync(path.resolve(args.out), text);
  else process.stdout.write(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    const secrets = [process.env.PARITY_KEY, ...trialConfig(process.env).map((c) => c.key)];
    process.stderr.write(`${redact(String(err?.message ?? "failed").slice(0, 300), secrets)}\n`);
    process.exit(1);
  });
}
