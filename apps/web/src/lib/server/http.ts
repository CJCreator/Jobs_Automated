// One wrapper for every API route: same-origin check on state changes,
// `Cache-Control: no-store` on every response (they all carry personal data),
// the `{ error: { code, message } }` shape, and one log line per failure.
//
// The log line names the route, method, status, error code and user id, and
// nothing else: never a body, resume text, job description, prompt, model
// output, email address, key or an error's message (which can echo any of them).

import { LlmError } from "@/lib/llm/index.mjs";
import { errorLabel } from "./log-label.mjs";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown> | undefined;
  readonly headers: Record<string, string> | undefined;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.headers = headers;
  }
}

const LLM_STATUS: Record<string, number> = {
  invalid_key: 401,
  rate_limited: 429,
  quota: 402,
  model_not_found: 400,
  refused: 422,
  bad_response: 502,
  provider_error: 502,
  network: 504,
  not_allowed: 400,
};

/** Errors from the plain .mjs modules carry `status` and `code` but are not HttpErrors. */
type StatusError = Error & { status: number; code: string };
const SAFE_NAMES = new Set(["TailoringError", "PdfTextError", "PdfRenderError", "EngineUnavailableError", "RateLimitUnavailableError"]);
const isStatusError = (e: unknown): e is StatusError =>
  e instanceof Error && SAFE_NAMES.has(e.name) && typeof (e as StatusError).status === "number" && typeof (e as StatusError).code === "string";

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}

function errorJson(status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: Record<string, string>) {
  return json({ ...extra, error: { code, message } }, status, headers);
}

/** Map anything thrown by a handler to a response, without exposing its internals. */
function toResponse(err: unknown): { res: Response; code: string } {
  if (err instanceof HttpError) {
    return { res: errorJson(err.status, err.code, err.message, err.extra, err.headers), code: err.code };
  }
  if (err instanceof LlmError) {
    // LlmError messages are written by us and never carry provider text or the key.
    const status = LLM_STATUS[err.code] ?? 502;
    return { res: errorJson(status, err.code, err.message), code: err.code };
  }
  if (isStatusError(err)) {
    return { res: errorJson(err.status, err.code, err.message), code: err.code };
  }
  return { res: errorJson(500, "internal", "Something went wrong on our side. Try again."), code: "internal" };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Refuse a state change sent from another site. The session cookie is
 * SameSite=Lax already; this is the second lock.
 */
export function assertSameOrigin(req: Request): void {
  if (!MUTATING.has(req.method)) return;
  const refuse = () => new HttpError(403, "cross_site", "This request came from another website, so it was refused.");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw refuse();
  const origin = req.headers.get("origin");
  if (origin === null) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw refuse();
  }
  const own = [req.headers.get("x-forwarded-host")?.split(",")[0]?.trim(), req.headers.get("host")]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.toLowerCase());
  if (!own.includes(originHost)) throw refuse();
}

/** The same response with `Cache-Control: no-store`, copied if its headers are immutable. */
export function withNoStore(res: Response): Response {
  try {
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

export type RouteState = { userId: string | null };
type Params = Record<string, string | string[] | undefined>;
type Handler<P extends Params> = (req: Request, ctx: { params: Promise<P>; state: RouteState }) => Promise<Response>;

/**
 * Wrap a route handler.
 * @param name a fixed label for logs, e.g. "tailorings.patch"
 */
export function route<P extends Params = Record<string, never>>(name: string, handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const state: RouteState = { userId: null };
    let res: Response;
    let code = "";
    let cause = "";
    try {
      assertSameOrigin(req);
      res = await handler(req, { params: ctx?.params ?? Promise.resolve({} as P), state });
    } catch (err) {
      ({ res, code } = toResponse(err));
      if (code === "internal") cause = errorLabel(err);
    }
    res = withNoStore(res);
    if (res.status >= 400) {
      console.warn(`[rolewright] ${name} ${req.method} ${res.status} ${code || "error"} user=${state.userId ?? "-"}${cause}`);
    }
    return res;
  };
}
