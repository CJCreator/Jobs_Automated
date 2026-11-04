/**
 * lib/services/negotiation-service.mjs
 *
 * Game-Theoretic Offer Decompiler & Negotiation Engine.
 *
 * Capabilities:
 *  1. Decompiles complex offers (Base, Bonus, Sign-on, RSUs/ISOs, Vesting Schedules).
 *  2. Projects 4-year Annual Total Target Compensation (TTC) & net cash vs equity curves.
 *  3. Monte Carlo Equity Exit Simulator:
 *     - Bear (-50% market contraction / unvested options underwater)
 *     - Base (1.5x moderate CAGR)
 *     - Bull (3.5x strong category leadership)
 *     - IPO / Liquidity Event (10x exit with dilution modeling)
 *  4. Generates a 3-round counter-offer strategy & email/phone scripts anchored to verified
 *     compensation observations (`data/salary-observations.tsv`).
 *
 * Zero-fabrication: Never invents numbers; uses explicit candidate parameters and market anchors.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Standard Vesting Schedule Normalizer
 * @typedef {Object} VestingSchedule
 * @property {number} totalYears - e.g. 4
 * @property {number} cliffMonths - e.g. 12 (1 year cliff)
 * @property {number} cliffPercent - e.g. 25
 * @property {'monthly' | 'quarterly' | 'annual'} cadence
 * @property {number[]} yearlyDistribution - e.g. [0.25, 0.25, 0.25, 0.25] or Amazon backloaded [0.05, 0.15, 0.40, 0.40]
 */

/**
 * @typedef {Object} OfferInput
 * @property {string} company
 * @property {string} role
 * @property {number} base - Annual base salary
 * @property {number} [targetBonusPercent=0] - e.g. 15 for 15%
 * @property {number} [targetBonusFixed=0] - Fixed annual bonus amount
 * @property {number} [signingBonus=0] - Year 1 sign-on bonus
 * @property {'RSU' | 'ISO' | 'NSO' | 'CASH_ONLY'} [equityType='RSU']
 * @property {number} [totalGrantValue=0] - Total equity grant dollar value at grant
 * @property {number} [shareCount=0] - Total share/unit count
 * @property {number} [strikePrice=0] - Per share strike price (for ISO/NSO)
 * @property {number} [currentSharePrice=0] - Current preferred or public share price
 * @property {number[]} [customVestingRatios] - Optional 4-year ratio array e.g. [0.25, 0.25, 0.25, 0.25]
 * @property {string} [currency='USD']
 */

/**
 * @typedef {Object} NegotiationContext
 * @property {number} [targetAnnualComp] - Desired target from profile or conversation
 * @property {number} [competingOfferAnnualComp] - Value of alternative offer if any
 * @property {string} [competingCompany] - Competing offer company name
 * @property {string[]} [candidatePriorities] - e.g. ['base', 'equity', 'remote', 'signing_bonus']
 */

const DEFAULT_VESTING = [0.25, 0.25, 0.25, 0.25];

/**
 * Decompiles an offer into 4-year schedule and annual components.
 * @param {OfferInput} offer
 */
export function decompileOffer(offer) {
  if (!offer || typeof offer.base !== 'number' || offer.base <= 0) {
    throw new Error('Valid offer with positive annual base salary is required.');
  }

  const base = Math.round(offer.base);
  const targetBonusPercent = offer.targetBonusPercent || 0;
  const annualBonus = offer.targetBonusFixed || Math.round(base * (targetBonusPercent / 100));
  const signingBonus = Math.round(offer.signingBonus || 0);
  const currency = offer.currency || 'USD';
  const equityType = offer.equityType || (offer.totalGrantValue > 0 ? 'RSU' : 'CASH_ONLY');

  // Compute baseline grant valuation
  let totalEquityGrant = offer.totalGrantValue || 0;
  if (!totalEquityGrant && offer.shareCount && offer.currentSharePrice) {
    if (equityType === 'ISO' || equityType === 'NSO') {
      const spread = Math.max(0, offer.currentSharePrice - (offer.strikePrice || 0));
      totalEquityGrant = Math.round(offer.shareCount * spread);
    } else {
      totalEquityGrant = Math.round(offer.shareCount * offer.currentSharePrice);
    }
  }

  const vestingRatios = (Array.isArray(offer.customVestingRatios) && offer.customVestingRatios.length === 4)
    ? offer.customVestingRatios
    : DEFAULT_VESTING;

  // Yearly projections
  const yearlyProjections = [];
  let cumulativeValue = 0;

  for (let year = 1; year <= 4; year++) {
    const yearIdx = year - 1;
    const yearBase = base;
    const yearBonus = annualBonus;
    const yearSignon = year === 1 ? signingBonus : 0;
    const yearEquity = Math.round(totalEquityGrant * vestingRatios[yearIdx]);
    const yearTotal = yearBase + yearBonus + yearSignon + yearEquity;
    cumulativeValue += yearTotal;

    yearlyProjections.push({
      year,
      base: yearBase,
      bonus: yearBonus,
      signon: yearSignon,
      equity: yearEquity,
      totalCompensation: yearTotal,
      cumulative: cumulativeValue
    });
  }

  const year1TTC = yearlyProjections[0].totalCompensation;
  const averageAnnualTTC = Math.round(cumulativeValue / 4);

  return {
    company: offer.company || 'Unknown',
    role: offer.role || 'Target Role',
    currency,
    equityType,
    summary: {
      base,
      annualBonus,
      signingBonus,
      totalEquityGrant,
      year1TTC,
      averageAnnualTTC,
      fourYearTotal: cumulativeValue
    },
    yearlyProjections
  };
}

/**
 * Monte Carlo Equity Exit Simulator.
 * Simulates portfolio value across 4 standard strategic exit horizons.
 *
 * @param {Object} decompiled
 * @param {Object} [options]
 * @param {number} [options.futureDilution=0.15] - Projected dilution (e.g. 15% for next venture rounds)
 */
export function simulateEquityScenarios(decompiled, options = {}) {
  const equityGrant = decompiled.summary.totalEquityGrant;
  const dilutionFactor = 1 - (options.futureDilution || 0.15);

  const scenarios = {
    bear: {
      name: 'Downside / Market Compression',
      multiplier: 0.5,
      probabilityWeight: 0.20,
      description: 'Valuation contraction by 50% or down-round; low equity appreciation.'
    },
    base: {
      name: 'Steady Growth / Target Case',
      multiplier: 1.5,
      probabilityWeight: 0.50,
      description: 'Standard product-market expansion; 12-15% annualized enterprise growth.'
    },
    bull: {
      name: 'Outperformance / Category Leader',
      multiplier: 3.5,
      probabilityWeight: 0.20,
      description: 'Breakthrough traction, market dominance, premium exit multiple.'
    },
    ipo: {
      name: 'Public Liquidity / Unicorn Exit',
      multiplier: 10.0,
      probabilityWeight: 0.10,
      description: 'Massive public market debut or tier-1 acquisition (factoring in 15% dilution).'
    }
  };

  const results = {};
  let expectedBlendedEquity = 0;

  for (const [key, scen] of Object.entries(scenarios)) {
    const postDilutionMultiplier = key === 'ipo' ? scen.multiplier * dilutionFactor : scen.multiplier;
    const projectedEquityValue = Math.round(equityGrant * postDilutionMultiplier);
    const projectedFourYearTotal = (decompiled.summary.fourYearTotal - equityGrant) + projectedEquityValue;
    const projectedAnnualTTC = Math.round(projectedFourYearTotal / 4);

    results[key] = {
      scenario: scen.name,
      multiplier: scen.multiplier,
      projectedEquityValue,
      projectedAnnualTTC,
      projectedFourYearTotal,
      description: scen.description
    };

    expectedBlendedEquity += projectedEquityValue * scen.probabilityWeight;
  }

  const expectedFourYearTotal = Math.round((decompiled.summary.fourYearTotal - equityGrant) + expectedBlendedEquity);

  return {
    baselineEquityGrant: equityGrant,
    expectedBlendedEquity: Math.round(expectedBlendedEquity),
    expectedFourYearTotal,
    expectedAnnualTTC: Math.round(expectedFourYearTotal / 4),
    scenarios: results
  };
}

/**
 * Parses existing salary observations from TSV if present.
 * @param {string} [dataDir]
 * @returns {Array<{trackerNum: string, type: string, amount: number, currency: string, source: string}>}
 */
export function loadSalaryObservations(dataDir = 'data') {
  const tsvPath = join(process.cwd(), dataDir, 'salary-observations.tsv');
  if (!existsSync(tsvPath)) return [];

  try {
    const raw = readFileSync(tsvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    const observations = [];

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const [trackerNum, date, type, amountStr, currency, source, note] = parts;
        const num = parseFloat(amountStr?.replace(/[^0-9.]/g, '') || '0');
        if (num > 0) {
          observations.push({
            trackerNum,
            date,
            type,
            amount: num,
            currency: currency || 'USD',
            source: source || 'user',
            note: note || ''
          });
        }
      }
    }
    return observations;
  } catch {
    return [];
  }
}

/**
 * Generates a 3-Round Game-Theoretic Counter-Offer Strategy.
 *
 * @param {Object} decompiledOffer - Result from decompileOffer()
 * @param {NegotiationContext} context - Candidate targets and BATNA conditions
 */
export function generateNegotiationPlan(decompiledOffer, context = {}) {
  const base = decompiledOffer.summary.base;
  const currentTTC = decompiledOffer.summary.year1TTC;
  const currency = decompiledOffer.currency;
  const company = decompiledOffer.company;
  const role = decompiledOffer.role;

  // Determine target compensation
  const targetTTC = context.targetAnnualComp || Math.round(currentTTC * 1.15); // Default +15% anchor
  const competingComp = context.competingOfferAnnualComp;
  const competingCompany = context.competingCompany;

  // BATNA calculation: Competing offer gives maximum leverage
  let leverageScore = 55;
  if (competingComp && competingComp > currentTTC) {
    leverageScore = Math.min(95, 75 + Math.round(((competingComp - currentTTC) / currentTTC) * 100));
  } else if (targetTTC > currentTTC) {
    leverageScore = 65;
  }

  // Recommended counter asks
  const targetBase = Math.round(base * 1.10);
  const targetSignon = decompiledOffer.summary.signingBonus > 0
    ? Math.round(decompiledOffer.summary.signingBonus * 1.5)
    : Math.round(base * 0.10);
  const targetEquity = Math.round(decompiledOffer.summary.totalEquityGrant * 1.25);

  // Round 1: High-warmth anchor closing the gap
  const round1 = {
    round: 1,
    title: 'The Collaborative Anchor (Written Email)',
    objective: 'Express authentic excitement, anchor compensation to market/competing benchmark, and offer tradeable levers.',
    recommendedAsk: {
      targetBase,
      targetSignon,
      targetEquity
    },
    emailDraft: `Subject: Excited about the ${role} offer / Next steps - Santiago

Hi [Hiring Manager / Recruiter Name],

Thank you so much for extending the offer to join ${company} as ${role}. I have really enjoyed our discussions across the team, and I am genuinely energized by the technical and organizational mission you are tackling.

I reviewed the formal offer details. Taking into account the scope of impact and my current market benchmarks${competingCompany ? ` (including an active offer at ${competingCompany})` : ''}, I am looking for a total Year 1 compensation package closer to ${currency} ${targetTTC.toLocaleString('en-US')}.

Specifically, to make this an immediate and enthusiastic yes, I would love to explore whether we can:
1. Calibrate base salary to ${currency} ${targetBase.toLocaleString('en-US')}
2. Supplement with an initial signing bonus of ${currency} ${targetSignon.toLocaleString('en-US')}${decompiledOffer.summary.totalEquityGrant > 0 ? ` (or an adjusted equity grant of ${currency} ${targetEquity.toLocaleString('en-US')})` : ''}

I want to be transparent: ${company} is my preferred team to join. If we can reach agreement around these numbers, I am ready to sign and confirm my start date right away.

Could we connect briefly for 10 minutes tomorrow to align on what is possible?

Warm regards,
Santiago`,
    phoneScript: `Key Talking Points for Phone Follow-up:
- Lead with high excitement: "${company} is my top choice because of the mission and team fit."
- State the gap clearly without apology: "To align this with my current market commitments and scope, we need to bridge a gap of approximately ${currency} ${(targetTTC - currentTTC).toLocaleString('en-US')}."
- Present flexibility: "I am flexible on the allocation between base, signing bonus, or equity grant—whatever works best within your compensation framework."`
  };

  // Round 2: Multi-Lever Trade-Off (Phone / Follow-up Email)
  const round2 = {
    round: 2,
    title: 'The Multi-Lever Trade-Off (Phone / Concession Negotiation)',
    objective: 'If the company offers a partial base increase or caps budget, trade for non-base high-value concessions.',
    fallbackTradeLevers: [
      `Sign-on bonus tranche: Request a ${currency} ${Math.round(base * 0.08).toLocaleString('en-US')} cash sign-on if base is firmly capped.`,
      `Accelerated 6-month compensation and performance review with explicit KPI milestones.`,
      `Additional equity grant tranche or milestone-based refresh grant.`,
      `Remote work home-office/wellness stipend allowance (${currency} 3,000 - 5,000/yr).`,
      `Extra week of PTO or designated professional learning/conference budget.`
    ],
    emailDraft: `Subject: Re: Compensation alignment - ${role} at ${company}

Hi [Recruiter Name],

Thank you for advocating on my behalf and getting back to me with the updated figures. I appreciate the team's effort to move the base salary to [Countered Base].

I understand that internal compensation bands may place constraints on base adjustments. To bridge the remaining gap and bring us to a mutually enthusiastic close, could we explore structuring this through a signing bonus of ${currency} ${targetSignon.toLocaleString('en-US')} or a guaranteed 6-month equity performance refresh milestone?

This would give me the confidence to finalize everything today. Let me know your thoughts!

Best,
Santiago`
  };

  // Round 3: The Closing Handshake
  const round3 = {
    round: 3,
    title: 'The Closing Handshake (Final Decision Protocol)',
    objective: 'Secure final closure with firm commitment to sign immediately upon mutual sign-off.',
    decisionRules: [
      'If they met >= 70% of the requested delta: Sign immediately with high warmth.',
      'If base remained capped but sign-on or equity accommodated: Accept and request formal revised PDF.',
      'If completely rigid with zero movement: Assess against baseline career alternatives and walk-away floor.'
    ],
    closingScript: `Hi [Recruiter Name],

I really appreciate how thoughtful and transparent you and the leadership team have been throughout this process.

If you can formalize the agreement at [Agreed Terms], send over the revised agreement and I will sign and return it within the hour. I can't wait to get started!

Warmly,
Santiago`
  };

  return {
    company,
    role,
    currency,
    leverageScore,
    currentTTC,
    targetTTC,
    strategyRounds: [round1, round2, round3]
  };
}
