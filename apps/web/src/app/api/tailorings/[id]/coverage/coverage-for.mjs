// Keyword coverage of the resume against the job description (ADR 0016).
// Pure and read-only: it never changes a suggestion or its check, and nothing
// here is stored. Coverage is shown for information; the fact gate (ADR 0005)
// is what decides an export.
import { buildResume, resumeText } from "../../../../../lib/facts.mjs";
import { MAX_KEYWORDS, MAX_TEXT_CHARS, analyzeCoverage, keywordsFromJdText } from "../../../../../lib/keyword-match.mjs";

export const MAX_MISSING = 30;

/**
 * @returns {{ before: {covered:number,total:number}, after: {covered:number,total:number}, missing: string[] }}
 * @throws {RangeError} when the resume text is over the port's cap.
 */
export function coverageFor(facts, suggestions, jdText) {
  // keywordsFromJdText is not capped by the port, so bound its input here.
  const jd = String(jdText ?? "").slice(0, MAX_TEXT_CHARS);
  const keywords = keywordsFromJdText(jd).slice(0, MAX_KEYWORDS);
  const before = analyzeCoverage(keywords, resumeText(buildResume(facts, []).resume));
  const after = analyzeCoverage(keywords, resumeText(buildResume(facts, suggestions).resume));
  return {
    before: { covered: before.presentCount, total: before.total },
    after: { covered: after.presentCount, total: after.total },
    missing: after.missing.slice(0, MAX_MISSING),
  };
}
