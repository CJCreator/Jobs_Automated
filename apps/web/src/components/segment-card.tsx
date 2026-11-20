"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, buttonClass, Card, Notice } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.segment;

type Segment = "fresher" | "experienced" | "switcher";
const IDS: Segment[] = ["fresher", "experienced", "switcher"];
interface ProfileResponse {
  segment: Segment | null;
}

export function SegmentCard() {
  const [saved, setSaved] = useState<Segment | null>(null);
  const [picked, setPicked] = useState<Segment | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<ProfileResponse>("/api/profile", { signal: controller.signal })
      .then((d) => {
        setSaved(d.segment);
        setPicked(d.segment);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage({ tone: "info", text: t.loadFailed });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const save = async (next: Segment | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const d = await api<ProfileResponse>("/api/profile", { method: "PUT", json: { segment: next } });
      setSaved(d.segment);
      setPicked(d.segment);
      setEditing(false);
      setMessage({ tone: "info", text: d.segment ? t.saved : t.cleared });
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof ApiError ? e.message : t.failed });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  const showTip = saved && !editing;

  return (
    <Card className="space-y-4" aria-labelledby="segment-title">
      {showTip ? (
        <div className="space-y-3">
          <h2 id="segment-title" className="font-heading text-xl font-semibold">
            {t.yours}: {t.options[saved].label}
          </h2>
          <p className="max-w-[65ch]">{t.tips[saved]}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/app/resume" className={buttonClass("primary")}>
              {t.tipLink}
            </Link>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t.change}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (picked) void save(picked);
          }}
        >
          <fieldset className="space-y-3">
            <legend id="segment-title" className="font-heading text-xl font-semibold">
              {t.title}
            </legend>
            <p className="text-sm text-muted">{t.hint}</p>
            {IDS.map((id) => (
              <label key={id} className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="segment"
                  value={id}
                  checked={picked === id}
                  onChange={() => setPicked(id)}
                  disabled={busy}
                  className="mt-1.5 size-4"
                />
                <span>
                  <span className="block font-medium">{t.options[id].label}</span>
                  <span className="block text-sm text-muted">{t.options[id].detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!picked} loading={busy}>
              {busy ? t.saving : t.save}
            </Button>
            {saved ? (
              <Button variant="secondary" onClick={() => void save(null)} disabled={busy}>
                {t.clear}
              </Button>
            ) : null}
          </div>
        </form>
      )}
      <div role="status" aria-live="polite">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </div>
    </Card>
  );
}
