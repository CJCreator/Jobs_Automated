// tests/readme-usage-commands.test.mjs — the README's Command Reference table
// names only commands the skill router accepts.
//
// The engine README is a short Rolewright page, not the upstream career-ops
// README with its per-mode Usage tables, so the upstream checks (every routed
// mode has a README row, every row links its mode file) no longer apply. What
// still can drift is a command the README tells the reader to type that the
// router does not route.
//
// Run:  node --test tests/readme-usage-commands.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const README = readFileSync(join(ROOT, 'README.md'), 'utf-8').replace(/\r\n/g, '\n');
const SKILL = readFileSync(join(ROOT, '.agents', 'skills', 'rolewright', 'SKILL.md'), 'utf-8').replace(/\r\n/g, '\n');

const reference = README.split('\n### Command Reference\n')[1]?.split('\n---')[0] ?? '';
/** Router inputs → mode, e.g. `inbox` → `agent-inbox`. */
const routes = new Map([...SKILL.matchAll(/^\| `([a-z/-]+)` \| `([^`]+)` \|$/gm)].map((m) => [m[1], m[2]]));
/** Backticked names in the "Mode / Script" column. Names with a colon are npm scripts, not modes. */
const commands = [...reference.matchAll(/^\| \*\*[^|]+\*\* \| ([^|]+) \|/gm)]
  .flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((c) => c[1]))
  .filter((name) => !name.includes(':'));

test('the README Command Reference parses', () => {
  assert.ok(routes.size >= 30, `only ${routes.size} router inputs parsed — the routing table format changed`);
  assert.ok(commands.length >= 5, `only ${commands.length} README commands parsed — the table format changed`);
});

test('every README command is one the router accepts', () => {
  const rejected = commands.filter((command) => !routes.has(command));
  assert.deepEqual(rejected, [], `README.md Command Reference lists command(s) the router does not route: ${rejected.join(', ')}`);
});
