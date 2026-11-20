import { getDb } from "@/lib/db/index.mjs";
import { status } from "@/lib/db/trial.mjs";
import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { trialConfig } from "@/lib/server/trial.mjs";

export const runtime = "nodejs";

// What the signed-in user has left of the free trial, and whether this server offers it.
// `available` says only that a trial provider is configured: no key, model or provider name leaves the server.
export const GET = route("trial.get", async (_req, { state }) => {
  const userId = await requireUser(state);
  const left = await status(await getDb(), userId);
  return json({ ...left, available: trialConfig(process.env).length > 0 });
});
