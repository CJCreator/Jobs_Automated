import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSetStatus, TrackerServiceError } from '../../lib/services/tracker-service.mjs';

test('TrackerService: validation rules', async () => {
  await assert.rejects(
    async () => {
      await executeSetStatus({ selector: null, state: 'Applied' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'missing-selector');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await executeSetStatus({ row: 'abc', state: 'Applied' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'invalid-row');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await executeSetStatus({ row: '1', state: 'InvalidNonCanonicalStatus' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'invalid-state');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await executeSetStatus({ row: '1', report: '2', state: 'Applied' });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'conflicting-selectors');
      return true;
    }
  );
});

test('TrackerService: not found row throws TrackerServiceError', async () => {
  await assert.rejects(
    async () => {
      await executeSetStatus({ row: '999999', state: 'Evaluated', dryRun: true });
    },
    (err) => {
      assert(err instanceof TrackerServiceError);
      assert.equal(err.code, 'not-found');
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

test('TrackerService: dry-run status resolution on existing row', async () => {
  const result = await executeSetStatus({ row: '3', state: 'Evaluated', dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.num, 3);
  assert.equal(result.company, 'Stripe');
  assert.equal(result.role, 'Staff Infrastructure Engineer');
  assert.equal(result.newStatus, 'Evaluated');
});

