"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CheckIssue, Suggestion, SuggestionAction } from "@/lib/client/types";
import { DiffText } from "@/components/diff-text";
import { cn } from "@/components/ui/cn";
import { UndoIcon } from "@/components/ui/icons";
import { Badge, Button, Card, Notice, Spinner, Textarea } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.review;

export type ActInput = SuggestionAction;

function StatusBadge({ verdict }: { verdict: Suggestion["check"]["verdict"] }) {
  if (verdict === "pass") return <Badge tone="ok">{t.statusPass}</Badge>;
  if (verdict === "warn") return <Badge tone="warn">{t.statusWarn}</Badge>;
  return <Badge tone="danger">{t.statusBlock}</Badge>;
}

export function SuggestionCard({
  suggestion: s,
  index,
  total,
  busy,
  error,
  highlight,
  onAct,
}: {
  suggestion: Suggestion;
  index: number;
  total: number;
  busy: boolean;
  error: string | null;
  highlight: boolean;
  /** Resolves true when the server accepted the action. */
  onAct: (action: ActInput) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.finalText);
  const [sideBySide, setSideBySide] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  // After an action the control the user pressed can disappear (Accept turns
  // the card into a one-line summary, for example). Ask for focus to land on a
  // sensible control inside this same card; the effect tries each candidate
  // until one is on the page and enabled.
  const focusWanted = useRef<string[] | null>(null);
  const [, bump] = useState(0);
  const moveFocusTo = (...candidates: string[]) => {
    focusWanted.current = candidates;
    bump((n) => n + 1);
    // Do not let an old request grab focus much later.
    window.setTimeout(() => {
      if (focusWanted.current === candidates) focusWanted.current = null;
    }, 2000);
  };
  const run = async (action: ActInput, ...focus: string[]) => {
    const ok = await onAct(action);
    // On failure the pressed control was disabled while it worked; point focus at the message.
    moveFocusTo(...(ok ? focus : ["error", "edit-btn", "undo"]));
    return ok;
  };
  useEffect(() => {
    const wanted = focusWanted.current;
    if (!wanted) return;
    const card = document.getElementById(`sug-${s.id}`);
    for (const c of wanted) {
      const el =
        c === "issue-action"
          ? card?.querySelector<HTMLElement>("[data-issue-actions] button:not([disabled])")
          : document.getElementById(`${c}-${s.id}`);
      if (el && !(el as HTMLButtonElement).disabled) {
        el.focus();
        focusWanted.current = null;
        return;
      }
    }
  });

  const blocked = s.check.verdict === "block";
  const context = s.kind === "summary" ? t.summaryContext : s.context;
  const wrapper = cn(
    "scroll-mt-24 rounded-xl",
    highlight && "outline-3 outline-offset-4 outline-danger",
  );

  /* ---- collapsed: accepted or rejected ---- */
  if (s.decision !== "pending") {
    const accepted = s.decision === "accepted";
    return (
      <li id={`sug-${s.id}`} tabIndex={-1} className={wrapper} aria-label={t.cardLabel(index + 1, total)}>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3! sm:p-4!">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={accepted ? "ok" : "neutral"}>{accepted ? t.acceptedLine : t.rejectedLine}</Badge>
              <span className="text-sm text-muted">{context}</span>
            </p>
            <p className={cn("max-w-[70ch] line-clamp-3", !accepted && "text-muted line-through")}>{accepted ? s.finalText : s.before}</p>
            {accepted && blocked ? (
              <p className="text-sm font-medium text-danger">{t.exportReasonBlocked}</p>
            ) : null}
            {error ? (
              <p id={`error-${s.id}`} tabIndex={-1} role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              id={`undo-${s.id}`}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run({ action: "edit", text: s.finalText }, "accept-btn", "edit-btn")}
            >
              {busy ? <Spinner /> : <UndoIcon />}
              {t.undo}
              <span className="sr-only">{`: ${context}`}</span>
            </Button>
          </div>
        </Card>
      </li>
    );
  }

  const saveEdit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await run({ action: "edit", text }, "accept-btn", "edit-btn")) setEditing(false);
  };

  const openEdit = () => {
    setDraft(s.finalText);
    setEditing(true);
  };

  const hasLiveIssues = s.check.issues.some((i) => i.kind !== "blocked");

  return (
    <li id={`sug-${s.id}`} tabIndex={-1} className={wrapper} aria-label={t.cardLabel(index + 1, total)}>
      <Card className={cn("space-y-4 border-s-4", blocked ? "border-s-danger" : s.check.verdict === "warn" ? "border-s-warn" : "border-s-ok")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-muted">{context}</p>
          <StatusBadge verdict={s.check.verdict} />
        </div>

        <div className="space-y-3">
          <h3 className="sr-only">{t.diffLabel}</h3>
          {sideBySide ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 rounded-lg border border-line p-3">
                <p className="text-sm font-semibold text-muted">{t.original}</p>
                <p className="leading-relaxed">{s.before}</p>
              </div>
              <div className="space-y-1 rounded-lg border border-line p-3">
                <p className="text-sm font-semibold text-muted">{t.suggested}</p>
                <p className="leading-relaxed">{s.finalText}</p>
              </div>
            </div>
          ) : (
            <DiffText before={s.before} after={s.finalText} />
          )}
          <button
            type="button"
            onClick={() => setSideBySide((v) => !v)}
            className="min-h-8 rounded py-1 text-sm font-semibold text-brand underline underline-offset-4"
          >
            {sideBySide ? t.inline : t.sideBySide}
          </button>
        </div>

        {s.rationale ? (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{t.rationale}: </span>
            {s.rationale}
          </p>
        ) : null}

        {s.check.verdict === "warn" && s.check.advisory.length > 0 ? (
          <Notice tone="warn">
            <p>{t.advisoryLead}</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {s.check.advisory.map((w) => (
                <li key={w} className="rounded border border-warn px-2 py-0.5 text-sm font-semibold">
                  {w}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {blocked ? (
          <div data-testid="issues" className="space-y-3 rounded-lg border border-danger bg-danger-soft p-4">
            <h4 className="font-semibold">{t.issuesTitle}</h4>
            <ul className="space-y-4">
              {s.check.issues.map((issue: CheckIssue, ii: number) => (
                <li key={`${issue.kind}-${issue.value}`} className="space-y-2">
                  <p>{issue.message}</p>
                  {issue.kind === "blocked" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted">
                        {t.blockedKindNote}{" "}
                        <Link href="/app/resume" className="inline-block min-h-6 py-0.5 font-semibold text-brand underline underline-offset-4">
                          {t.blockedKindLink}
                        </Link>
                      </p>
                      <div data-issue-actions className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={openEdit} disabled={busy}>
                          {t.editWording}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => run({ action: "reject" }, "undo")} disabled={busy}>
                          {t.reject}
                        </Button>
                      </div>
                    </div>
                  ) : !issue.value ? null /* nothing to confirm: only the message and the edit control remain (facts_too_large, engine, coverage, unreadable) */ : confirming === issue.value ? (
                    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
                      <p>{t.confirmAttest(issue.attestAs ?? issue.value)}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          id={`confirm-yes-${ii}-${s.id}`}
                          size="sm"
                          disabled={busy}
                          onClick={async () => {
                            if (await run({ action: "attest", value: issue.value }, "accept-btn", "issue-action", "edit-btn")) {
                              setConfirming(null);
                            }
                          }}
                        >
                          {busy ? <Spinner /> : null}
                          {t.confirmAttestYes}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setConfirming(null);
                            moveFocusTo(`attest-${ii}`);
                          }}
                        >
                          {t.confirmAttestNo}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div data-issue-actions className="flex flex-wrap gap-2">
                      <Button
                        id={`attest-${ii}-${s.id}`}
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(issue.value);
                          moveFocusTo(`confirm-yes-${ii}`);
                        }}
                      >
                        {t.attest}
                        <span className="sr-only">{`: ${issue.value}`}</span>
                      </Button>
                      <Button
                        id={`cannot-${ii}-${s.id}`}
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => run({ action: "cannot_confirm", value: issue.value }, "issue-action", "edit-btn")}
                      >
                        {t.cannotConfirm}
                        <span className="sr-only">{`: ${issue.value}`}</span>
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {hasLiveIssues ? (
              <Button variant="secondary" size="sm" onClick={openEdit} disabled={busy}>
                {t.editWording}
              </Button>
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <div className="space-y-2">
            <label htmlFor={`edit-${s.id}`} className="block font-semibold">
              {t.editLabel}
            </label>
            <Textarea id={`edit-${s.id}`} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveEdit} disabled={busy || !draft.trim()}>
                {busy ? <Spinner /> : null}
                {t.editSave}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                {t.editCancel}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div id={`error-${s.id}`} tabIndex={-1}>
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              id={`accept-btn-${s.id}`}
              disabled={busy || blocked}
              aria-describedby={blocked ? `blocked-${s.id}` : undefined}
              onClick={() => run({ action: "accept" }, "undo")}
            >
              {t.accept}
              <span className="sr-only">{`: ${context}`}</span>
            </Button>
            <Button id={`reject-btn-${s.id}`} variant="secondary" disabled={busy} onClick={() => run({ action: "reject" }, "undo")}>
              {t.reject}
              <span className="sr-only">{`: ${context}`}</span>
            </Button>
            <Button id={`edit-btn-${s.id}`} variant="secondary" disabled={busy || editing} onClick={openEdit}>
              {t.edit}
              <span className="sr-only">{`: ${context}`}</span>
            </Button>
          </div>
          {blocked ? (
            <p id={`blocked-${s.id}`} className="text-sm font-medium text-danger">
              {t.blockedReason}
            </p>
          ) : null}
        </div>
      </Card>
    </li>
  );
}
