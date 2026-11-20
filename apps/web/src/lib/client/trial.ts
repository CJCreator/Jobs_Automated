"use client";

// The free trial, seen from the browser. The trial sends `x-llm-provider: trial` and no key:
// our own keys exist only on the server and never reach this code.

import { ApiError } from "./api";
import { useApi, type ApiState } from "./use-api";

export interface TrialState {
  verified: boolean;
  tailoringsLeft: number;
  uploadsLeft: number;
  /** A trial provider is configured on this server. */
  available: boolean;
}

/** The signed-in user's trial status. A failed load reads as "no trial": the user can still add a key. */
export function useTrial(): { trial: TrialState | null; loading: boolean; reload: () => void } {
  const s: ApiState<TrialState> = useApi<TrialState>("/api/trial");
  return { trial: s.data, loading: s.loading, reload: s.reload };
}

/** True when this account can use the trial for one more run of the given kind. */
export function trialUsable(trial: TrialState | null, kind: "tailorings" | "uploads"): boolean {
  if (!trial || !trial.available || !trial.verified) return false;
  return (kind === "tailorings" ? trial.tailoringsLeft : trial.uploadsLeft) > 0;
}

/** POST to one of the AI routes on the trial: the same errors as `api`, the trial header, no key. */
export async function trialApi<T>(path: string, opts: { json?: unknown; form?: FormData }): Promise<T> {
  const headers: Record<string, string> = { "x-llm-provider": "trial" };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError(0, "network", "Could not reach Rolewright. Check your connection and try again.");
  }
  if (!res.ok) {
    let code = "request_failed";
    let message = "Something went wrong. Try again.";
    try {
      const data = await res.json();
      if (data?.error?.code) code = String(data.error.code);
      if (data?.error?.message) message = String(data.error.message);
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
