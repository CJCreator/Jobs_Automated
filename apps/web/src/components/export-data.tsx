"use client";

import { useState } from "react";
import { ApiError, apiBlob } from "@/lib/client/api";
import { Button, Card, Notice, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.dataExport;

// Same fetch-and-blob pattern as the PDF export in review-view.tsx, copied here on purpose.
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

export function ExportData() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { blob, filename } = await apiBlob("/api/account/export", { method: "POST" });
      download(blob, filename ?? t.fallbackName);
      setStatus({ tone: "ok", text: t.done });
    } catch (e) {
      setStatus({ tone: "danger", text: e instanceof ApiError ? e.message : t.failed });
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-4" aria-labelledby="export-data-title">
      <h2 id="export-data-title" className="font-heading text-2xl font-semibold">
        {t.title}
      </h2>
      <p className="max-w-[65ch]">{t.body}</p>
      <Button variant="secondary" onClick={run} loading={busy}>
        {busy ? <Spinner /> : null}
        {busy ? t.working : t.button}
      </Button>
      <div role="status" aria-live="polite">
        {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      </div>
    </Card>
  );
}
