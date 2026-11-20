/**
 * lib/scanners/ghost-job-detector.mjs
 *
 * Ghost Job & Legitimacy Forensics Engine.
 *
 * Evaluates job listings against 6 forensic signals to compute:
 *  - trueHiringProbability (0 - 100%)
 *  - ghostRiskScore (0 - 100%)
 *  - legitimacyTier: HIGH_CONFIDENCE | MODERATE_CONFIDENCE | ELEVATED_GHOST_RISK | PROBABLE_GHOST
 *  - forensicEvidence: Array of triggered signals with exact severity & reasons.
 *
 * Grounded in local-first data: Analyzes dates, repost counts from scan-history,
 * JD semantics, WARN layoff alerts, and ATS churn ratios.
 */

// Known companies with recent public WARN notices or hiring freezes
const WARN_LAYOFF_REGISTRY = new Set([
  'tesla', 'meta', 'amazon', 'google', 'microsoft', 'intel', 'cisco',
  'dell', 'nike', 'peloton', 'unity', 'wayfair', 'chegg', 'paypal'
]);

// Suspicious phrases indicative of evergreen resume harvesting or talent pools
const EVERGREEN_PHRASES = [
  /talent community/i,
  /talent pool/i,
  /future opportunities/i,
  /general application/i,
  /expression of interest/i,
  /pipeline opening/i,
  /evergreen/i,
  /continuous recruitment/i,
  /proactive recruitment/i
];

/**
 * @typedef {Object} ForensicJobInput
 * @property {string} [id] - Unique req ID or URL
 * @property {string} company - Company name
 * @property {string} title - Job title
 * @property {string|Date} [postedDate] - When the job was first posted
 * @property {number} [repostCount=0] - Number of times detected as reposted
 * @property {number} [companyHeadcount] - Estimated company size (e.g. 150)
 * @property {number} [activeReqCount] - Total active requisitions for this company
 * @property {boolean} [salaryDisclosed=false] - Whether comp range is provided
 * @property {boolean} [hasHiringManagerOrTeam=false] - Explicit team/manager noted
 * @property {string} [jdText=''] - Full text of the job description
 * @property {boolean} [isWarnFlagged=false] - Explicit layoff / WARN flag
 */

/**
 * @typedef {Object} ForensicSignal
 * @property {string} code - e.g. 'REPOST_FREQUENCY_HIGH'
 * @property {'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'} severity
 * @property {number} riskContribution - Points added to ghost risk
 * @property {string} message - Human-readable finding
 */

/**
 * Calculates days between a date and now.
 * @param {string|Date} date
 * @returns {number}
 */
function getDaysSince(date) {
  if (!date) return 0;
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return 0;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Analyzes a job posting for ghost job indicators and legitimacy.
 * @param {ForensicJobInput} input
 */
export function analyzeJobLegitimacy(input) {
  if (!input || !input.company) {
    throw new Error('Company name is required for legitimacy analysis.');
  }

  const company = input.company.trim();
  const normalizedCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const title = input.title || 'Role';
  const jdText = input.jdText || '';
  const repostCount = Math.max(0, input.repostCount || 0);
  const daysPosted = getDaysSince(input.postedDate);

  let ghostRiskScore = 0;
  const signals = [];

  // Signal 1: Requisition Age
  if (daysPosted > 90) {
    const risk = 30;
    ghostRiskScore += risk;
    signals.push({
      code: 'STALE_REQUISITION_EXTREME',
      severity: 'HIGH',
      riskContribution: risk,
      message: `Requisition has been open for ${daysPosted} days (>90d threshold). High probability of abandoned or inactive req.`
    });
  } else if (daysPosted > 60) {
    const risk = 15;
    ghostRiskScore += risk;
    signals.push({
      code: 'STALE_REQUISITION_MODERATE',
      severity: 'MEDIUM',
      riskContribution: risk,
      message: `Requisition has been open for ${daysPosted} days (>60d threshold). Sluggish fill rate.`
    });
  }

  // Signal 2: Repost Churn
  if (repostCount >= 3) {
    const risk = 35;
    ghostRiskScore += risk;
    signals.push({
      code: 'REPOST_CHURN_HIGH',
      severity: 'CRITICAL',
      riskContribution: risk,
      message: `Role has been reposted ${repostCount} times in the last 90 days. Strong indicator of continuous resume collection without hiring intention.`
    });
  } else if (repostCount >= 1) {
    const risk = 15;
    ghostRiskScore += risk;
    signals.push({
      code: 'REPOST_CHURN_MILD',
      severity: 'LOW',
      riskContribution: risk,
      message: `Role was reposted at least once (${repostCount} reposts observed).`
    });
  }

  // Signal 3: Evergreen / Talent Pool Language
  for (const pattern of EVERGREEN_PHRASES) {
    if (pattern.test(title) || pattern.test(jdText)) {
      const risk = 40;
      ghostRiskScore += risk;
      signals.push({
        code: 'EVERGREEN_TALENT_POOL',
        severity: 'CRITICAL',
        riskContribution: risk,
        message: `Job description or title contains talent pool/evergreen terminology ('${pattern.source}'). This is not an active immediate headcount opening.`
      });
      break; // Only trigger once
    }
  }

  // Signal 4: WARN Layoff Alerts or Recent Downsizing
  const isWarnKnown = input.isWarnFlagged || WARN_LAYOFF_REGISTRY.has(normalizedCompany);
  if (isWarnKnown) {
    const risk = 25;
    ghostRiskScore += risk;
    signals.push({
      code: 'COMPANY_RESTRUCTURING_WARN',
      severity: 'HIGH',
      riskContribution: risk,
      message: `${company} has recorded mass layoffs or active corporate restructuring in recent public WARN disclosures. Requisitions carry freeze risk.`
    });
  }

  // Signal 5: Requisition-to-Headcount Imbalance (Ghost Churn / Harvesting)
  if (input.companyHeadcount && input.activeReqCount) {
    const ratio = input.activeReqCount / input.companyHeadcount;
    if (input.companyHeadcount < 300 && input.activeReqCount > 60) {
      const risk = 25;
      ghostRiskScore += risk;
      signals.push({
        code: 'DISPROPORTIONATE_REQ_DENSITY',
        severity: 'HIGH',
        riskContribution: risk,
        message: `Company has ${input.activeReqCount} open roles for only ${input.companyHeadcount} total employees (${Math.round(ratio * 100)}% ratio). Indicates phantom hiring or synthetic pipeline building.`
      });
    }
  }

  // Signal 6: Lack of Compensation Transparency in Detailed Roles
  if (!input.salaryDisclosed && jdText.length > 500) {
    const risk = 10;
    ghostRiskScore += risk;
    signals.push({
      code: 'MISSING_COMP_TRANSPARENCY',
      severity: 'LOW',
      riskContribution: risk,
      message: 'No clear salary or compensation band disclosed. Correlates with lower placement velocity.'
    });
  }

  // Signal 7: Positive signals (Mitigations)
  if (input.hasHiringManagerOrTeam) {
    ghostRiskScore = Math.max(0, ghostRiskScore - 15);
  }
  if (daysPosted <= 14 && repostCount === 0) {
    ghostRiskScore = Math.max(0, ghostRiskScore - 10);
  }

  // Cap score between 0 and 100
  const finalRisk = Math.min(100, Math.max(0, ghostRiskScore));
  const trueHiringProbability = Math.min(98, Math.max(5, 100 - finalRisk));

  // Determine tier
  let legitimacyTier = 'HIGH_CONFIDENCE';
  let tierLabel = 'High Legitimacy / Active Opening';

  if (trueHiringProbability < 30) {
    legitimacyTier = 'PROBABLE_GHOST';
    tierLabel = 'Probable Ghost Job / Evergreen Pipeline';
  } else if (trueHiringProbability < 50) {
    legitimacyTier = 'ELEVATED_GHOST_RISK';
    tierLabel = 'Elevated Ghost Risk (Stale or Churning)';
  } else if (trueHiringProbability < 75) {
    legitimacyTier = 'MODERATE_CONFIDENCE';
    tierLabel = 'Moderate Confidence / Standard Velocity';
  }

  return {
    company,
    title,
    trueHiringProbability,
    ghostRiskScore: finalRisk,
    legitimacyTier,
    tierLabel,
    forensicSignals: signals,
    metrics: {
      daysPosted,
      repostCount,
      isWarnFlagged: isWarnKnown,
      hasHiringManager: !!input.hasHiringManagerOrTeam,
      salaryDisclosed: !!input.salaryDisclosed
    }
  };
}

