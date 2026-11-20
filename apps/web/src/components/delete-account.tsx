"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { clearLlmKey } from "@/lib/client/llm-key";
import { Button, Card, Field, Input, Notice, Spinner } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.privacy;

export function DeleteAccount({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: true }>("/api/account", { method: "DELETE" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.deleteFailed);
      setBusy(false);
      return;
    }
    clearLlmKey();
    // The account is gone; this clears the session cookie and goes home.
    await signOutAction();
  };

  return (
    <Card className="space-y-4 border-danger" aria-labelledby="delete-title">
      <h2 id="delete-title" className="font-heading text-2xl font-semibold">
        {t.deleteTitle}
      </h2>
      <p className="max-w-[65ch]">{t.deleteBody}</p>
      <Field id="delete-confirm" label={t.deleteLabel}>
        {(f) => (
          <Input
            id={f.id}
            value={typed}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="max-w-xs"
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
          />
        )}
      </Field>
      <Button variant="danger" onClick={onDelete} disabled={typed !== t.deleteWord} loading={busy}>
        {busy ? <Spinner /> : null}
        {busy ? t.deleting : t.deleteButton}
      </Button>
      <div role="status" aria-live="polite">
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Card>
  );
}
