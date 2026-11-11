"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, ExternalLink, ChevronDown, Copy, Sparkles, BookOpen, Send, CheckCircle2, Columns2, FileCode, TrendingUp } from "lucide-react";
import type { Application } from "@/lib/career-ops";
import { Badge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { useToast } from "@/components/ui/toast";
import { scoreTone, legitimacyTone, parseReport } from "@/lib/format";
import {
  APPLY_LINE,
  applyCtaQuiet,
  applyLineLabel,
  cleanHeading,
  isLeadSection,
  isVerdictHeading,
  sectionPreview,
  splitSections,
  verdictReason,
} from "@/lib/report-sections.mjs";
import { StatusSelect } from "@/components/status-select";
import { BackLink } from "@/components/back-link";
import { CompanyLogo } from "@/components/company-logo";
import { ScoreMethodology } from "@/components/score-methodology";
import { ScoreLevers } from "@/components/score-levers";
import { PrepPack } from "@/components/prep-pack";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { CoverDraftButton } from "@/components/cover-draft-button";
import { ApplyButton } from "@/components/apply-button";
import { MarkPdfReadyButton } from "@/components/mark-pdf-ready-button";
import { DeleteFromTracker } from "@/components/delete-from-tracker";
import { ReportMarkdown } from "@/components/report-markdown";
import { KeywordCoverage } from "@/components/keyword-coverage";
import { CompanyEvidence } from "@/components/company-evidence";
import { companyPresentation } from "@/lib/company-presentation.mjs";
import { PageFrame } from "@/components/page-frame";
import { cn } from "@/lib/cn";

// Progressive disclosure of the report. Current oferta.md writes letter F as
// Interview Plan (STAR+R), not a verdict — never promote by letter (#3416).
// The score + 4.0 apply line + legitimacy live in one Peak-End callout (#4203).
// Block B (CV Match) stays open; everything else, including Role Summary and
// STAR+R, is collapsed (#4205). Machine artifacts stay in the Technical tier.

function isMachine(heading: string): boolean {
  return /machine summary|submitted|submit[-\s]?log/i.test(heading);
}

function httpUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

export function ReportView({
  id,
  app,
  report,
  canDelete = false,
  pdfFileReady = false,
  trackerMarkedPdf = false,
  coverReady = false,
  backHref = "/pipeline",
  applyHref,
  reportNum = null,
}: {
  id: string;
  app: Application | null;
  report: string | null;
  /** kept in the props contract (the page passes it) but no longer surfaced —
   *  the raw .md filename is a dev artifact, not header content. */
  file?: string | null;
  canDelete?: boolean;
  /** A tailored CV file is on disk (index or a matching cv-* name). Not the tracker mark. */
  pdfFileReady?: boolean;
  /** The tracker cell has a PDF mark. That mark can exist with no file. */
  trackerMarkedPdf?: boolean;
  /** A tailored cover letter for THIS application exists in output/ (resolved by
   *  the page, see resolveTailoredCover). The page drafts letters through the
   *  cover run but does not render them, so this link only finds CLI PDFs. */
  coverReady?: boolean;
  backHref?: string;
  applyHref?: string;
  reportNum?: number | null;
}) {
  const meta = report ? parseReport(report) : null;
  const field = (label: string) => meta?.fields.find((f) => f.label === label)?.value;
  const score = app?.score || field("Score");
  const date = app?.date || field("Date");
  const archetype = field("Archetype");
  const url = field("URL");
  const decision = field("Decision");
  const line = applyLineLabel(score ?? "", meta?.legitimacy);
  const recommended = line === "Recommended";
  const quietApply = applyCtaQuiet({ score, legitimacy: meta?.legitimacy });
  const applyUrl = httpUrl(url);
  const pdfReady = pdfFileReady;
  const pdfMarkedWithoutFile = trackerMarkedPdf && !pdfFileReady;
  const company = app ? companyPresentation(app) : null;
  const companyName = company?.label ?? app?.company ?? meta?.title ?? id;
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"report" | "studio">("report");
  const [studioTab, setStudioTab] = useState<"cv" | "cover" | "star">("cv");

  const copyOutreach = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Outreach message copied",
      description: "Ready to paste into email or LinkedIn message.",
      variant: "success",
    });
  }, [toast]);

  return (
    <PageFrame className="max-w-3xl xl:max-w-5xl 2xl:max-w-[1600px]">
      <BackLink
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-text"
      >
        <ArrowLeft className="size-4" /> Pipeline
      </BackLink>

      <header className="mt-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-faint">#{id}</p>
        <div className="mt-2 flex items-center gap-3">
          <CompanyLogo name={company?.logoName ?? meta?.title ?? `Report #${id}`} size={40} />
          <h1 className="font-display text-3xl tracking-tight text-landing">
            {company?.label ?? meta?.title ?? `Report #${id}`}
          </h1>
        </div>
        {app?.role && <p className="mt-1 text-muted">{app.role}</p>}
        {meta?.fields.find((field) => field.label === "Evaluation scope") && (
          <p className="mt-2 text-xs text-muted">{meta.fields.find((field) => field.label === "Evaluation scope")?.value}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {app && <StatusSelect n={id} current={app.status} />}
          <GeneratePdfButton n={id} company={app?.company || meta?.title || id} pdfReady={pdfReady} />
          {app && report && <CoverDraftButton n={id} company={companyName} />}
          {applyHref && (
            <Link
              href={applyHref}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]"
            >
              Apply checklist
            </Link>
          )}
          <MarkPdfReadyButton reportNum={reportNum} ready={pdfFileReady || trackerMarkedPdf} />
          {pdfMarkedWithoutFile && (
            <p className="basis-full text-sm text-muted">
              The tracker marks a tailored CV, but there is no file in output/. Choose Generate tailored CV.
            </p>
          )}
          {coverReady && (
            <a
              href={`/api/cover-pdf?application=${encodeURIComponent(id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-500/15 dark:text-emerald-400 max-sm:min-h-[44px]"
            >
              <FileText className="size-3.5" /> View cover
            </a>
          )}
          {app?.status?.toLowerCase().includes("offer") && (
            <Link
              href={`/negotiation?company=${encodeURIComponent(companyName)}&role=${encodeURIComponent(app?.role || "")}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400 max-sm:min-h-[44px]"
            >
              <TrendingUp className="size-3.5" /> Negotiate Offer
            </Link>
          )}

          {/* Mode Toggle: Full Report vs Studio Workspace */}
          {report && (
            <div className="inline-flex items-center rounded-lg border border-border bg-surface/70 p-0.5 sm:ml-auto">
              <button
                type="button"
                onClick={() => setViewMode("report")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === "report"
                    ? "bg-brand text-brand-foreground shadow-xs"
                    : "text-muted hover:text-foreground",
                )}
              >
                <BookOpen className="size-3.5" /> Full Report
              </button>
              <button
                type="button"
                onClick={() => setViewMode("studio")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === "studio"
                    ? "bg-brand text-brand-foreground shadow-xs"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Columns2 className="size-3.5" /> Studio Workspace
              </button>
            </div>
          )}
        </div>

        {app && canDelete && (
          <div className="mt-3">
            <DeleteFromTracker n={id} />
          </div>
        )}

        {(archetype || date || applyUrl) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {archetype && <span className="max-w-full truncate">{archetype}</span>}
            {date && <span className="tabular-nums text-faint">{date}</span>}
            {applyUrl && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1 text-brand-text hover:underline max-sm:min-h-[44px]"
              >
                posting <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )}
      </header>

      {report ? (
        viewMode === "studio" ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-12">
            {/* Left Column: Evaluation Breakdown (5 cols) */}
            <div className="space-y-6 lg:col-span-5">
              <div className="rounded-2xl border border-border bg-surface/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-wider text-faint">Match Score</span>
                  {line && <Badge tone={recommended ? "good" : "warn"}>{line}</Badge>}
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <ScoreGauge score={score} size="lg" />
                  <div>
                    <h3 className="text-base font-bold text-foreground">{companyName}</h3>
                    <p className="text-xs text-muted">{app?.role || archetype || "Evaluated Role"}</p>
                    <p className="mt-1 text-xs text-faint">Apply threshold: {APPLY_LINE.toFixed(1)}/5.0</p>
                  </div>
                </div>
                <div className="mt-5 border-t border-border/60 pt-4">
                  <ApplyButton
                    n={id}
                    url={applyUrl}
                    company={companyName}
                    pdfReady={pdfReady}
                    quiet={quietApply}
                  />
                </div>
              </div>

              {/* CV Match Section */}
              {(() => {
                const { sections } = splitSections(meta?.body ?? report);
                const cvSection = sections.find((s) => s.letter === "B" || /match|alignment/i.test(s.heading));
                if (!cvSection) return null;
                return (
                  <div className="rounded-2xl border border-border bg-surface/40 p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-2">{cleanHeading(cvSection.heading)}</h3>
                    <div className="report-prose text-xs text-muted">
                      <ReportMarkdown>{cvSection.content}</ReportMarkdown>
                    </div>
                  </div>
                );
              })()}

              <KeywordCoverage reportId={id} />
              {app?.company && <CompanyEvidence company={app.company} />}
            </div>

            {/* Right Column: Tailored Application Suite & Studio (7 cols) */}
            <div className="space-y-5 lg:col-span-7">
              {/* Studio Tabs */}
              <div className="flex rounded-xl border border-border bg-surface/70 p-1">
                <button
                  type="button"
                  onClick={() => setStudioTab("cv")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
                    studioTab === "cv" ? "bg-brand text-brand-foreground shadow-xs" : "text-muted hover:text-foreground",
                  )}
                >
                  Tailored CV
                </button>
                <button
                  type="button"
                  onClick={() => setStudioTab("cover")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
                    studioTab === "cover" ? "bg-brand text-brand-foreground shadow-xs" : "text-muted hover:text-foreground",
                  )}
                >
                  Cover & Outreach
                </button>
                <button
                  type="button"
                  onClick={() => setStudioTab("star")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
                    studioTab === "star" ? "bg-brand text-brand-foreground shadow-xs" : "text-muted hover:text-foreground",
                  )}
                >
                  STAR+R Interview Pack
                </button>
              </div>

              {/* Tab 1: Tailored CV */}
              {studioTab === "cv" && (
                <div className="rounded-2xl border border-border bg-surface/50 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground">Tailored CV for {companyName}</h3>
                      <p className="text-xs text-muted mt-0.5">Customized proof points matching this role's keywords.</p>
                    </div>
                    <Badge tone={pdfReady ? "good" : "muted"}>
                      {pdfReady ? "✓ PDF Ready" : "Draft Pending"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <GeneratePdfButton n={id} company={companyName} pdfReady={pdfReady} />
                    {pdfReady && (
                      <a
                        href={`/api/cv-pdf?application=${encodeURIComponent(id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-hover hover:border-brand/40"
                      >
                        <FileText className="size-3.5" /> View PDF
                      </a>
                    )}
                    <Link
                      href={`/pipeline/${id}/cv`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-brand-text hover:bg-surface-hover"
                    >
                      <Sparkles className="size-3.5" /> Open in CV Studio
                    </Link>
                  </div>

                  <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted leading-relaxed">
                    <p className="font-semibold text-foreground mb-1">Tailoring Strategy for this Opening:</p>
                    <p>When you click <strong>Generate tailored CV</strong>, career-ops reformulates your experience bullets to lead with metrics relevant to {companyName}, enforcing zero-fabrication ground-truth checks against your master <code>cv.md</code>.</p>
                  </div>
                </div>
              )}

              {/* Tab 2: Cover & Outreach */}
              {studioTab === "cover" && (
                <div className="rounded-2xl border border-border bg-surface/50 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground">Outreach & Cover Letter</h3>
                      <p className="text-xs text-muted mt-0.5">Direct hiring manager outreach and tailored narrative.</p>
                    </div>
                    <CoverDraftButton n={id} company={companyName} />
                  </div>

                  {coverReady && (
                    <div className="flex items-center gap-3">
                      <a
                        href={`/api/cover-pdf?application=${encodeURIComponent(id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-400"
                      >
                        <FileText className="size-3.5" /> View Cover PDF
                      </a>
                    </div>
                  )}

                  {/* Quick Copy Recruiter Message */}
                  <div className="rounded-xl border border-border bg-surface/70 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">1-Click Recruiter Outreach Note</span>
                      <button
                        type="button"
                        onClick={() => copyOutreach(
                          `Hi, I came across the ${app?.role || "open role"} opening at ${companyName} and wanted to reach out directly. Given my background in engineering leadership, systems architecture, and scaling high-performing teams, I believe my experience aligns well with what you are building. I've submitted my application through your careers portal and would welcome a brief conversation to explore mutual fit. Best regards.`,
                        )}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover"
                      >
                        <Copy className="size-3" /> Copy Note
                      </button>
                    </div>
                    <p className="text-xs font-mono text-muted leading-relaxed whitespace-pre-wrap bg-surface-hover/50 p-3 rounded-lg border border-border/50">
{`Hi, I came across the ${app?.role || "open role"} opening at ${companyName} and wanted to reach out directly. Given my background in engineering leadership, systems architecture, and scaling high-performing teams, I believe my experience aligns well with what you are building. I've submitted my application through your careers portal and would welcome a brief conversation to explore mutual fit. Best regards.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 3: STAR+R Interview Pack */}
              {studioTab === "star" && (
                <div className="rounded-2xl border border-border bg-surface/50 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground">Interview Prep & STAR+R Stories</h3>
                      <p className="text-xs text-muted mt-0.5">Behavioral stories mapped to this role's specific challenges.</p>
                    </div>
                  </div>

                  <PrepPack report={report} company={companyName} />

                  {/* Extract Block F Interview Section */}
                  {(() => {
                    const { sections } = splitSections(meta?.body ?? report);
                    const starSection = sections.find((s) => s.letter === "F" || /interview|star/i.test(s.heading));
                    if (!starSection) {
                      return (
                        <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted text-center">
                          Full interview stories are synthesized during full evaluation. Check Block F in the full report.
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-xl border border-border bg-surface/40 p-4">
                        <h4 className="text-xs font-semibold text-foreground mb-2">{cleanHeading(starSection.heading)}</h4>
                        <div className="report-prose text-xs text-muted">
                          <ReportMarkdown>{starSection.content}</ReportMarkdown>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
          {(() => {
            const { intro, sections } = splitSections(meta?.body ?? report);
            const verdictSection = sections.find((s) => isVerdictHeading(s.heading));
            const rest = sections.filter((s) => s !== verdictSection);
            const machine = rest.filter((s) => isMachine(s.heading));
            const mainSections = rest.filter((s) => !isMachine(s.heading));
            const reason = verdictReason({
              report,
              intro,
              verdictContent: verdictSection?.content,
            });
            const verdictClass = recommended
              ? "border-brand/25 bg-brand-soft/50"
              : "border-border bg-surface/50";
            const callout = (
              <div className={`rounded-2xl border px-5 py-5 ${verdictClass}`}>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Verdict</p>
                <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                  {score ? (
                    <p className="font-display text-4xl tabular-nums tracking-tight text-landing">{score}</p>
                  ) : (
                    <p className="text-sm text-muted">No score on this report.</p>
                  )}
                  <p className="pb-1 text-xs text-muted">Apply line is {APPLY_LINE.toFixed(1)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {score && <Badge tone={scoreTone(score)}>{score}</Badge>}
                  {line && <Badge tone={recommended ? "good" : line === "Below the apply line" ? "muted" : "warn"}>{line}</Badge>}
                  {decision && <Badge tone="info">{decision}</Badge>}
                  {meta?.legitimacy && <Badge tone={legitimacyTone(meta.legitimacy)}>{meta.legitimacy}</Badge>}
                </div>
                {reason && <p className="mt-4 text-[15px] font-medium leading-relaxed text-foreground">{reason}</p>}
                <div className="mt-4">
                  <ApplyButton
                    n={id}
                    url={applyUrl}
                    company={companyName}
                    pdfReady={pdfReady}
                    quiet={quietApply}
                  />
                </div>
              </div>
            );
            if (sections.length === 0) {
              return (
                <div className="mt-8 max-w-4xl">
                  {callout}
                  <ScoreLevers report={report} />
                  <article className="report-prose mt-6">
                    <ReportMarkdown>{meta?.body ?? report}</ReportMarkdown>
                  </article>
                </div>
              );
            }
            return (
              <div className="mt-8 max-w-4xl">
                {callout}
                <ScoreLevers report={report} />

                {mainSections.map((s, i) => {
                  const expanded = isLeadSection(s);
                  if (expanded) {
                    return (
                      <article key={i} className="report-prose mt-6">
                        <h2>{cleanHeading(s.heading)}</h2>
                        <ReportMarkdown>{s.content}</ReportMarkdown>
                      </article>
                    );
                  }
                  return (
                    <details key={i} className="group mt-3 overflow-hidden rounded-xl border border-border bg-surface/30">
                      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-hover">
                        <span className="text-sm font-medium">{cleanHeading(s.heading)}</span>
                        <span className="hidden truncate text-xs text-faint sm:inline">{sectionPreview(s.content)}</span>
                        <ChevronDown className="ml-auto size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="report-prose border-t border-border px-4 py-3">
                        <ReportMarkdown>{s.content}</ReportMarkdown>
                      </div>
                    </details>
                  );
                })}
                <PrepPack report={report} company={companyName} />

                {machine.length > 0 && (
                  <>
                    <div className="mt-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-faint">
                      <span className="h-px flex-1 bg-border" />
                      Technical details · for developers
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {machine.map((s, i) => (
                      <details key={i} className="group mt-2 overflow-hidden rounded-xl border border-border/60 bg-surface/20">
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-3 font-mono text-xs text-muted transition-colors hover:bg-surface-hover">
                          {cleanHeading(s.heading)}
                          <ChevronDown className="ml-auto size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="report-prose border-t border-border/60 px-4 py-3">
                          <ReportMarkdown>{s.content}</ReportMarkdown>
                        </div>
                      </details>
                    ))}
                  </>
                )}
              </div>
            );
          })()}
          {/* After the report body: the reader has just decided whether the
              offer is worth applying to, and this answers the next question —
              whether the CV they would send reads as a match for it. */}
          <KeywordCoverage reportId={id} />
          {/* Then the company itself. Only with a tracker row: the card is keyed
              on a company name, and a report with no row has none to look up —
              guessing one from the report would surface another company's
              history. */}
          {app?.company && <CompanyEvidence company={app.company} />}
          <ScoreMethodology />
        </>
        )
      ) : (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-surface/30 p-5 text-sm text-muted">
          <FileText className="size-5 shrink-0 text-faint" />
          No report file found for #{id} in <code className="text-foreground">reports/</code>.
        </div>
      )}
    </PageFrame>
  );
}
