import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSetStatus } from '../../lib/services/tracker-service.mjs';
import { MarkdownProjector } from '../../lib/storage/markdown-projector.mjs';
import { SqliteClient } from '../../lib/storage/sqlite-client.mjs';
import { makeTrackerFixture } from './tracker-fixture.mjs';

test('Integration (dry run): executeSetStatus resolves a row that MarkdownProjector reads from the fixture tracker', async (t) => {
  const dataRoot = makeTrackerFixture(t);
  const sqlite = new SqliteClient(':memory:');
  const projector = new MarkdownProjector({ dataRoot, sqliteClient: sqlite });

  // 1. Initial sync
  const initial = projector.syncFromMarkdown({ force: true });
  assert.equal(initial.synced, true);

  // 2. Dry run status check
  const result = await executeSetStatus({
    dataRoot,
    row: '3',
    state: 'Evaluated',
    dryRun: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.company, 'Initech');

  // 3. Confirm projector queries reflect the fixture tracker
  const app = projector.getApplicationById(3);
  assert.equal(app.company, 'Initech');
  assert.equal(app.status, 'Evaluated');

  sqlite.close();
});

