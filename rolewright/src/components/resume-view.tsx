"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useLlmKey } from "@/lib/client/llm-key";
import { providerLabel, useProviders } from "@/lib/client/providers";
import type { Facts, FactsResponse, FactsSave } from "@/lib/client/types";
import { confirmationCounts } from "@/lib/facts.mjs";
import { FactEditor } from "@/components/fact-editor";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import { Button, buttonClass, Card, Checkbox, ErrorBlock, Field, LoadingBlock, Notice, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.resume;
const MAX_BYTES = 5 * 1024 * 1024;

export function ResumeView() {
  const { llm, ready } = useLlmKey();
  const { providers } = useProviders();

  const [facts, setFacts] = useState<Facts | null>(null);
  const [saved, setSaved] = useState("");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const focusAfterUpload = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    api<FactsResponse>("/api/facts", { signal: controller.signal })
      .then((res) => {
        setFacts(res.facts);
        setSaved(JSON.stringify(res.facts));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(e instanceof ApiError ? e : new ApiError(0, "network", en.common.loadError));
        setLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);

  const dirty = facts !== null && JSON.stringify(facts) !== saved;

  // Warn before the tab closes or reloads with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const counts = useMemo(() => (facts ? confirmationCounts(facts) : { confirmed: 0, total: 0 }), [facts]);
  const canTailor = facts ? facts.experience.some((j) => j.confirmed && j.bullets.some((b) => b.confirmed)) : false;

  const announce = useCallback((m: string) => setAnnouncement(m), []);

  const onChange = (next: Facts) => {
    setFacts(next);
    setSaveMessage(null);
  };

  const onUpload = async () => {
    let ok = true;
    if (!file) {
      setFileError(t.errorNoFile);
      ok = false;
    } else if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      setFileError(t.errorNotPdf);
      ok = false;
    } else if (file.size > MAX_BYTES) {
      setFileError(t.errorTooBig);
      ok = false;
    } else setFileError(null);
    if (!consent) {
      setConsentError(t.consentError);
      ok = false;
    } else setConsentError(null);
    if (!ok || !file) return;

    setUploading(true);
    setUploadError(null);
    setUploadDone(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<FactsResponse>("/api/resume", { method: "POST", form });
      setFacts(res.facts);
      setSaved(JSON.stringify(res.facts));
      setUploadDone(true);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setAnnouncement(t.done);
      focusAfterUpload.current = "facts-heading";
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : en.common.loadError);
      focusAfterUpload.current = "upload-error";
    } finally {
      setUploading(false);
    }
  };

  // The upload form is disabled while it works, which drops focus to the top of
  // the page. Put it on the result instead: the facts to review, or the error.
  useEffect(() => {
    if (uploading || !focusAfterUpload.current) return;
    const el = document.getElementById(focusAfterUpload.current);
    if (el) {
      el.focus();
      focusAfterUpload.current = null;
    }
  });

  const onSave = async () => {
    if (!facts) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      // The server keeps its own can't-confirm list; entries the user removed here are named explicitly.
      const stored = JSON.parse(saved) as Facts;
      const removeCannotConfirm = stored.cannotConfirm.filter((c) => !facts.cannotConfirm.includes(c));
      const body: FactsSave = { facts, removeCannotConfirm };
      const res = await api<FactsResponse>("/api/facts", { method: "PUT", json: body });
      setFacts(res.facts);
      setSaved(JSON.stringify(res.facts));
      setSaveMessage({ tone: "ok", text: t.saveDone });
    } catch (e) {
      setSaveMessage({ tone: "danger", text: e instanceof ApiError ? e.message : t.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const noKey = ready && !llm;

  return (
    <div className="space-y-8">
      <p className="max-w-[65ch] rounded-lg bg-brand-soft p-4 text-lg font-medium">{t.rule}</p>
      <Card className="space-y-5" aria-labelledby="upload-title">
        <h2 id="upload-title" className="font-heading text-2xl font-semibold">
          {t.uploadTitle}
        </h2>
        {noKey ? (
          <Notice tone="warn" title={t.noKeyTitle}>
            <p>{t.noKeyBody}</p>
            <Link href="/app/key" className="inline-block min-h-8 py-1 font-semibold text-brand underline underline-offset-4">
              {t.noKeyLink}
            </Link>
          </Notice>
        ) : null}

        <fieldset disabled={noKey || uploading || !ready} className="space-y-5 border-0 p-0">
          <legend className="sr-only">{t.uploadTitle}</legend>
          <Field id="resume-file" label={t.fileLabel} hint={t.uploadHelp} error={fileError}>
            {(f) => (
              <input
                ref={fileInput}
                id={f.id}
                type="file"
                accept="application/pdf,.pdf"
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid || undefined}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setFileError(null);
                }}
                className="block w-full min-h-11 rounded-lg border border-line bg-surface p-2 text-base file:me-3 file:min-h-8 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:font-semibold file:text-brand"
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <Checkbox
              id="resume-consent"
              checked={consent}
              required
              describedBy={consentError ? "resume-consent-error" : undefined}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setConsentError(null);
              }}
              label={t.consent(llm ? providerLabel(llm.provider, providers) : t.providerFallback)}
            />
            {consentError ? (
              <p id="resume-consent-error" className="text-sm font-medium text-danger">
                {consentError}
              </p>
            ) : null}
          </div>

          <Button id="upload-resume" onClick={onUpload}>
            {uploading ? <Spinner /> : null}
            {t.uploadButton}
          </Button>
        </fieldset>

        <div role="status" aria-live="polite" className="space-y-3">
          {uploading ? (
            <Notice tone="info">
              <span className="flex items-center gap-2">
                <Spinner />
                {t.working}
              </span>
            </Notice>
          ) : null}
          {uploadDone ? <Notice tone="ok">{t.done}</Notice> : null}
        </div>
        {uploadError ? (
          <div id="upload-error" tabIndex={-1}>
            <Notice tone="danger" role="alert">
              {uploadError}
            </Notice>
          </div>
        ) : null}
      </Card>

      <h2 id="facts-heading" tabIndex={-1} className="font-heading text-3xl font-semibold">
        {t.factsTitle}
      </h2>

      {loading ? (
        <LoadingBlock label={en.common.loading} lines={6} />
      ) : loadError || !facts ? (
        <ErrorBlock message={loadError?.message ?? en.common.loadError} retryLabel={en.common.retry} onRetry={() => setNonce((n) => n + 1)} />
      ) : (
        <>
          {counts.total === 0 ? (
            <Card className="space-y-1">
              <p className="font-heading text-xl font-semibold">{t.emptyTitle}</p>
              <p className="max-w-[65ch] text-muted">{t.emptyBody}</p>
            </Card>
          ) : null}
          <FactEditor facts={facts} onChange={onChange} announce={announce} />

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="font-semibold">{t.summaryBar(counts.confirmed, counts.total)}</p>
              <p className={`flex items-center gap-1.5 text-sm font-medium ${dirty ? "text-warn" : "text-muted"}`}>
                {dirty ? <AlertIcon /> : <CheckIcon />}
                {saving ? t.saving : dirty ? t.unsaved : t.allSaved}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:ms-auto">
                {canTailor ? (
                  <Link href="/app/tailor" className={buttonClass("secondary")}>
                    {t.toTailoring}
                  </Link>
                ) : (
                  <p className="max-w-[28ch] text-sm text-muted">{t.needBullet}</p>
                )}
                <Button id="save-facts" onClick={onSave} loading={saving}>
                  {saving ? <Spinner /> : null}
                  {t.saveFacts}
                </Button>
              </div>
            </div>
            <div role="status" aria-live="polite" className="mt-2 empty:hidden">
              {saveMessage ? <Notice tone={saveMessage.tone}>{saveMessage.text}</Notice> : null}
            </div>
          </div>
        </>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
