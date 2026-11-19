import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSetStatus, TrackerServiceError } from '../../lib/services/tracker-service.mjs';
import { makeTrackerFixture } from './tracker-fixture.mjs';

test('TrackerService: validation rules', async (t) => {
  const dataRoot = makeTrackerFixture(t);
  await assert.rejects(
    async () => {
      await executeSetStatus({ dataRoot, selector: null, state: 'Applied' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'missing-selector');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await executeSetStatus({ dataRoot, row: 'abc', state: 'Applied' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'invalid-row');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await executeSetStatus({ dataRoot, row: '1', state: 'InvalidNonCanonicalStatus' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'invalid-state');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await executeSetStatus({ dataRoot, row: '1', report: '2', state: 'Applied' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'conflicting-selectors');
      return true;
    }
  );
});

test('TrackerService: not found row throws TrackerServiceError', async (t) => {
  const dataRoot = makeTrackerFixture(t);
  await assert.rejects(
    async () => {
      await executeSetStatus({ dataRoot, row: '999999', state: 'Evaluated', dryRun: true });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'not-found');
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

test('TrackerService: dry-run status resolution on existing row', async (t) => {
  const dataRoot = makeTrackerFixture(t);
  const result = await executeSetStatus({ dataRoot, row: '3', state: 'Evaluated', dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.num, 3);
  assert.equal(result.company, 'Initech');
  assert.equal(result.role, 'Staff Infrastructure Engineer');
  assert.equal(result.newStatus, 'Evaluated');
});

