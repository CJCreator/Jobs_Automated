// Request bodies, read with a hard size cap before anything parses them.

import { HttpError } from "./http";

export const MAX_JSON_BYTES = 1_000_000;

const tooLarge = (what: string) => new HttpError(413, "too_large", `${what} is too large.`);

/** Read the raw body, refusing it as soon as it passes `max` bytes. */
export async function readBodyBytes(req: Request, max: number, what = "The request"): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) throw tooLarge(what);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw tooLarge(what);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * A JSON object body, at most 1 MB. Requiring the JSON content type also
 * means a plain cross-site form post can never reach a JSON route.
 */
export async function readJsonObject(req: Request, max = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
    throw new HttpError(415, "unsupported_type", "Send the request as JSON.");
  }
  const bytes = await readBodyBytes(req, max);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "bad_json", "The request could not be read.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "bad_json", "The request could not be read.");
  }
  return value as Record<string, unknown>;
}
