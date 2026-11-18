// Word-level diff for showing a suggestion against the original line.
//
// Tokens are whitespace-separated words with their punctuation attached, plus
// the whitespace runs between them, so "₹12" and "30%," stay whole and the
// parts re-join to the exact original text.

/** @typedef {{ type: "same" | "add" | "remove", text: string }} DiffPart */

// Beyond this many token pairs the table gets large; fall back to a plain
// replacement rather than freezing the tab on a pathological input.
const MAX_CELLS = 4_000_000;

/** @param {string} s */
const tokenize = (s) => (s ?? "").split(/(\s+)/).filter((t) => t !== "");

/**
 * @param {string} before
 * @param {string} after
 * @returns {DiffPart[]}
 */
export function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length === 0 && b.length === 0) return [];

  /** @type {DiffPart[]} */
  const parts = [];
  const push = (type, text) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };

  if (a.length * b.length > MAX_CELLS) {
    push("remove", a.join(""));
    push("add", b.join(""));
    return parts;
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Within a changed block, removals are listed before additions so the reader
  // sees "old new" in that order.
  let removed = "";
  let added = "";
  const flush = () => {
    push("remove", removed);
    push("add", added);
    removed = "";
    added = "";
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      flush();
      push("same", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      removed += a[i++];
    } else {
      added += b[j++];
    }
  }
  while (i < a.length) removed += a[i++];
  while (j < b.length) added += b[j++];
  flush();
  return foldLoneSpaces(parts);
}

// A single space shared by two changed words ("old1 old2" vs "new1 new2") would
// otherwise split one replacement into two. Fold it into both sides so the
// replacement reads as one block; each side still re-joins exactly.
/** @param {DiffPart[]} parts */
function foldLoneSpaces(parts) {
  /** @type {DiffPart[]} */
  const out = [];
  let removed = "";
  let added = "";
  const flushBlock = () => {
    if (removed) out.push({ type: "remove", text: removed });
    if (added) out.push({ type: "add", text: added });
    removed = "";
    added = "";
  };
  parts.forEach((part, k) => {
    const next = parts[k + 1];
    if (part.type === "same" && /^\s+$/.test(part.text) && (removed || added) && next && next.type !== "same") {
      removed += part.text;
      added += part.text;
    } else if (part.type === "remove") removed += part.text;
    else if (part.type === "add") added += part.text;
    else {
      flushBlock();
      out.push(part);
    }
  });
  flushBlock();
  return out;
}
