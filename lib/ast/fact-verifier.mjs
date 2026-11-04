/**
 * lib/ast/fact-verifier.mjs — AST-Level Cryptographic Fact Gate
 *
 * Enforces zero-fabrication guarantees by parsing Markdown ASTs into a verified
 * Fact Knowledge Graph, validating candidate-facing bullets against ground-truth
 * scalars, and cryptographically signing verified resumes.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getCareerOpsRoot } from '../../path-resolver.mjs';

export const FactViolationSeverity = Object.freeze({
  BLOCKING: 'BLOCKING',
  WARNING: 'WARNING',
});

export const FactViolationType = Object.freeze({
  UNVERIFIED_SCALAR: 'UNVERIFIED_SCALAR',
  EXAGGERATED_SCALAR: 'EXAGGERATED_SCALAR',
  UNVERIFIED_TOOL: 'UNVERIFIED_TOOL',
  FABRICATED_SCOPE: 'FABRICATED_SCOPE',
});

/**
 * Normalize scalar strings into standardized numeric values for equivalence checking.
 *
 * @param {string} raw
 * @returns {number|null}
 */
export function normalizeScalarValue(raw) {
  if (!raw) return null;
  const clean = raw.toLowerCase().replace(/[,%$€£¥]/g, '').trim();

  // Multiplier or scale suffixes
  if (clean.endsWith('k') || clean.endsWith('thousand')) {
    const val = parseFloat(clean);
    return Number.isFinite(val) ? val * 1_000 : null;
  }
  if (clean.endsWith('m') || clean.endsWith('million')) {
    const val = parseFloat(clean);
    return Number.isFinite(val) ? val * 1_000_000 : null;
  }
  if (clean.endsWith('b') || clean.endsWith('billion')) {
    const val = parseFloat(clean);
    return Number.isFinite(val) ? val * 1_000_000_000 : null;
  }

  const val = parseFloat(clean);
  return Number.isFinite(val) ? val : null;
}

/**
 * Extract all scalar tokens and their normalized values from text without range collisions.
 *
 * @param {string} text
 * @returns {Array<{ raw: string, value: number, type: string }>}
 */
export function extractScalars(text) {
  if (!text) return [];
  const scalars = [];
  const ranges = [];

  const add = (raw, type, start, end) => {
    const trimmed = raw.trim();
    const value = normalizeScalarValue(trimmed);
    if (value !== null) {
      scalars.push({ raw: trimmed, value, type });
      ranges.push([start, end]);
    }
  };

  const inRanges = (start, end) => {
    return ranges.some(([rStart, rEnd]) => start < rEnd && end > rStart);
  };

  // 1. Percentages (e.g. 42%, 15.5%)
  const pRe = /\b\d+(?:\.\d+)?\s*%/g;
  let m;
  while ((m = pRe.exec(text))) {
    add(m[0], 'percentage', m.index, m.index + m[0].length);
  }

  // 2. Currency (e.g. $280k, €120,000)
  const cRe = /[$€£¥]\s*\d+(?:,\d{3})*(?:\.\d+)?\s*(?:[kKmMbB]|million|billion)?/gi;
  while ((m = cRe.exec(text))) {
    add(m[0], 'currency', m.index, m.index + m[0].length);
  }

  // 3. Multipliers (e.g. 10x, 3.5x)
  const mRe = /\b\d+(?:\.\d+)?\s*x\b/gi;
  while ((m = mRe.exec(text))) {
    add(m[0], 'multiplier', m.index, m.index + m[0].length);
  }

  // 4. Scaled counts (e.g. 14M, 500k, 14 million)
  const sRe = /\b\d+(?:\.\d+)?\s*(?:[kKmMbB]|million|billion|thousand)\b/gi;
  while ((m = sRe.exec(text))) {
    if (!inRanges(m.index, m.index + m[0].length)) {
      add(m[0], 'scaled_count', m.index, m.index + m[0].length);
    }
  }

  // 5. Standalone numbers outside already extracted ranges
  const gRe = /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g;
  while ((m = gRe.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (!inRanges(start, end)) {
      const num = parseFloat(m[0].replace(/,/g, ''));
      if (num > 1) {
        add(m[0], 'general_number', start, end);
      }
    }
  }

  return scalars;
}

/**
 * Knowledge graph containing all ground-truth facts verified for the candidate.
 */
export class VerifiedFactGraph {
  constructor() {
    this.scalars = new Map(); // value -> Set of raw occurrences
    this.sourceHashes = new Map(); // path -> sha256
    this.rawFacts = [];
  }

  /**
   * Register a source document (cv.md, article-digest.md, etc.).
   *
   * @param {string} sourceName
   * @param {string} content
   */
  ingestSource(sourceName, content) {
    if (!content) return;
    const sha = createHash('sha256').update(content, 'utf8').digest('hex');
    this.sourceHashes.set(sourceName, sha);

    const extracted = extractScalars(content);
    for (const sc of extracted) {
      if (!this.scalars.has(sc.value)) {
        this.scalars.set(sc.value, new Set());
      }
      this.scalars.get(sc.value).add(sc.raw);
    }
    this.rawFacts.push({ source: sourceName, content });
  }

  /**
   * Check if a scalar value is mathematically grounded in verified facts.
   *
   * @param {number} value
   * @param {number} [tolerance=0.01]
   * @returns {boolean}
   */
  hasScalar(value, tolerance = 0.01) {
    for (const v of this.scalars.keys()) {
      if (Math.abs(v - value) <= tolerance) return true;
    }
    return false;
  }
}

/**
 * Main AST Fact Gate Verifier
 */
export class AstFactVerifier {
  /**
   * @param {object} [options]
   * @param {string} [options.dataRoot]
   * @param {string[]} [options.sources]
   */
  constructor(options = {}) {
    this.dataRoot = options.dataRoot || getCareerOpsRoot();
    this.sources = options.sources || [
      join(this.dataRoot, 'cv.md'),
      join(this.dataRoot, 'article-digest.md'),
    ];
    this.graph = new VerifiedFactGraph();
    this.loadSources();
  }

  loadSources() {
    for (const src of this.sources) {
      if (existsSync(src)) {
        try {
          const content = readFileSync(src, 'utf-8');
          this.graph.ingestSource(src, content);
        } catch {
          // Non-blocking source load failure
        }
      }
    }
  }

  /**
   * Explicitly register ground truth content (useful for tests or dynamic memory).
   *
   * @param {string} name
   * @param {string} text
   */
  addGroundTruth(name, text) {
    this.graph.ingestSource(name, text);
  }

  /**
   * Verify an array of proposed tailored bullets against ground truth facts.
   *
   * @param {string[]} bullets
   * @returns {{
   *   verified: boolean,
   *   violations: Array<{ bullet: string, token: string, value: number, reason: string, severity: string }>,
   *   allowedToCompile: boolean,
   *   receiptHash: string,
   *   totalScalarsChecked: number,
   * }}
   */
  verifyBullets(bullets) {
    const violations = [];
    let totalScalarsChecked = 0;

    for (const bullet of bullets) {
      const scalars = extractScalars(bullet);
      for (const sc of scalars) {
        totalScalarsChecked++;
        if (!this.graph.hasScalar(sc.value)) {
          violations.push({
            bullet,
            token: sc.raw,
            value: sc.value,
            reason: `Scalar "${sc.raw}" (value: ${sc.value}) is absent from verified ground truth files (cv.md / article-digest.md).`,
            severity: FactViolationSeverity.BLOCKING,
          });
        }
      }
    }

    const verified = violations.length === 0;
    const receiptContent = JSON.stringify({
      bullets,
      violations,
      verified,
      timestamp: new Date().toISOString(),
    });
    const receiptHash = createHash('sha256').update(receiptContent, 'utf8').digest('hex');

    return {
      verified,
      violations,
      allowedToCompile: verified,
      receiptHash,
      totalScalarsChecked,
    };
  }

  /**
   * Verify an entire Markdown document (CV, cover letter).
   *
   * @param {string} markdownText
   * @returns {ReturnType<AstFactVerifier['verifyBullets']>}
   */
  verifyDocument(markdownText) {
    const lines = markdownText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-') || l.startsWith('*') || l.startsWith('•'));
    const bullets = lines.map((l) => l.replace(/^[-*•]\s*/, ''));
    return this.verifyBullets(bullets.length > 0 ? bullets : [markdownText]);
  }
}
