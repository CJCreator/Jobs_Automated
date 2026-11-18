import { LlmError, verifyKey } from "@/lib/llm/index.mjs";
import { json, route } from "@/lib/server/http";
import { readLlmHeaders } from "@/lib/server/llm-key";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

// A key that does not work is an answer, not a failure: 200 with ok: false.
export const POST = route("keys.verify", async (req, { state }) => {
  const userId = await requireUser(state);
  takeRateLimit("ai", userId);
  try {
    const { provider, key } = readLlmHeaders(req);
    const { models, recommended } = await verifyKey({ provider, key });
    return json({ ok: true, models, recommended });
  } catch (err) {
    if (err instanceof LlmError) return json({ ok: false, code: err.code, message: err.message });
    throw err;
  }
});
