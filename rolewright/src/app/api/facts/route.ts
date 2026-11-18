import { getDb } from "@/lib/db/index.mjs";
import { getFacts, saveFacts } from "@/lib/db/repo.mjs";
import { confirmationCounts, normalizeFacts } from "@/lib/facts.mjs";
import { readJsonObject } from "@/lib/server/body";
import { HttpError, json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

export const GET = route("facts.get", async (_req, { state }) => {
  const userId = await requireUser(state);
  const facts = await getFacts(await getDb(), userId);
  return json({ facts, counts: confirmationCounts(facts) });
});

// The user's own edited copy: confirmations in it are trusted, everything
// else is coerced into shape by normalizeFacts.
export const PUT = route("facts.put", async (req, { state }) => {
  const userId = await requireUser(state);
  const body = await readJsonObject(req);
  if (!body.facts || typeof body.facts !== "object" || Array.isArray(body.facts)) {
    throw new HttpError(400, "invalid_facts", "There were no facts to save.");
  }
  const facts = normalizeFacts(body.facts, { trustConfirmed: true });
  await saveFacts(await getDb(), userId, facts);
  return json({ facts, counts: confirmationCounts(facts) });
});
