import { getDb } from "@/lib/db/index.mjs";
import { exportUserData } from "@/lib/db/export.mjs";
import { route } from "@/lib/server/http";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

// POST, so the same-origin check in route() applies. The export bucket is shared with PDF export.
export const POST = route("account.export", async (_req, { state }) => {
  const userId = await requireUser(state);
  await takeRateLimit("export", userId);
  const data = await exportUserData(await getDb(), userId);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rolewright-data-${day}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
