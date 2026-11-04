import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decompileOffer,
  simulateEquityScenarios,
  generateNegotiationPlan
} from '../../lib/services/negotiation-service.mjs';

test('negotiation-service: decompileOffer accurately calculates 4-year schedule and TTC', () => {
  const offer = {
    company: 'Stripe',
    role: 'Staff AI Engineer',
    base: 220000,
    targetBonusPercent: 15,
    signingBonus: 30000,
    equityType: 'RSU',
    totalGrantValue: 400000,
    currency: 'USD'
  };

  const decompiled = decompileOffer(offer);

  assert.equal(decompiled.company, 'Stripe');
  assert.equal(decompiled.summary.base, 220000);
  assert.equal(decompiled.summary.annualBonus, 33000); // 15% of 220k
  assert.equal(decompiled.summary.signingBonus, 30000);
  assert.equal(decompiled.summary.totalEquityGrant, 400000);

  // Year 1 TTC = 220,000 + 33,000 + 30,000 + 100,000 (25% equity) = 383,000
  assert.equal(decompiled.summary.year1TTC, 383000);

  // Year 2 TTC = 220,000 + 33,000 + 0 + 100,000 = 353,000
  assert.equal(decompiled.yearlyProjections[1].totalCompensation, 353000);

  // Total 4-year cumulative: (220k*4) + (33k*4) + 30k + 400k = 880k + 132k + 30k + 400k = 1,442,000
  assert.equal(decompiled.summary.fourYearTotal, 1442000);
  assert.equal(decompiled.yearlyProjections.length, 4);
});

test('negotiation-service: simulateEquityScenarios models Bear, Base, Bull, IPO with dilution', () => {
  const offer = {
    company: 'Anthropic',
    role: 'Principal Research Engineer',
    base: 250000,
    equityType: 'RSU',
    totalGrantValue: 600000,
    currency: 'USD'
  };

  const decompiled = decompileOffer(offer);
  const simulation = simulateEquityScenarios(decompiled, { futureDilution: 0.15 });

  assert.equal(simulation.baselineEquityGrant, 600000);

  // Bear: 0.5x
  assert.equal(simulation.scenarios.bear.projectedEquityValue, 300000);

  // Base: 1.5x
  assert.equal(simulation.scenarios.base.projectedEquityValue, 900000);

  // Bull: 3.5x
  assert.equal(simulation.scenarios.bull.projectedEquityValue, 2100000);

  // IPO: 10x with 15% dilution => 10 * 0.85 = 8.5x => 600,000 * 8.5 = 5,100,000
  assert.equal(simulation.scenarios.ipo.projectedEquityValue, 5100000);

  // Expected blended equity must be > baseline
  assert.ok(simulation.expectedBlendedEquity > 600000);
});

test('negotiation-service: generateNegotiationPlan produces 3-round counter strategy with leverage', () => {
  const offer = {
    company: 'OpenAI',
    role: 'Research Scientist',
    base: 280000,
    signingBonus: 50000,
    totalGrantValue: 800000,
    currency: 'USD'
  };

  const decompiled = decompileOffer(offer);
  const plan = generateNegotiationPlan(decompiled, {
    targetAnnualComp: 580000,
    competingOfferAnnualComp: 600000,
    competingCompany: 'Google DeepMind'
  });

  assert.equal(plan.company, 'OpenAI');
  assert.ok(plan.leverageScore >= 75, 'Leverage score should reflect competing offer leverage');
  assert.equal(plan.strategyRounds.length, 3);

  // Check Round 1 email mentions competing offer and target
  const r1 = plan.strategyRounds[0];
  assert.equal(r1.round, 1);
  assert.ok(r1.emailDraft.includes('Google DeepMind'));
  assert.ok(r1.emailDraft.includes('580,000'));

  // Check Round 2 trade levers
  const r2 = plan.strategyRounds[1];
  assert.equal(r2.round, 2);
  assert.ok(r2.fallbackTradeLevers.length >= 3);

  // Check Round 3 closing protocol
  const r3 = plan.strategyRounds[2];
  assert.equal(r3.round, 3);
  assert.ok(r3.closingScript.length > 0);
});

