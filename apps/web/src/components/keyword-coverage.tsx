"use client";

import type { Coverage } from "@/lib/client/types";
import { en } from "@/i18n/en";

const t = en.coverage;

/** Keyword coverage, for information only. There is no control that adds a keyword. */
export function KeywordCoverage({ coverage }: { coverage: Coverage }) {
  if (coverage.after.total === 0) return null;
  return (
    <section aria-labelledby="coverage-title" className="space-y-2 rounded-xl border border-line bg-surface p-4" data-testid="keyword-coverage">
      <h2 id="coverage-title" className="font-heading text-xl font-semibold">
        {t.title}
      </h2>
      <p data-testid="coverage-line">
        {t.line(coverage.before.covered, coverage.before.total, coverage.after.covered, coverage.after.total)}
      </p>
      {coverage.missing.length > 0 ? (
        <details>
          <summary className="min-h-8 cursor-pointer font-medium">{t.missingToggle(coverage.missingTotal)}</summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {coverage.missing.map((k) => (
              <li key={k} className="rounded-md border border-line px-2 py-1 text-sm">
                {k}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-sm text-muted">{t.note}</p>
    </section>
  );
}
