import { pass, fail, warn, ROOT } from './helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\nreports: localized decision header');

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function check(name, fn) {
  try {
    const problem = fn();
    if (problem) fail(`${name}: ${problem}`);
    else pass(name);
  } catch (err) {
    fail(`${name}: ${err.message}`);
  }
}

const LOCALES = [
  // Non-India market modes were removed (ADR 0013 at the repository root).
  { file: 'modes/hi/naukri.md', score: '**Score:** {X/5}', decision: '**निर्णय:** {आवेदन करें | विचार करें | पहले जाँचें | छोड़ें}', lede: '{आवेदन वाला वाक्य, ज्यों का त्यों}', apply: 'आवेदन करें' },
];

function headerAfterScore(text, scoreLine) {
  const at = text.indexOf(scoreLine);
  if (at < 0) return null;
  const from = text.slice(at);
  const end = from.indexOf('\n---');
  return end < 0 ? null : from.slice(0, end);
}

for (const { file, score: scoreLine, decision: decisionLine, lede, apply: applyWord } of LOCALES) {
  check(`${file} puts a translated decision under the score`, () => {
    const header = headerAfterScore(read(file), scoreLine);
    if (!header) return `score line not found: ${scoreLine}`;
    const lines = header.split('\n');
    if (lines[1] !== decisionLine) return `line after score is ${JSON.stringify(lines[1])}`;
    if (!lines.includes(lede)) return `lede missing: ${lede}`;
    if (/verdict\s*:/i.test(header)) return 'header contains Verdict:';
    const label = decisionLine.match(/^\*\*(.+):\*\*/)[1];
    if (/verdict/i.test(label)) return `label ${label} collides with VERDICT`;
    if (!decisionLine.includes(applyWord)) return 'apply word missing from the decision line';
    return null;
  });
}

const headerMod = join(ROOT, 'web', 'src', 'lib', 'report-header.mjs');
if (!existsSync(join(ROOT, 'web', 'src'))) {
  warn('web/ not present in this checkout — skipping localized decision parser checks');
} else if (!existsSync(headerMod)) {
  fail('web/ exists but web/src/lib/report-header.mjs is missing — the decision parser cannot be checked (moved?)');
} else {
  const { readReport } = await import(pathToFileURL(headerMod).href);

  check('a translated header reads as Decision', () => {
    const report = `# Evaluation: Example Labs — Researcher

**Score:** 3.4/5
**Entscheidung:** Bewerben
**URL:** https://jobs.example/researcher

---

Example Labs is a fictional employer.
`;
    const fields = readReport(report).fields;
    const decision = fields.find((f) => f.label === 'Decision');
    if (!decision || decision.value !== 'Bewerben') return JSON.stringify(fields);
    const score = fields.find((f) => f.label === 'Score');
    if (!score || score.value !== '3.4/5') return JSON.stringify(fields);
    return null;
  });

  check('English Decision and a legacy Date alias still resolve', () => {
    const report = `# Evaluation: Example Labs — Researcher

**Fecha:** 2026-10-18
**Decision:** Research first

---
`;
    const fields = readReport(report).fields;
    const decision = fields.find((f) => f.label === 'Decision');
    const date = fields.find((f) => f.label === 'Date');
    if (!decision || decision.value !== 'Research first') return JSON.stringify(fields);
    if (!date || date.value !== '2026-10-18') return JSON.stringify(fields);
    return null;
  });

  check('prototype names are not header fields', () => {
    const report = `# Evaluation: Example Labs — Researcher

**constructor:** Apply
**__proto__:** Skip
**toString:** Consider

---
`;
    const fields = readReport(report).fields;
    if (fields.length !== 0) return JSON.stringify(fields.map((f) => String(f.label)));
    return null;
  });

  check('a Verdict label is not a decision', () => {
    const report = `# Evaluation: Example Labs — Researcher

**Verdict:** Apply
**Score:** 3.4/5

---
`;
    const fields = readReport(report).fields;
    if (fields.some((f) => f.label === 'Decision')) return JSON.stringify(fields);
    return null;
  });

  for (const { file, decision: decisionLine, apply: applyWord } of LOCALES) {
    const label = decisionLine.match(/^\*\*(.+):\*\*/)[1];
    check(`${file} parser reads ${label}`, () => {
      const report = `# Evaluation: Example Labs — Researcher

**${label}:** ${applyWord}
**URL:** https://jobs.example/researcher

---
`;
      const decision = readReport(report).fields.find((f) => f.label === 'Decision');
      if (!decision || decision.value !== applyWord) return JSON.stringify(readReport(report).fields);
      return null;
    });
  }
}
