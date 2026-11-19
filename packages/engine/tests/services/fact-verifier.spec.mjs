import test from 'node:test';
import assert from 'node:assert/strict';
import { AstFactVerifier, extractScalars, normalizeScalarValue } from '../../lib/ast/fact-verifier.mjs';

test('FactVerifier: scalar extraction and normalization', () => {
  assert.equal(normalizeScalarValue('42%'), 42);
  assert.equal(normalizeScalarValue('$280k'), 280000);
  assert.equal(normalizeScalarValue('14M'), 14000000);
  assert.equal(normalizeScalarValue('10x'), 10);

  const text = 'Architected platform handling 14M evaluations/mo, reducing latency by 42% and saving $280k.';
  const scalars = extractScalars(text);
  assert.equal(scalars.length, 3);
  assert(scalars.some((s) => s.value === 14000000));
  assert(scalars.some((s) => s.value === 42));
  assert(scalars.some((s) => s.value === 280000));
});

test('FactVerifier: verifies legitimate rephrasings and blocks ungrounded hallucinations', () => {
  const verifier = new AstFactVerifier({ sources: [] });

  // Ingest candidate ground truth
  verifier.addGroundTruth(
    'cv.md',
    `
    ### Experience
    **Lead AI Architect** — NextGen Platforms (2023 - Present)
    - Architected multi-agent orchestration platform handling 14M evaluations/mo, reducing inference latency by 42%.
    - Optimized model deployment reducing cloud compute spend by $280k annually.
    - Led team of 5 distributed systems engineers across 3 regions.
    `
  );

  // 1. Legitimate rephrased bullets (allowed)
  const validBullets = [
    'Built multi-agent platform scaling to 14 million evaluations/mo with 42% lower tail latency.',
    'Reduced infrastructure cloud spend by $280,000 through quantization techniques.',
    'Mentored 5 engineers across distributed teams.',
  ];

  const validResult = verifier.verifyBullets(validBullets);
  assert.equal(validResult.verified, true);
  assert.equal(validResult.allowedToCompile, true);
  assert.equal(validResult.violations.length, 0);
  assert.ok(validResult.receiptHash);

  // 2. Hallucinated / Exaggerated bullets (blocked)
  const invalidBullets = [
    'Scaled multi-agent platform to 50M evaluations/mo with 85% latency reduction.', // 50M and 85% fabricated
    'Cut infrastructure costs by $750k.', // $750k fabricated
  ];

  const invalidResult = verifier.verifyBullets(invalidBullets);
  assert.equal(invalidResult.verified, false);
  assert.equal(invalidResult.allowedToCompile, false);
  assert.equal(invalidResult.violations.length, 3);

  const tokens = invalidResult.violations.map((v) => v.token);
  assert(tokens.includes('50M'));
  assert(tokens.includes('85%'));
  assert(tokens.includes('$750k'));
});

