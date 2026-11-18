// Display names and key-issuing pages for the supported AI providers.
// The server owns the real provider list; this is only for labels and links.

import type { ProviderId } from "./types";

export const PROVIDER_OPTIONS: { id: ProviderId; label: string; keyUrl: string }[] = [
  { id: "gemini", label: "Gemini (Google)", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Claude (Anthropic)", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openrouter", label: "OpenRouter", keyUrl: "https://openrouter.ai/keys" },
  { id: "groq", label: "Groq", keyUrl: "https://console.groq.com/keys" },
];

export function providerLabel(id: string): string {
  return PROVIDER_OPTIONS.find((p) => p.id === id)?.label ?? id;
}
