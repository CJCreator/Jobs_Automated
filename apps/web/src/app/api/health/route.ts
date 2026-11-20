import { getDb } from "@/lib/db/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const TTL_MS = 5_000;

// One probe at a time, and its answer reused for a few seconds, so a flood of
// unauthenticated requests costs at most one pooled query per window.
let cached: { ok: boolean; at: number } | null = null;
let inFlight: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.system.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function healthy(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ok;
  if (!inFlight) {
    inFlight = probe().then((ok) => {
      cached = { ok, at: Date.now() };
      inFlight = null;
      return ok;
    });
  }
  return inFlight;
}

// Liveness and start-up probe for the host. No session. It answers only whether
// the database opened (including the start-up role check) and answers a query;
// it never says why not, so a probe cannot learn the role problem or any error text.
export async function GET(): Promise<Response> {
  const ok = await healthy();
  return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 503, headers: HEADERS });
}
