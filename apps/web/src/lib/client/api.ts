// Small typed fetch wrapper. The AI key is attached as headers on the AI routes
// only, and never appears in a URL, body or log.

import { getLlmKey } from "./llm-key";
import type { CheckIssue } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: CheckIssue[];
  constructor(status: number, code: string, message: string, issues: CheckIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

interface Options {
  method?: string;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** Overrides which key is sent (used when checking a key not yet saved). */
  llmOverride?: { provider: string; key: string; model?: string };
}

function isAiRoute(path: string, method: string): boolean {
  if (path === "/api/keys/verify") return true;
  if (method === "POST" && path === "/api/resume") return true;
  if (method === "POST" && path === "/api/tailorings") return true;
  return false;
}

function buildRequest(path: string, opts: Options): RequestInit {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  if (isAiRoute(path, method)) {
    const llm = opts.llmOverride ?? getLlmKey();
    if (!llm) throw new ApiError(0, "no_key", "Add your AI key first.");
    headers["x-llm-provider"] = llm.provider;
    headers["x-llm-key"] = llm.key;
    if (llm.model) headers["x-llm-model"] = llm.model;
  }
  return { method, headers, body, signal: opts.signal, credentials: "same-origin", cache: "no-store" };
}

async function toError(res: Response): Promise<ApiError> {
  let code = "request_failed";
  let message = "Something went wrong. Try again.";
  let issues: CheckIssue[] = [];
  try {
    const data = await res.json();
    if (data?.error?.code) code = String(data.error.code);
    if (data?.error?.message) message = String(data.error.message);
    const raw = data?.issues ?? data?.error?.issues;
    if (Array.isArray(raw)) issues = raw as CheckIssue[];
  } catch {
    // Body was not JSON; keep the generic message.
  }
  return new ApiError(res.status, code, message, issues);
}

async function send(path: string, opts: Options): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, buildRequest(path, opts));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "network", "Could not reach Rolewright. Check your connection and try again.");
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await send(path, opts);
  return (await res.json()) as T;
}

/** For the PDF export: returns the file and the server's suggested name. */
export async function apiBlob(path: string, opts: Options = {}): Promise<{ blob: Blob; filename: string | null }> {
  const res = await send(path, opts);
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  let filename: string | null = null;
  if (match) {
    try {
      filename = decodeURIComponent(match[1]);
    } catch {
      filename = match[1];
    }
  }
  return { blob: await res.blob(), filename };
}
