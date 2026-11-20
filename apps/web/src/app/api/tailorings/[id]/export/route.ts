import { getDb } from "@/lib/db/index.mjs";
import { getFacts, getTailoring } from "@/lib/db/repo.mjs";
import { buildResume } from "@/lib/facts.mjs";
import { resumeFilename, resumeHtml } from "@/lib/resume-html.mjs";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { HttpError, route } from "@/lib/server/http";
import { renderPdf } from "@/lib/server/pdf.mjs";
import { spendRateLimit, takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { flattenBlockers, notFound } from "@/lib/server/views";
import { exportBlockers } from "@/lib/tailoring.mjs";

export const runtime = "nodejs";

export const POST = route<{ id: string }>("tailorings.export", async (_req, { params, state }) => {
  const userId = await requireUser(state);
  await takeRateLimit("export", userId);
  await takeRateLimit("tailoring", userId);
  await takeRateLimit("gateMs", userId);
  const { id } = await params;
  const db = await getDb();
  const tailoring = await getTailoring(db, userId, id);
  if (!tailoring) throw notFound();
  const engineGate = await loadFactGate();
  const facts = await getFacts(db, userId);

  // Every changed line is checked again here, from scratch, against the facts
  // as they are now. Stored checks and decisions alone never let text through.
  const gateStart = performance.now();
  const blockers = exportBlockers(facts, tailoring.suggestions, { jdText: tailoring.jdText ?? "", engineGate });
  await spendRateLimit("gateMs", userId, Math.round(performance.now() - gateStart));
  if (blockers.length === 1 && blockers[0].issues.length === 1 && blockers[0].issues[0].kind === "facts_too_large") {
    throw new HttpError(409, "facts_too_large", blockers[0].issues[0].message);
  }
  if (blockers.length) {
    throw new HttpError(
      409,
      "blocked",
      "Some accepted changes say things that are not in your confirmed facts. Edit or reject them, then export again.",
      { issues: flattenBlockers(blockers) },
    );
  }

  const { resume } = buildResume(facts, tailoring.suggestions);
  if (!resume.contact && !resume.summary && !resume.experience.length && !resume.education.length && !resume.skills.length) {
    throw new HttpError(409, "nothing_confirmed", "Confirm your facts before exporting a resume.");
  }
  const pdf = await renderPdf(resumeHtml(resume));
  const filename = resumeFilename(resume.contact?.name, tailoring.company);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
