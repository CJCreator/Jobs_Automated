// The user's AI key lives only in this page's memory (ADR 0003). It is never
// written to any browser storage, so a reload, a sign-out or deleting the
// account all forget it.

import { useSyncExternalStore } from "react";
import type { StoredLlmKey } from "./types";

// An older build kept the key under this name in localStorage.
const LEGACY_STORAGE_KEY = "rolewright.llm";

const listeners = new Set<() => void>();
let current: StoredLlmKey | null = null;
let owner: string | null = null;

function removeLegacyItem() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Blocked storage: nothing to remove.
  }
}
removeLegacyItem();

/** The key held in memory, or null. Returns the same object until it changes. */
export function getLlmKey(): StoredLlmKey | null {
  return current;
}

function emit() {
  listeners.forEach((l) => l());
}

/** Always true: holding it in memory cannot be refused. */
export function setLlmKey(value: StoredLlmKey): boolean {
  current = { provider: value.provider, key: value.key, model: value.model, verifiedAt: value.verifiedAt };
  emit();
  return true;
}

export function clearLlmKey(): void {
  current = null;
  emit();
}

/** Call with the signed-in email. When the owner changes, the previous owner's key is dropped. */
export function bindLlmKeyOwner(email: string): void {
  if (owner !== null && owner !== email) clearLlmKey();
  owner = email;
}

/** First 4 and last 4 characters, the rest hidden. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(8)}${key.slice(-4)}`;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const noopSubscribe = () => () => {};

/** `ready` is false during server render and the first client render. */
export function useLlmKey(): { llm: StoredLlmKey | null; ready: boolean } {
  const llm = useSyncExternalStore(subscribe, getLlmKey, () => null);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return { llm, ready };
}
