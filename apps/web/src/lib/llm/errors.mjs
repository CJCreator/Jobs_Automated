// Errors for the AI layer. Messages are plain words and never carry text from
// a provider's response: a provider can echo the key or the user's resume back.

export class LlmError extends Error {
  /**
   * @param {"invalid_key"|"rate_limited"|"quota"|"model_not_found"|"refused"|"bad_response"|"provider_error"|"network"|"not_allowed"} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.status = status;
  }
}

/** Remove a secret (and its URL-encoded form) from text before it is shown or logged. */
export function scrub(text, secret) {
  let out = String(text ?? "");
  if (typeof secret === "string" && secret.length >= 4) {
    for (const s of new Set([secret, encodeURIComponent(secret)])) out = out.split(s).join("[key removed]");
  }
  return out;
}

/** Show enough of a key to recognise it, never enough to use it. */
export function maskKey(key) {
  const k = typeof key === "string" ? key : "";
  if (k.length < 12) return "••••";
  return `${k.slice(0, 3)}••••${k.slice(-4)}`;
}

/** Map an HTTP status to a plain-words error. */
export function errorForStatus(status, providerLabel = "The provider", reportedStatus = status) {
  switch (status) {
    case 401:
    case 403:
      return new LlmError("invalid_key", `${providerLabel} did not accept this key. Check that you copied the whole key.`, status);
    case 402:
      return new LlmError("quota", `${providerLabel} says this key has no quota or credit left. Add credit, wait for the quota to reset, or use another key.`, reportedStatus);
    case 404:
      return new LlmError("model_not_found", `${providerLabel} does not have that model. Pick another one from the list.`, status);
    case 429:
      return new LlmError("rate_limited", `${providerLabel} is limiting requests on this key. Wait a minute and try again.`, status);
    default:
      if (status >= 500) return new LlmError("provider_error", `${providerLabel} had a problem on its side. Try again shortly.`, status);
      return new LlmError("provider_error", `${providerLabel} could not process the request.`, status);
  }
}

/**
 * Map a failed Response. Like errorForStatus, but a Gemini 429 is a quota error
 * (not a rate limit) when its JSON body says error.status is RESOURCE_EXHAUSTED
 * with a QuotaFailure detail whose quota ids are present and none is per-minute or per-second. Only
 * those fixed fields are read; no text from the body is ever copied.
 */
export async function errorForResponse(res, providerLabel = "The provider") {
  if (res.status === 429) {
    try {
      const err = (await res.json())?.error;
      if (err?.status === "RESOURCE_EXHAUSTED" && Array.isArray(err.details)) {
        const failures = err.details.filter((d) => typeof d?.["@type"] === "string" && d["@type"].endsWith("google.rpc.QuotaFailure"));
        const violations = failures.flatMap((d) => (Array.isArray(d.violations) ? d.violations : []));
        const ids = violations.map((v) => v?.quotaId).filter((q) => typeof q === "string");
        if (ids.length > 0 && !ids.some((q) => /PerMinute|PerSecond/i.test(q))) return errorForStatus(402, providerLabel, 429);
      }
    } catch { /* body is not JSON: treat it as a plain rate limit */ }
  }
  return errorForStatus(res.status, providerLabel);
}

/** Find the first balanced {...} in text, skipping braces inside strings. */
function firstObject(text) {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1));
          if (v && typeof v === "object" && !Array.isArray(v)) return v;
        } catch { /* try the next opening brace */ }
        break;
      }
    }
  }
  return null;
}

/** Parse a model's reply into an object: plain JSON, a code fence, or JSON inside prose. */
export function parseJsonReply(text) {
  const raw = typeof text === "string" ? text : "";
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const found = firstObject(raw.trim()) ?? (fenced ? firstObject(fenced[1]) : null);
  if (!found) throw new LlmError("bad_response", "The AI did not return a usable answer. Try again.");
  return found;
}
