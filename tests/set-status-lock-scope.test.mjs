// tests/set-status-lock-scope.test.mjs — the status write must hold the tracker
// lock before it reads and atomically replaces applications.md. The transaction
// lives in lib/services/tracker-service.mjs (set-status.mjs is a thin CLI over
// it, and the web status route calls the same service), so that is what is read.
import { readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nset-status — tracker lock transaction scope (lib/services/tracker-service.mjs)');

const source = readFileSync(join(ROOT, 'lib/services/tracker-service.mjs'), 'utf-8');
const lockAt = source.indexOf('await acquireTrackerLockForWriter(');
const readAt = source.indexOf('readFileSync(appsFile', lockAt);
const replaceAt = source.indexOf('writeFileAtomic(appsFile', readAt);
if (lockAt >= 0 && readAt > lockAt && replaceAt > readAt) {
  pass('tracker-service.mjs acquires the tracker lock before reading and atomically replacing the tracker');
} else {
  fail('tracker-service.mjs escapes the shared tracker lock transaction scope');
}
