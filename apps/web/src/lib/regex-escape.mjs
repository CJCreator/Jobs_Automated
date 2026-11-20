/**
 * Escape every regular-expression metacharacter (including the backslash) so a string can be
 * embedded in `new RegExp(...)` as a literal. Use this for any value that is not a constant.
 *
 * @param {string} s
 * @returns {string}
 */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
