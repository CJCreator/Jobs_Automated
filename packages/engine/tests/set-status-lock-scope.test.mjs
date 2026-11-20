// tests/set-status-lock-scope.test.mjs — set-status.mjs must hold the tracker
// lock before it reads and atomically replaces applications.md; the dashboard
// delegates its status writes to this script. The transaction lives in
// lib/services/tracker-service.mjs, which set-status.mjs calls.
import { readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nset-status.mjs — tracker lock transaction scope');

const source = readFileSync(join(ROOT, 'lib', 'services', 'tracker-service.mjs'), 'utf-8');
const lockAt = source.indexOf('await acquireTrackerLockForCli(');
const replaceAt = source.indexOf('writeFileAtomic(appsFile');
const readAt = source.indexOf('readFileSync(appsFile', lockAt);
if (lockAt >= 0 && readAt > lockAt && replaceAt > readAt) {
  pass('set-status.mjs acquires the tracker lock before reading and atomically replacing the tracker');
} else {
  fail('set-status.mjs escapes the shared tracker lock transaction scope');
}
