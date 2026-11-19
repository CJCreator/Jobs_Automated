"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useLlmKey } from "@/lib/client/llm-key";
import { providerLabel, useProviders } from "@/lib/client/providers";
import type { FactsResponse } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { tailorableLines } from "@/lib/facts.mjs";
import { NOTICE_VERSION } from "@/lib/notice.mjs";
import { Button, Card, Checkbox, ErrorBlock, Field, Input, LoadingBlock, Notice, Spinner, Textarea } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.tailor;
const MIN = 200;
const MAX = 20000;

export function TailorForm() {
  const router = useRouter();
  const { llm, ready } = useLlmKey();
  const { providers } = useProviders();
  const facts = useApi<FactsResponse>("/api/facts");
  const consent = useApi<{ noticeVersion: string; accepted: boolean }>("/api/consent");
  const [agreed, setAgreed] = useState(false);

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [errors, setErrors] = useState<{ title?: string; company?: string; jd?: string; consent?: string }>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (facts.loading || consent.loading || !ready) return <LoadingBlock label={en.common.loading} lines={5} />;
  if (facts.error || !facts.data) {
    return <ErrorBlock message={facts.error?.message ?? en.common.loadError} retryLabel={en.common.retry} onRetry={facts.reload} />;
  }

  const needConsent = !consent.data?.accepted;
  const hasLines = tailorableLines(facts.data.facts).length > 0;
  const missingKey = !llm;

  if (missingKey || !hasLines) {
    return (
      <Notice tone="warn" title={t.missingTitle}>
        <ul className="list-disc space-y-2 ps-5">
          {missingKey ? (
            <li>
              {t.missingKey}{" "}
              <Link href="/app/key" className="font-semibold text-brand underline underline-offset-4">
                {t.missingKeyLink}
              </Link>
            </li>
          ) : null}
          {!hasLines ? (
            <li>
              {t.missingFacts}{" "}
              <Link href="/app/resume" className="font-semibold text-brand underline underline-offset-4">
                {t.missingFactsLink}
              </Link>
            </li>
          ) : null}
        </ul>
      </Notice>
    );
  }

  const length = jd.trim().length;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = t.errTitle;
    if (!company.trim()) next.company = t.errCompany;
    if (length < MIN) next.jd = t.errJdShort(MIN);
    else if (length > MAX) next.jd = t.errJdLong(MAX);
    if (needConsent && !agreed) next.consent = en.consent.error;
    setErrors(next);
    if (Object.keys(next).length) {
      const first = next.title ? "job-title" : next.company ? "job-company" : next.jd ? "job-jd" : "tailor-consent";
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    let consentSaved = !needConsent;
    try {
      if (needConsent) {
        await api<{ accepted: boolean }>("/api/consent", { method: "POST", json: { noticeVersion: NOTICE_VERSION } });
        consentSaved = true;
        consent.setData({ noticeVersion: NOTICE_VERSION, accepted: true });
      }
      const res = await api<{ id: string }>("/api/tailorings", {
        method: "POST",
        json: { title: title.trim(), company: company.trim(), jdText: jd.trim() },
      });
      router.push(`/app/tailor/${res.id}`);
    } catch (err) {
      // A tab left open across a notice change: ask again.
      if (err instanceof ApiError && err.code === "consent_required") consent.setData({ noticeVersion: NOTICE_VERSION, accepted: false });
      setServerError(err instanceof ApiError ? err.message : consentSaved ? en.common.loadError : en.consent.saveFailed);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={busy}>
      <p className="max-w-[65ch] text-lg text-muted">{t.intro}</p>
      <fieldset className="space-y-6 border-0 p-0">
        <legend className="sr-only">{t.title}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="job-title" label={t.jobTitleLabel} error={errors.title}>
            {(f) => (
              <Input
                id={f.id}
                value={title}
                readOnly={busy}
                autoComplete="off"
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid || undefined}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <Field id="job-company" label={t.companyLabel} error={errors.company}>
            {(f) => (
              <Input
                id={f.id}
                value={company}
                readOnly={busy}
                autoComplete="off"
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid || undefined}
                onChange={(e) => setCompany(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field id="job-jd" label={t.jdLabel} hint={t.jdHelp(MIN, MAX)} error={errors.jd}>
          {(f) => (
            <>
              <Textarea
                id={f.id}
                rows={14}
                value={jd}
                readOnly={busy}
                aria-describedby={`${f.describedBy ?? ""} job-jd-count`.trim()}
                aria-invalid={f.invalid || undefined}
                onChange={(e) => setJd(e.target.value)}
              />
              <p id="job-jd-count" className={`text-sm ${length > MAX ? "font-semibold text-danger" : "text-muted"}`}>
                {t.jdCount(length, MAX)}
              </p>
            </>
          )}
        </Field>
        {needConsent ? (
          <div className="space-y-1.5">
            <Checkbox
              id="tailor-consent"
              checked={agreed}
              required
              describedBy={errors.consent ? "tailor-consent-error" : undefined}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setErrors((x) => ({ ...x, consent: undefined }));
              }}
              label={
                <>
                  {en.consent.lead(llm ? providerLabel(llm.provider, providers) : en.app.resume.providerFallback)}{" "}
                  <Link href="/privacy" target="_blank" className="inline-block min-h-6 font-semibold text-brand underline underline-offset-4">
                    {en.consent.linkText}
                  </Link>
                </>
              }
            />
            {errors.consent ? (
              <p id="tailor-consent-error" className="text-sm font-medium text-danger">
                {errors.consent}
              </p>
            ) : null}
          </div>
        ) : null}
        <Button id="tailor-submit" type="submit" loading={busy}>
          {busy ? <Spinner /> : null}
          {t.submit}
        </Button>
      </fieldset>

      <div role="status" aria-live="polite">
        {busy ? (
          <Card className="space-y-2">
            <p className="flex items-center gap-2 font-heading text-xl font-semibold">
              <Spinner />
              {t.workingTitle}
            </p>
            <p className="text-muted">{t.workingBody}</p>
            <p className="text-muted">{t.working}</p>
          </Card>
        ) : null}
      </div>
      {serverError ? (
        <Notice tone="danger" role="alert">
          {serverError}
        </Notice>
      ) : null}
    </form>
  );
}
