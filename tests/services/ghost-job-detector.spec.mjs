import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJobLegitimacy } from '../../lib/scanners/ghost-job-detector.mjs';

test('ghost-job-detector: fresh active role achieves HIGH_CONFIDENCE (>85%)', () => {
  const job = {
    company: 'Anthropic',
    title: 'Distributed Systems Engineer',
    postedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    repostCount: 0,
    salaryDisclosed: true,
    hasHiringManagerOrTeam: true,
    companyHeadcount: 500,
    activeReqCount: 40,
    jdText: 'We are looking for a distributed systems engineer to join the Core Infrastructure team led by Sarah Connor.'
  };

  const result = analyzeJobLegitimacy(job);

  assert.equal(result.legitimacyTier, 'HIGH_CONFIDENCE');
  assert.ok(result.trueHiringProbability >= 85, `Expected >= 85% but got ${result.trueHiringProbability}%`);
  assert.equal(result.ghostRiskScore, 0);
  assert.equal(result.forensicSignals.length, 0);
});

test('ghost-job-detector: stale evergreen job with 4 reposts triggers PROBABLE_GHOST', () => {
  const staleJob = {
    company: 'Generic Corp',
    title: 'Software Engineer - Talent Community',
    postedDate: new Date(Date.now() - 110 * 24 * 60 * 60 * 1000), // 110 days ago
    repostCount: 4,
    salaryDisclosed: false,
    jdText: 'Join our talent pool for future opportunities across all offices worldwide.'
  };

  const result = analyzeJobLegitimacy(staleJob);

  assert.equal(result.legitimacyTier, 'PROBABLE_GHOST');
  assert.ok(result.trueHiringProbability < 30, `Expected < 30% but got ${result.trueHiringProbability}%`);
  assert.ok(result.ghostRiskScore >= 70);

  const signalCodes = result.forensicSignals.map(s => s.code);
  assert.ok(signalCodes.includes('STALE_REQUISITION_EXTREME'));
  assert.ok(signalCodes.includes('REPOST_CHURN_HIGH'));
  assert.ok(signalCodes.includes('EVERGREEN_TALENT_POOL'));
});

test('ghost-job-detector: flags WARN layoff companies and req-density imbalance', () => {
  const job = {
    company: 'Peloton', // Known WARN registry company
    title: 'Senior Frontend Developer',
    postedDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    repostCount: 1,
    companyHeadcount: 150,
    activeReqCount: 80, // 80 open reqs for 150 employees = ~53% ratio
    salaryDisclosed: false,
    jdText: 'Building fitness companion apps.'
  };

  const result = analyzeJobLegitimacy(job);

  assert.ok(result.legitimacyTier === 'ELEVATED_GHOST_RISK' || result.legitimacyTier === 'PROBABLE_GHOST');
  const signalCodes = result.forensicSignals.map(s => s.code);
  assert.ok(signalCodes.includes('COMPANY_RESTRUCTURING_WARN'));
  assert.ok(signalCodes.includes('DISPROPORTIONATE_REQ_DENSITY'));
});

