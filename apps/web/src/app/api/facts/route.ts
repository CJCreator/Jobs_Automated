import { getDb } from "@/lib/db/index.mjs";
import { changeFacts, getFacts } from "@/lib/db/repo.mjs";
import { MAX_FACT_BASE_CHARS, confirmationCounts, factBaseText } from "@/lib/facts.mjs";
import { readJsonObject } from "@/lib/server/body";
import { applyFactsEdit, parseRemovals } from "@/lib/server/facts-edit.mjs";
import { HttpError, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

export const GET = route("facts.get", async (_req, { state }) => {
  const userId = await requireUser(state);
  const facts = await getFacts(await getDb(), userId);
  return json({ facts, counts: confirmationCounts(facts) });
});

// The user's own edited copy: confirmations in it are trusted, everything
// else is coerced into shape by normalizeFacts. The "can't confirm" list is
// the stored one (see facts-edit.mjs); entries leave it only when named in
// `removeCannotConfirm`. Read and write happen under one row lock, so a review
// action running at the same moment is never overwritten.
export const PUT = route("facts.put", async (req, { state }) => {
  const userId = await requireUser(state);
  const body = await readJsonObject(req);
  if (!body.facts || typeof body.facts !== "object" || Array.isArray(body.facts)) {
    throw new HttpError(400, "invalid_facts", "There were no facts to save.");
  }
  const removals = parseRemovals(body.removeCannotConfirm);
  if (!removals) {
    throw new HttpError(400, "invalid_removals", "The list of claims to remove could not be read.");
  }
  const incoming = body.facts;
  // Refused inside the transaction, so nothing is written. The gate runs against these facts on every
  // read and export, so their confirmed text has a size cap.
  const facts = await changeFacts(await getDb(), userId, (stored) => {
    const next = applyFactsEdit(stored, incoming, removals);
    const size = factBaseText(next).length;
    if (size > MAX_FACT_BASE_CHARS) {
      const n = (v: number) => v.toLocaleString("en-US");
      throw new HttpError(
        400,
        "facts_too_large",
        `Your confirmed facts are too long to check (yours is ${n(size)}; the limit is ${n(MAX_FACT_BASE_CHARS)} characters of confirmed text). Remove or unconfirm some items, then save again.`,
      );
    }
    return next;
  });
  return json({ facts, counts: confirmationCounts(facts) });
});
