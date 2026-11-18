// What a failure log line may say about an unexpected error.
//
// Plain .mjs so it can be unit-tested: this is the one place an error from any
// library (a database driver, an AI SDK) gets near a log line.

/**
 * A safe label for an unexpected error: its class name and a short code, never
 * its message (which can echo a request, a query, resume text or a key).
 *
 * Only system-style codes are kept, such as Node's ECONNREFUSED or a Postgres
 * SQLSTATE like 42P01: a library is free to put anything in `code`, and a short
 * mixed-case or hyphenated string could be part of a key.
 *
 * @param {unknown} err
 * @returns {string} "" or " cause=<Name>[/<CODE>]"
 */
export function errorLabel(err) {
  if (!(err instanceof Error)) return "";
  const code = /** @type {{ code?: unknown }} */ (err).code;
  const safeCode = typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? `/${code}` : "";
  const name = String(err.name).replace(/[^\w]/g, "").slice(0, 40);
  return ` cause=${name}${safeCode}`;
}
