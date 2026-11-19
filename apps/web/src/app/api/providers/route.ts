import { PROVIDERS, isProviderAllowed } from "@/lib/llm/index.mjs";
import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

// The server owns the provider list. The test provider is added only when the
// development flag allows it, so it can never show up in production.
export const GET = route("providers.get", async (_req, { state }) => {
  await requireUser(state);
  const providers: { id: string; label: string; keyUrl: string; keyHint: string }[] = PROVIDERS.map((p: { id: string; label: string; keyUrl: string; keyHint: string }) => ({
    id: p.id,
    label: p.label,
    keyUrl: p.keyUrl,
    keyHint: p.keyHint,
  }));
  if (isProviderAllowed("mock")) {
    providers.push({ id: "mock", label: "Test provider (development only)", keyUrl: "", keyHint: "" });
  }
  return json({ providers }, 200, { "Cache-Control": "no-store" });
});
