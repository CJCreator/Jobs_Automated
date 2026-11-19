// tests/plugin-registry-validate-workflow.test.mjs: validate-plugin-registry.mjs
// judges the registry in the directory it is run from.
//
// Upstream this suite also pinned .github/workflows/plugin-registry-validate.yml
// (#6010): its trigger, permissions, base-branch checkout, base-copy-only runs
// and SHA-pinned actions. That workflow was deleted with the other
// plugin-registry workflows when this engine was forked into Rolewright (see
// docs/adr/ at the repository root), so the five cases that parsed it went with
// it. What remains guards the validator itself, which still ships: it validates
// the registry in its working directory, and it loads its own copy of the code
// (validator and plugins/_registry.mjs, relative to itself), never a copy that
// sits in the directory it validates.
//
// Run:  node --test tests/plugin-registry-validate-workflow.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

const VALIDATOR = join(ROOT, 'validate-plugin-registry.mjs');

/** A scratch working directory: the real registry, plus whatever the case adds. */
function prCheckout(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'co-registry-pr-'));
  cpSync(join(ROOT, 'plugins-registry'), join(dir, 'plugins-registry'), { recursive: true });
  if (mutate) mutate(dir);
  return dir;
}

const run = (cwd, script = VALIDATOR) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });

test('the validator accepts a valid registry in its working directory', () => {
  const pr = prCheckout();
  try {
    const r = run(pr);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /plugin registry is valid/);
  } finally { rmSync(pr, { recursive: true, force: true }); }
});

test('the validator rejects a bad entry in its working directory', () => {
  const pr = prCheckout(dir => writeFileSync(join(dir, 'plugins-registry', 'evil.json'), JSON.stringify({ name: 'oops', id: 'evil' })));
  try {
    const r = run(pr);
    assert.equal(r.status, 1, 'the entry must be judged from the directory the validator runs in');
    assert.match(r.stderr, /oops/);
  } finally { rmSync(pr, { recursive: true, force: true }); }
});

test('a validator rewritten inside the PR is not the one that runs', () => {
  // The attack: the PR carries a validator that always passes. Running the base
  // copy against that directory must still reject the bad entry, and running the
  // PR's copy shows why that matters.
  const pr = prCheckout(dir => {
    writeFileSync(join(dir, 'plugins-registry', 'evil.json'), JSON.stringify({ name: 'oops', id: 'evil' }));
    writeFileSync(join(dir, 'validate-plugin-registry.mjs'), 'console.log("ok");\n');
  });
  try {
    assert.equal(run(pr, join(pr, 'validate-plugin-registry.mjs')).status, 0, 'the PR copy passes anything');
    assert.equal(run(pr, VALIDATOR).status, 1, 'the base copy still rejects the entry');
  } finally { rmSync(pr, { recursive: true, force: true }); }
});

test('a registry helper rewritten inside the PR is not the one that runs', () => {
  // Same attack one import down: the validator pulls plugins/_registry.mjs by a
  // path relative to itself, so the base copy of the validator loads the base
  // copy of the helper, whatever the PR put at plugins/_registry.mjs.
  const pr = prCheckout(dir => {
    writeFileSync(join(dir, 'plugins-registry', 'evil.json'), JSON.stringify({ name: 'oops', id: 'evil' }));
    mkdirSync(join(dir, 'plugins'), { recursive: true });
    writeFileSync(join(dir, 'plugins', '_registry.mjs'),
      'export const loadRegistry = () => ({ registryVersion: 1, plugins: [] });\n' +
      'export const loadRegistryFiles = () => [];\n' +
      'export const validateRegistryEntry = () => [];\n');
  });
  try {
    const r = run(pr, VALIDATOR);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /oops/);
  } finally { rmSync(pr, { recursive: true, force: true }); }
});
