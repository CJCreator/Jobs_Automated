// The user's AI key lives only in this browser. Everything here tolerates
// blocked storage: reads fall back to "no key", writes report failure.

import { useSyncExternalStore } from "react";
import type { ProviderId, StoredLlmKey } from "./types";

const STORAGE_KEY = "rolewright.llm";
const PROVIDER_IDS: ProviderId[] = ["gemini", "openai", "anthropic", "openrouter", "groq"];

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: StoredLlmKey | null = null;

function parse(raw: string | null): StoredLlmKey | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredLlmKey>;
    if (
      v &&
      typeof v.key === "string" &&
      v.key &&
      typeof v.model === "string" &&
      typeof v.verifiedAt === "string" &&
      PROVIDER_IDS.includes(v.provider as ProviderId)
    ) {
      return { provider: v.provider as ProviderId, key: v.key, model: v.model, verifiedAt: v.verifiedAt };
    }
  } catch {
    // Corrupt value: treat as no key.
  }
  return null;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The saved key, or null. Returns the same object until storage changes. */
export function getLlmKey(): StoredLlmKey | null {
  if (typeof window === "undefined") return null;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function emit() {
  listeners.forEach((l) => l());
}

/** Returns false when the browser refused to store it. */
export function setLlmKey(value: StoredLlmKey): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    return false;
  }
  emit();
  return true;
}

export function clearLlmKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored that we could remove.
  }
  emit();
}

/** First 4 and last 4 characters, the rest hidden. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(8)}${key.slice(-4)}`;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const noopSubscribe = () => () => {};

/** `ready` is false during server render and the first client render. */
export function useLlmKey(): { llm: StoredLlmKey | null; ready: boolean } {
  const llm = useSyncExternalStore(subscribe, getLlmKey, () => null);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return { llm, ready };
}
