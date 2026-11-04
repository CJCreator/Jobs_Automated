import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSetStatus } from '../../lib/services/tracker-service.mjs';
import { MarkdownProjector } from '../../lib/storage/markdown-projector.mjs';
import { SqliteClient } from '../../lib/storage/sqlite-client.mjs';

test('Integration: executeSetStatus updates markdown and MarkdownProjector synchronizes SQLite', async () => {
  const sqlite = new SqliteClient(':memory:');
  const projector = new MarkdownProjector({ sqliteClient: sqlite });

  // 1. Initial sync
  const initial = projector.syncFromMarkdown({ force: true });
  assert.equal(initial.synced, true);

  // 2. Dry run status check
  const result = await executeSetStatus({
    row: '3',
    state: 'Evaluated',
    dryRun: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.company, 'Stripe');

  // 3. Confirm projector queries reflect the current state
  const app = projector.getApplicationById(3);
  assert.equal(app.company, 'Stripe');
  assert.equal(app.status, 'Evaluated');

  sqlite.close();
});

