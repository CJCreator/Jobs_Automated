"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { confirmationCounts } from "@/lib/facts.mjs";
import { formatDate } from "@/lib/client/format";
import { useLlmKey } from "@/lib/client/llm-key";
import type { FactsResponse, TailoringListItem } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/icons";
import { Badge, Button, buttonClass, Card, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.home;
const e = en.erasure;

function Step({
  n,
  done,
  title,
  body,
  action,
}: {
  n: number;
  done: boolean;
  title: string;
  body: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex gap-4 py-5">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border-2 font-heading text-lg font-semibold",
          done ? "border-ok bg-ok-soft text-ok" : "border-brand text-brand",
        )}
      >
        {done ? <CheckIcon /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-heading text-xl font-semibold">{title}</h3>
          <Badge tone={done ? "ok" : "neutral"}>{done ? t.done : t.todo}</Badge>
        </div>
        <div className="text-muted">{body}</div>
        {action}
      </div>
    </li>
  );
}

/** DELETE answers 204 with no body, which the shared api() helper cannot read, so this calls fetch. */
async function deleteTailoring(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/tailorings/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error(e.failed);
  }
  if (!res.ok) throw new Error(e.failed);
}

function DeleteTailoring({ item, onDeleted }: { item: TailoringListItem; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = item.title || t.untitled;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteTailoring(item.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : e.failed);
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {confirming ? (
        <div role="group" aria-label={e.deleteLabel(title)} className="space-y-2 rounded-xl border border-danger p-3">
          <p className="max-w-[60ch]">{e.confirmLead(title)}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" size="sm" onClick={confirm} loading={busy}>
              {busy ? e.deleting : e.confirmYes}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              {e.confirmNo}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" aria-label={e.deleteLabel(title)} onClick={() => setConfirming(true)}>
          {e.delete}
        </Button>
      )}
      <div role="status" aria-live="polite">
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </div>
  );
}

export function HomeView() {
  const { llm, ready } = useLlmKey();
  const facts = useApi<FactsResponse>("/api/facts");
  const list = useApi<{ items: TailoringListItem[] }>("/api/tailorings");

  const counts = facts.data ? (facts.data.counts ?? confirmationCounts(facts.data.facts)) : null;
  const hasResume = counts ? counts.total > 0 : false;
  const factsDone = counts ? counts.total > 0 && counts.confirmed > 0 : false;
  const keyDone = ready && Boolean(llm);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const [deletedNote, setDeletedNote] = useState(false);
  const afterDelete = () => {
    setDeletedNote(true);
    list.reload();
    // The row that had focus is gone; the list heading is the next stable place.
    listHeading.current?.focus();
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="progress-title" className="space-y-2">
        <h2 id="progress-title" className="sr-only">
          {t.title}
        </h2>
        <p className="max-w-[60ch] text-lg text-muted">{t.intro}</p>
        <Card className="py-1 sm:py-2">
          <ol className="divide-y divide-line">
            <Step
              n={1}
              done={keyDone}
              title={keyDone ? t.stepKeyDone : t.stepKey}
              body={t.stepKeyBody}
              action={
                keyDone ? null : (
                  <Link href="/app/key" className={buttonClass("primary", "sm")}>
                    {t.goKey}
                  </Link>
                )
              }
            />
            <Step
              n={2}
              done={factsDone}
              title={t.stepFacts}
              body={
                facts.loading ? (
                  <LoadingBlock label={en.common.loading} lines={1} />
                ) : facts.error ? (
                  <ErrorBlock message={en.common.loadError} retryLabel={en.common.retry} onRetry={facts.reload} />
                ) : hasResume && counts ? (
                  <span role="status">{t.stepFactsCount(counts.confirmed, counts.total)}</span>
                ) : (
                  t.stepFactsNone
                )
              }
              action={
                <Link href="/app/resume" className={buttonClass(factsDone ? "secondary" : "primary", "sm")}>
                  {t.goResume}
                </Link>
              }
            />
            <Step
              n={3}
              done={Boolean(list.data && list.data.items.length > 0)}
              title={t.stepTailor}
              body={t.stepTailorBody}
              action={
                <Link href="/app/tailor" className={buttonClass(keyDone && factsDone ? "primary" : "secondary", "sm")}>
                  {t.goTailor}
                </Link>
              }
            />
          </ol>
        </Card>
      </section>

      <section aria-labelledby="tailored-title" className="space-y-4">
        <h2 id="tailored-title" ref={listHeading} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {t.listTitle}
        </h2>
        <div role="status" aria-live="polite">
          {deletedNote ? <p className="text-muted">{e.deletedStatus}</p> : null}
        </div>
        {list.loading ? (
          <LoadingBlock label={en.common.loading} lines={4} />
        ) : list.error ? (
          <ErrorBlock message={en.common.loadError} retryLabel={en.common.retry} onRetry={list.reload} />
        ) : list.data && list.data.items.length > 0 ? (
          <ul className="space-y-3">
            {list.data.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/app/tailor/${item.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 hover:border-brand sm:p-5"
                >
                  <span className="block font-heading text-xl font-semibold text-brand underline-offset-4 hover:underline">
                    {item.title || t.untitled}
                  </span>
                  <span className="block text-ink">{item.company}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {t.createdOn(formatDate(item.createdAt))}. {t.listCounts(item.accepted, item.pending)}.
                  </span>
                </Link>
                <DeleteTailoring item={item} onDeleted={afterDelete} />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="space-y-2">
            <p className="font-heading text-xl font-semibold">{t.listEmptyTitle}</p>
            <p className="max-w-[60ch] text-muted">{t.listEmptyBody}</p>
          </Card>
        )}
      </section>
    </div>
  );
}
