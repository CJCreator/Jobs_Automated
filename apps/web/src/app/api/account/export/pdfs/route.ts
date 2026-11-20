import { getDb } from "@/lib/db/index.mjs";
import { getFacts, getTailoring, listTailorings } from "@/lib/db/repo.mjs";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { HttpError, route } from "@/lib/server/http";
import { buildPdfBundle } from "@/lib/server/pdf-bundle.mjs";
import { renderPdf } from "@/lib/server/pdf.mjs";
import { chargeGate, spendRateLimit, takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

// POST, so the same-origin check in route() applies. The export bucket is charged once up
// front and then once more for every PDF rendered beyond the first (in `finally`, so a 413
// after many renders still pays), so a bundle costs what the same PDFs exported one by one
// would. Gate time is charged to gateMs per tailoring.
export const POST = route("account.export_pdfs", async (_req, { state }) => {
  const userId = await requireUser(state);
  // The export bucket is taken last, so a refusal by another bucket does not burn one of its 20 an hour.
  await takeRateLimit("tailoring", userId);
  await takeRateLimit("gateMs", userId);
  await takeRateLimit("export", userId);
  const db = await getDb();
  const engineGate = await loadFactGate();
  const facts = await getFacts(db, userId);
  let bundle;
  let renders = 0;
  try {
    bundle = await buildPdfBundle({
      listIds: async () => (await listTailorings(db, userId)).map((t: { id: string }) => t.id),
      load: (id: string) => getTailoring(db, userId, id),
      facts,
      engineGate,
      runGate: (fn: () => unknown) => chargeGate(userId, (timed) => timed(fn)),
      render: (html: string) => { renders++; return renderPdf(html); },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "BundleError") {
      throw new HttpError((e as Error & { status: number }).status, (e as Error & { code: string }).code, e.message);
    }
    throw e;
  } finally {
    if (renders > 1) await spendRateLimit("export", userId, renders - 1).catch(() => {});
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(bundle.zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="rolewright-resumes-${day}.zip"`,
      "Content-Length": String(bundle.zip.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
