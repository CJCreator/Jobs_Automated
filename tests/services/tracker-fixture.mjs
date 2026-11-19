// Shared fixture for tests/services/*.test.mjs. Builds a throwaway data root
// with a small applications.md, so no assertion depends on a real tracker.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const FIXTURE_TRACKER = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-05 | Acme Corp | Senior Engineer | 4.0/5 | Applied | ❌ | — | |
| 2 | 2026-01-08 | Globex | Staff Engineer | 4.0/5 | Responded | ❌ | — | |
| 3 | 2026-01-10 | Initech | Staff Infrastructure Engineer | 4.5/5 | Evaluated | ❌ | — | |
`;

// Expected values derived from FIXTURE_TRACKER.
export const FIXTURE_AVG_SCORE = 4.17; // (4.0 + 4.0 + 4.5) / 3, rounded to 2 places

/**
 * Creates a temp data root containing data/applications.md (the fixture) and
 * templates/states.yml (copied from the repo, so canonical states resolve).
 * The directory is removed when the calling test finishes.
 */
export function makeTrackerFixture(t) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'career-ops-tracker-'));
  mkdirSync(join(dataRoot, 'data'), { recursive: true });
  mkdirSync(join(dataRoot, 'templates'), { recursive: true });
  writeFileSync(join(dataRoot, 'data', 'applications.md'), FIXTURE_TRACKER);
  copyFileSync(join(REPO_ROOT, 'templates', 'states.yml'), join(dataRoot, 'templates', 'states.yml'));
  t.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  return dataRoot;
}
