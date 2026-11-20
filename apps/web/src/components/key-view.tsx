"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { clearLlmKey, maskKey, setLlmKey, useLlmKey } from "@/lib/client/llm-key";
import { providerLabel, useProviders } from "@/lib/client/providers";
import { useTrial } from "@/lib/client/trial";
import type { ModelOption, ProviderId, VerifyResponse } from "@/lib/client/types";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { Button, Card, Field, Input, Notice, Select, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.key;

interface Verified {
  provider: ProviderId;
  key: string;
  models: ModelOption[];
  recommended: string | null;
}

export function KeyView() {
  const { llm, ready } = useLlmKey();
  const { providers } = useProviders();
  const { trial } = useTrial();
  const [provider, setProvider] = useState<ProviderId>("gemini");
  const [keyInput, setKeyInput] = useState("");
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Saving or removing the key removes the button that was pressed. Send focus
  // somewhere sensible instead of letting it fall to the top of the page.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    const el = document.getElementById(focusTarget);
    if (el) {
      el.focus();
      setFocusTarget(null);
    }
  });

  const selected = providers.find((p) => p.id === provider) ?? providers[0];
  // A check only counts for the exact provider and key it was run on.
  const canSave = Boolean(verified && verified.provider === provider && verified.key === keyInput.trim());

  const reset = () => {
    setVerified(null);
    setStatus(null);
    setFieldError(null);
  };

  const runCheck = async (p: ProviderId, key: string) => {
    setChecking(true);
    setStatus({ tone: "info", text: t.checking });
    try {
      const res = await api<VerifyResponse>("/api/keys/verify", { method: "POST", llmOverride: { provider: p, key } });
      if (res.ok) {
        setStatus({ tone: "ok", text: t.working(res.models.length) });
        return res;
      }
      setStatus({ tone: "danger", text: t.notWorking(res.message) });
    } catch (e) {
      setStatus({ tone: "danger", text: t.notWorking(e instanceof ApiError ? e.message : en.common.loadError) });
    } finally {
      setChecking(false);
    }
    return null;
  };

  const onCheck = async () => {
    const key = keyInput.trim();
    if (!key) {
      setFieldError(t.emptyKey);
      return;
    }
    setFieldError(null);
    setVerified(null);
    const res = await runCheck(provider, key);
    if (res) {
      setVerified({ provider, key, models: res.models, recommended: res.recommended });
      setModel(res.recommended ?? res.models[0]?.id ?? "");
    }
  };

  const onSave = () => {
    if (!verified || !canSave || !model) return;
    setLlmKey({ provider: verified.provider, key: verified.key, model, verifiedAt: new Date().toISOString() });
    setKeyInput("");
    setVerified(null);
    setShow(false);
    setStatus({ tone: "ok", text: t.saved });
    setFocusTarget("saved-key-title");
  };

  const onCheckSaved = async () => {
    if (!llm) return;
    const res = await runCheck(llm.provider, llm.key);
    if (res) setLlmKey({ ...llm, verifiedAt: new Date().toISOString() });
  };

  const onRemove = () => {
    clearLlmKey();
    reset();
    setStatus({ tone: "info", text: t.removedNote });
    setFocusTarget("provider");
  };

  return (
    <div className="space-y-8">
      <div className="max-w-[65ch] space-y-3">
        <p className="text-lg">{t.intro}</p>
        <p className="text-muted">{t.freeNote}</p>
      </div>

      {ready && !llm && trial?.available ? (
        <Card className="space-y-2" aria-labelledby="trial-title">
          <h2 id="trial-title" className="font-heading text-2xl font-semibold">
            {en.trial.keyTitle}
          </h2>
          <p>{en.trial.keyBody}</p>
          <p className="font-medium">{trial.verified ? en.trial.left(trial.tailoringsLeft, trial.uploadsLeft) : en.trial.notVerified}</p>
        </Card>
      ) : null}

      {ready && llm ? (
        <Card className="space-y-4" aria-labelledby="saved-key-title">
          <h2 id="saved-key-title" tabIndex={-1} className="font-heading text-2xl font-semibold">
            {t.savedTitle}
          </h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">{t.savedProvider}</dt>
            <dd>{providerLabel(llm.provider, providers)}</dd>
            <dt className="font-semibold">{t.savedModel}</dt>
            <dd>{llm.model}</dd>
            <dt className="font-semibold">{t.savedKey}</dt>
            <dd className="font-mono">{maskKey(llm.key)}</dd>
          </dl>
          <p className="text-sm text-muted">{t.savedChecked(formatDate(llm.verifiedAt, true))}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onCheckSaved} loading={checking}>
              {checking ? <Spinner /> : null}
              {t.checkAgain}
            </Button>
            <Button variant="danger" onClick={onRemove} loading={checking}>
              {t.removeKey}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-5" aria-labelledby="key-form-title">
        <h2 id="key-form-title" className="font-heading text-2xl font-semibold">
          {llm ? t.replaceTitle : t.title}
        </h2>

        <Field id="provider" label={t.providerLabel}>
          {(f) => (
            <Select
              id={f.id}
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as ProviderId);
                reset();
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {selected.keyUrl ? (
          <p>
            <a
              href={selected.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block min-h-8 py-1 text-brand underline underline-offset-4"
            >
              {t.getKey(selected.label)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ) : null}

        <Field id="llm-key" label={t.keyLabel} hint={selected.keyHint ? `${t.keyHelp} ${selected.keyHint}.` : t.keyHelp} error={fieldError}>
          {(f) => (
            <div className="flex gap-2">
              <Input
                id={f.id}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={keyInput}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid || undefined}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  reset();
                }}
              />
              <Button variant="secondary" onClick={() => setShow((v) => !v)} className="shrink-0">
                {show ? <EyeOffIcon /> : <EyeIcon />}
                {show ? t.hide : t.show}
              </Button>
            </div>
          )}
        </Field>

        <Button id="check-key" onClick={onCheck} loading={checking}>
          {checking ? <Spinner /> : null}
          {t.check}
        </Button>

        <div role="status" aria-live="polite">
          {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
        </div>

        {verified && canSave ? (
          <div className="space-y-4 border-t border-line pt-5">
            <Field id="model" label={t.modelLabel}>
              {(f) => (
                <Select id={f.id} value={model} onChange={(e) => setModel(e.target.value)}>
                  {verified.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.id === verified.recommended ? ` (${t.modelRecommended})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button id="save-key" onClick={onSave} disabled={!model}>
              {t.saveButton}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">{t.keyRequiredHint}</p>
        )}
      </Card>
    </div>
  );
}
