// data/pipeline.md and data/scan-history.tsv only grow. A mode that tells the
// agent to read either one whole costs 100k+ tokens on a busy search, so the
// pipeline mode and every translated copy name the same bounded search, and
// the scan mode never reads its dedup sources whole.
//
// Run:  node --test tests/modes-pending-search.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODES = join(ROOT, 'modes');
const PENDING_SEARCH = "grep -n -m 20 '^- \\[ \\] ' data/pipeline.md";

const pipelineModes = [
  'pipeline.md',
  ...readdirSync(MODES)
    .map((dir) => join(dir, 'pipeline.md'))
    .filter((rel) => existsSync(join(MODES, rel)) && rel !== 'pipeline.md'),
];

test('the pipeline mode and its translations exist', () => {
  // English + modes/hi only: non-India market sets were removed (ADR 0013).
  assert.ok(pipelineModes.includes('pipeline.md') && pipelineModes.includes(join('hi', 'pipeline.md')), `found ${pipelineModes.join(', ')}`);
});

for (const rel of pipelineModes) {
  test(`modes/${rel} finds pending items with the bounded search`, () => {
    assert.ok(readFileSync(join(MODES, rel), 'utf-8').includes(PENDING_SEARCH));
  });
}

test('the pipeline mode stops once only items it left in Pending come back', () => {
  assert.match(readFileSync(join(MODES, 'pipeline.md'), 'utf-8'), /repeat until the search prints only items you left in Pending this run/);
});

test('the scan mode does not read its dedup sources whole', () => {
  const src = readFileSync(join(MODES, 'scan.md'), 'utf-8');
  assert.doesNotMatch(src, /\*\*Read (History|Dedup Sources)\*\*/);
});
