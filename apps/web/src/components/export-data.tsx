"use client";

import { useState } from "react";
import { ApiError, apiBlob } from "@/lib/client/api";
import { Button, Card, Notice, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.dataExport;
const p = en.dataExportPdfs;

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

  const [busyPdfs, setBusyPdfs] = useState(false);

  const fetchAndSave = async (path: string, fallbackName: string, done: string, failed: string, setLoading: (b: boolean) => void) => {
    setLoading(true);
    setStatus(null);
    try {
      const { blob, filename } = await apiBlob(path, { method: "POST" });
      download(blob, filename ?? fallbackName);
      setStatus({ tone: "ok", text: done });
    } catch (e) {
      setStatus({ tone: "danger", text: e instanceof ApiError ? e.message : failed });
    }
    setLoading(false);
  };
  const run = () => fetchAndSave("/api/account/export", t.fallbackName, t.done, t.failed, setBusy);
  const runPdfs = () => fetchAndSave("/api/account/export/pdfs", p.fallbackName, p.done, p.failed, setBusyPdfs);

  return (
    <Card className="space-y-4" aria-labelledby="export-data-title">
      <h2 id="export-data-title" className="font-heading text-2xl font-semibold">
        {t.title}
      </h2>
      <p className="max-w-[65ch]">{t.body}</p>
      <Button variant="secondary" onClick={run} loading={busy} disabled={busyPdfs}>
        {busy ? <Spinner /> : null}
        {busy ? t.working : t.button}
      </Button>
      <p className="max-w-[65ch]">{p.body}</p>
      <Button variant="secondary" onClick={runPdfs} loading={busyPdfs} disabled={busy}>
        {busyPdfs ? <Spinner /> : null}
        {busyPdfs ? p.working : p.button}
      </Button>
      <div role="status" aria-live="polite">
        {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      </div>
    </Card>
  );
}
