"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { Button, Card, Notice, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.erasure;

// Deletes only the stored text of uploaded resumes. Confirmed facts stay, and
// the copy says so; the account deletion below is a separate, larger action.
export function DeleteResumeText() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ deleted: number }>("/api/resumes", { method: "DELETE" });
      setDone(res.deleted);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.resumeFailed);
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-4" aria-labelledby="delete-resume-title">
      <h2 id="delete-resume-title" className="font-heading text-2xl font-semibold">
        {t.resumeTitle}
      </h2>
      <p className="max-w-[65ch]">{t.resumeBody}</p>
      <p className="max-w-[65ch] text-muted">{t.resumeAccountNote}</p>
      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" onClick={onDelete} loading={busy}>
            {busy ? <Spinner /> : null}
            {busy ? t.deleting : t.resumeConfirm}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            {t.confirmNo}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          {t.resumeButton}
        </Button>
      )}
      <div role="status" aria-live="polite">
        {done !== null ? <Notice tone="ok">{t.resumeDone(done)}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Card>
  );
}
