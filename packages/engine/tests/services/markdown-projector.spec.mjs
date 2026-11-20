import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownProjector } from '../../lib/storage/markdown-projector.mjs';
import { SqliteClient } from '../../lib/storage/sqlite-client.mjs';

test('MarkdownProjector: sync, query, cache hit, and KPI summary', async () => {
  // Use in-memory SQLite for test isolation
  const sqlite = new SqliteClient(':memory:');
  const projector = new MarkdownProjector({ sqliteClient: sqlite });

  // 1. Initial sync from data/applications.md
  const syncResult = projector.syncFromMarkdown({ force: true });
  assert.equal(syncResult.synced, true);
  assert(syncResult.count >= 1);

  // 2. Query application by ID
  const app3 = projector.getApplicationById(3);
  assert.ok(app3);
  assert.equal(app3.id, 3);
  assert.equal(app3.company, 'Stripe');
  assert.equal(app3.status, 'Evaluated');
  assert.equal(app3.score_numeric, 4.5);

  // 3. Filter query
  const evaluatedApps = projector.queryApplications({ status: 'Evaluated' });
  assert.ok(Array.isArray(evaluatedApps));
  assert(evaluatedApps.length >= 1);
  assert.equal(evaluatedApps[0].company, 'Stripe');

  // 4. Instant KPI summary
  const summary = projector.getPipelineSummary();
  assert(summary.total >= 1);
  assert.equal(summary.byStatus['Evaluated'], 1);
  assert.equal(summary.avgScore, 4.5);

  // 5. Subsequent sync without file changes is cached
  const cachedSync = projector.syncFromMarkdown();
  assert.equal(cachedSync.synced, false);
  assert.equal(cachedSync.reason, 'up-to-date');

  sqlite.close();
});

