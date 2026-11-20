"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiBlob, ApiError } from "@/lib/client/api";
import type { CheckIssue, Coverage, SuggestionAction, Tailoring } from "@/lib/client/types";
import { KeywordCoverage } from "@/components/keyword-coverage";
import { SuggestionCard } from "@/components/suggestion-card";
import { Button, buttonClass, Card, ErrorBlock, LoadingBlock, Notice, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.review;

function safeFilename(title: string, company: string) {
  const base = `Resume - ${title} - ${company}`.replace(/[^\p{L}\p{N} _.-]+/gu, "").replace(/\s+/g, " ").trim();
  return `${base || "Resume"}.pdf`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Refused issues grouped by the suggestion they came from; those with no suggestion share one group. */
function groupIssues(issues: CheckIssue[], known: { id: string }[]) {
  const groups: { sid: string | null; line: string; issues: CheckIssue[] }[] = [];
  for (const issue of issues) {
    // A suggestion this page does not list cannot be numbered or scrolled to.
    const sid = issue.sid && known.some((s) => s.id === issue.sid) ? issue.sid : null;
    let group = groups.find((g) => g.sid === sid);
    if (!group) {
      group = { sid, line: issue.line ?? "", issues: [] };
      groups.push(group);
    }
    group.issues.push(issue);
  }
  return groups;
}

/** The suggestion's 1-based place in the list, as its card is numbered. */
function lineNumber(suggestions: { id: string }[], sid: string) {
  return suggestions.findIndex((s) => s.id === sid) + 1;
}

export function ReviewView({ id }: { id: string }) {
  const [tailoring, setTailoring] = useState<Tailoring | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState<{ message: string; issues: CheckIssue[] } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<{ tailoring: Tailoring }>(`/api/tailorings/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((res) => {
        setTailoring(res.tailoring);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError(0, "network", en.common.loadError));
        setLoading(false);
      });
    return () => controller.abort();
  }, [id, nonce]);

  // Coverage is information only. It is refetched after every change to the
  // suggestions and a failure here never blocks the page.
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const decisions = useMemo(
    () => (tailoring?.suggestions ?? []).map((s) => `${s.id}:${s.decision}:${s.finalText}`).join("\n"),
    [tailoring],
  );
  const loaded = tailoring !== null;
  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    api<Coverage>(`/api/tailorings/${encodeURIComponent(id)}/coverage`, { signal: controller.signal })
      .then((res) => setCoverage(res))
      .catch(() => {
        if (!controller.signal.aborted) setCoverage(null);
      });
    return () => controller.abort();
  }, [id, loaded, decisions]);

  const counts = useMemo(() => {
    const list = tailoring?.suggestions ?? [];
    return {
      accepted: list.filter((s) => s.decision === "accepted").length,
      rejected: list.filter((s) => s.decision === "rejected").length,
      pending: list.filter((s) => s.decision === "pending").length,
      blocked: list.filter((s) => s.decision !== "rejected" && s.check.verdict === "block").length,
    };
  }, [tailoring]);

  const acceptedBlocked = useMemo(
    () => (tailoring?.suggestions ?? []).some((s) => s.decision === "accepted" && s.check.verdict === "block"),
    [tailoring],
  );
  const exportReason = counts.accepted === 0 ? t.exportReasonNone : acceptedBlocked ? t.exportReasonBlocked : null;

  const act = useCallback(
    async (sid: string, body: SuggestionAction, isUndo: boolean) => {
      setBusyId(sid);
      setCardError(null);
      try {
        const res = await api<{ tailoring: Tailoring }>(
          `/api/tailorings/${encodeURIComponent(id)}/suggestions/${encodeURIComponent(sid)}`,
          { method: "PATCH", json: body },
        );
        setTailoring(res.tailoring);
        setExportProblem(null);
        setAnnouncement(isUndo ? t.announce.undo : t.announce[body.action]);
        return true;
      } catch (e) {
        const message = e instanceof ApiError ? e.message : t.actionFailed;
        setCardError({ id: sid, message });
        setAnnouncement(message);
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [id],
  );

  /** Scroll to a suggestion's card and move focus to it. */
  const goToSuggestion = (sid: string) => {
    setHighlightId(sid);
    requestAnimationFrame(() => {
      const el = document.getElementById(`sug-${sid}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    });
  };

  const onExport = async () => {
    if (!tailoring) return;
    setExporting(true);
    setExportProblem(null);
    setHighlightId(null);
    try {
      const { blob, filename } = await apiBlob(`/api/tailorings/${encodeURIComponent(id)}/export`, { method: "POST" });
      download(blob, filename ?? safeFilename(tailoring.title, tailoring.company));
      setAnnouncement(t.exportDone);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setExportProblem({ message: e.message, issues: e.issues });
        setAnnouncement(t.announce.exportFailed);
        // Point at the first accepted line that the server refused.
        const values = e.issues.map((i) => i.value.toLowerCase());
        const first = tailoring.suggestions.find(
          (s) =>
            s.decision === "accepted" &&
            (s.check.verdict === "block" || values.some((v) => s.finalText.toLowerCase().includes(v))),
        );
        if (first) goToSuggestion(first.id);
      } else {
        const message = e instanceof ApiError ? e.message : t.actionFailed;
        setExportProblem({ message, issues: [] });
        setAnnouncement(t.announce.exportFailed);
      }
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="sr-only">{t.pageTitle}</h1>
        <LoadingBlock label={en.common.loading} lines={6} />
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-3xl font-semibold">{t.notFoundTitle}</h1>
        <p className="text-muted">{t.notFoundBody}</p>
        <Link href="/app" className={buttonClass("secondary")}>
          {t.back}
        </Link>
      </div>
    );
  }

  if (error || !tailoring) {
    return (
      <div className="space-y-4">
        <h1 className="sr-only">{t.pageTitle}</h1>
        <ErrorBlock message={error?.message ?? en.common.loadError} retryLabel={en.common.retry} onRetry={() => setNonce((n) => n + 1)} />
      </div>
    );
  }

  const { linesTotal, linesSent, rewritesReturned } = tailoring;
  const capNotices: string[] = [];
  if (typeof linesTotal === "number" && typeof linesSent === "number" && linesSent < linesTotal) {
    capNotices.push(en.tailoringCap.linesCut(linesTotal, linesSent));
  }
  if (typeof rewritesReturned === "number" && rewritesReturned > tailoring.suggestions.length) {
    capNotices.push(en.tailoringCap.rewritesCut(rewritesReturned, tailoring.suggestions.length));
  }

  const stats: [string, number][] = [
    [t.counts.accepted, counts.accepted],
    [t.counts.rejected, counts.rejected],
    [t.counts.pending, counts.pending],
    [t.counts.blocked, counts.blocked],
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link href="/app" className="inline-block min-h-8 py-1 text-brand underline underline-offset-4">
          {t.back}
        </Link>
        <h1 tabIndex={-1} className="font-heading text-3xl font-semibold sm:text-4xl">
          {tailoring.title}
          <span className="block text-xl font-normal text-muted sm:text-2xl">{tailoring.company}</span>
        </h1>
        <dl className="flex flex-wrap gap-3">
          {stats.map(([label, n]) => (
            <div key={label} className="min-w-28 rounded-lg border border-line bg-surface px-4 py-2">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-heading text-2xl font-semibold">{n}</dd>
            </div>
          ))}
        </dl>
        {coverage ? <KeywordCoverage coverage={coverage} /> : null}
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button id="export-pdf" onClick={onExport} disabled={Boolean(exportReason)} loading={exporting} aria-describedby={exportReason ? "export-reason" : "export-note"}>
            {exporting ? <Spinner /> : null}
            {exporting ? t.exporting : t.export}
          </Button>
          {exportReason ? (
            <p id="export-reason" className="text-sm font-medium text-warn">
              {exportReason}
            </p>
          ) : null}
        </div>
        <p id="export-note" className="text-sm text-muted">
          {t.exportNote}
        </p>
      </Card>

      {exportProblem ? (
        <Notice tone="danger" role="alert" title={t.exportBlockedTitle}>
          <p>{exportProblem.message}</p>
          {exportProblem.issues.length > 0 ? (
            <>
              <p className="mt-1">{t.exportBlockedBody}</p>
              {groupIssues(exportProblem.issues, tailoring.suggestions).map((group) =>
                group.sid ? (
                  <div key={group.sid} className="mt-3 space-y-1" data-testid="export-blocked-line">
                    <p className="font-medium">
                      {t.exportBlockedLine(lineNumber(tailoring.suggestions, group.sid))}
                      {group.line ? <span className="font-normal">{`: ${group.line}`}</span> : null}
                    </p>
                    <p>
                      {t.exportBlockedWords} <strong>{group.issues.map((i) => i.value).join(", ")}</strong>
                    </p>
                    <button
                      type="button"
                      className="min-h-8 py-1 text-brand underline underline-offset-4"
                      onClick={() => goToSuggestion(group.sid as string)}
                    >
                      {t.exportBlockedGo}
                    </button>
                  </div>
                ) : (
                  <div key="general" className="mt-3">
                    <p className="font-medium">{t.exportBlockedGeneral}</p>
                    <ul className="list-disc ps-5">
                      {group.issues.map((i) => (
                        <li key={`${i.kind}-${i.value}`}>{i.message}</li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </>
          ) : null}
        </Notice>
      ) : null}

      {capNotices.length > 0 ? (
        <Notice tone="info" role="status">
          {capNotices.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </Notice>
      ) : null}

      <section aria-labelledby="suggestions-title" className="space-y-4">
        <h2 id="suggestions-title" className="font-heading text-2xl font-semibold">
          {t.listTitle}
          <span className="ms-3 text-base font-normal text-muted">{t.reviewCount(tailoring.suggestions.length)}</span>
        </h2>
        {tailoring.suggestions.length === 0 ? (
          <Card className="space-y-1">
            <p className="font-heading text-xl font-semibold">{t.emptyTitle}</p>
            <p className="text-muted">{t.emptyBody}</p>
          </Card>
        ) : (
          <ul className="space-y-4">
            {tailoring.suggestions.map((s, i) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                index={i}
                total={tailoring.suggestions.length}
                busy={busyId === s.id}
                error={cardError?.id === s.id ? cardError.message : null}
                highlight={highlightId === s.id}
                onAct={(body) => act(s.id, body, s.decision !== "pending" && body.action === "edit")}
              />
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="min-h-8 cursor-pointer font-semibold">{t.jdToggle}</summary>
        <h2 className="mt-3 font-heading text-xl font-semibold">{t.jdTitle}</h2>
        <p className="mt-2 max-w-[75ch] whitespace-pre-wrap text-muted">{tailoring.jdText}</p>
      </details>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
