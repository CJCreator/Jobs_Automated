"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { Button, Notice, Card, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.erasure;

interface Result {
  deleted: number;
  factsRemoved: number;
}

/** One delete control: a trigger, then a confirm with cancel. Focus goes to cancel on open and back to the trigger afterwards. */
function Control({
  trigger,
  confirm,
  path,
  onDone,
}: {
  trigger: string;
  confirm: string;
  path: string;
  onDone: (r: Result) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Button takes no ref, so each is wrapped and its button found inside.
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cancelRef = useRef<HTMLSpanElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.querySelector("button")?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.querySelector("button")?.focus();
    }
  }, [confirming]);

  const close = () => {
    returnFocus.current = true;
    setConfirming(false);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<Result>(path, { method: "DELETE" }));
      close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.resumeFailed);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" onClick={run} loading={busy}>
            {busy ? <Spinner /> : null}
            {busy ? t.deleting : confirm}
          </Button>
          <span ref={cancelRef}>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {t.confirmNo}
            </Button>
          </span>
        </div>
      ) : (
        <span ref={triggerRef} className="inline-block">
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {trigger}
          </Button>
        </span>
      )}
      <div role="status" aria-live="polite">
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </div>
  );
}

// Two separate deletions. The first removes only stored resume text and keeps
// every fact; the second also removes the facts read from the resume. Both
// leave the account alone; account deletion is a separate card.
export function DeleteResumeText() {
  const [textDone, setTextDone] = useState<Result | null>(null);
  const [factsDone, setFactsDone] = useState<Result | null>(null);

  return (
    <Card className="space-y-6" aria-labelledby="delete-resume-title">
      <section className="space-y-4">
        <h2 id="delete-resume-title" className="font-heading text-2xl font-semibold">
          {t.resumeTitle}
        </h2>
        <p className="max-w-[65ch]">{t.resumeBody}</p>
        <p className="max-w-[65ch] text-muted">{t.resumeAccountNote}</p>
        <Control trigger={t.resumeButton} confirm={t.resumeConfirm} path="/api/resumes" onDone={setTextDone} />
        <div role="status" aria-live="polite">
          {textDone ? <Notice tone="ok">{t.resumeDone(textDone.deleted)}</Notice> : null}
        </div>
      </section>
      <section className="space-y-4 border-t border-line pt-6" aria-labelledby="delete-facts-title">
        <h3 id="delete-facts-title" className="font-heading text-xl font-semibold">
          {t.factsTitle}
        </h3>
        <p className="max-w-[65ch]">{t.factsBody}</p>
        <Control trigger={t.factsButton} confirm={t.factsConfirm} path="/api/resumes?facts=upload" onDone={setFactsDone} />
        <div role="status" aria-live="polite">
          {factsDone ? (
            <Notice tone="ok">
              {t.factsDone(factsDone.deleted, factsDone.factsRemoved)}{" "}
              <Link href="/app/facts" className="underline">
                {t.factsLink}
              </Link>
            </Notice>
          ) : null}
        </div>
      </section>
    </Card>
  );
}
