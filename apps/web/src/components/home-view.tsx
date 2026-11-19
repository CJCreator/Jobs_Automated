"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { confirmationCounts } from "@/lib/facts.mjs";
import { formatDate } from "@/lib/client/format";
import { useLlmKey } from "@/lib/client/llm-key";
import type { FactsResponse, TailoringListItem } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { cn } from "@/components/ui/cn";
import { CheckIcon } from "@/components/ui/icons";
import { Badge, buttonClass, Card, ErrorBlock, LoadingBlock } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.home;

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

export function HomeView() {
  const { llm, ready } = useLlmKey();
  const facts = useApi<FactsResponse>("/api/facts");
  const list = useApi<{ items: TailoringListItem[] }>("/api/tailorings");

  const counts = facts.data ? (facts.data.counts ?? confirmationCounts(facts.data.facts)) : null;
  const hasResume = counts ? counts.total > 0 : false;
  const factsDone = counts ? counts.total > 0 && counts.confirmed > 0 : false;
  const keyDone = ready && Boolean(llm);

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
        <h2 id="tailored-title" className="font-heading text-2xl font-semibold">
          {t.listTitle}
        </h2>
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
