import { getDb } from "@/lib/db/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

// Liveness and start-up probe for the host. No session. It answers only whether
// the database opened (including the start-up role check) and answers a query;
// it never says why not, so a probe cannot learn the role problem or any error text.
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    await db.system.query("SELECT 1");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: HEADERS });
  }
}
