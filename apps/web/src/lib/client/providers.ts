// The server owns the provider list (GET /api/providers). The static list below
// is only the fallback while that request loads or if it fails; it never
// includes the development test provider.

import { useEffect, useState } from "react";
import { api } from "./api";
import type { ProviderOption } from "./types";

export const FALLBACK_PROVIDERS: ProviderOption[] = [
  { id: "gemini", label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", keyHint: "Starts with AIza" },
  { id: "openrouter", label: "OpenRouter", keyUrl: "https://openrouter.ai/keys", keyHint: "Starts with sk-or-" },
  { id: "anthropic", label: "Anthropic Claude", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "Starts with sk-ant-" },
];

let cached: ProviderOption[] | null = null;

/** The providers to offer: the server's list once it arrives, the fallback until then. */
export function useProviders(): { providers: ProviderOption[]; loaded: boolean } {
  const [providers, setProviders] = useState<ProviderOption[]>(cached ?? FALLBACK_PROVIDERS);
  const [loaded, setLoaded] = useState(cached !== null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ providers: ProviderOption[] }>("/api/providers", { signal: controller.signal })
      .then((res) => {
        if (!Array.isArray(res.providers) || res.providers.length === 0) return;
        cached = res.providers;
        setProviders(res.providers);
        setLoaded(true);
      })
      .catch(() => {
        // Keep the fallback list.
      });
    return () => controller.abort();
  }, []);

  return { providers, loaded };
}

export function providerLabel(id: string, list: ProviderOption[] = cached ?? FALLBACK_PROVIDERS): string {
  return list.find((p) => p.id === id)?.label ?? id;
}
