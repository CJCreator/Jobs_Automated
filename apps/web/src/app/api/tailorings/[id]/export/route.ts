import { getDb } from "@/lib/db/index.mjs";
import { getFacts, getTailoring } from "@/lib/db/repo.mjs";
import { buildResume } from "@/lib/facts.mjs";
import { resumeFilename, resumeHtml } from "@/lib/resume-html.mjs";
import { loadFactGate } from "@/lib/server/engine.mjs";
import { HttpError, route } from "@/lib/server/http";
import { renderPdf } from "@/lib/server/pdf.mjs";
import { chargeGate, takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { track } from "@/lib/server/track.mjs";
import { flattenBlockers, notFound } from "@/lib/server/views";
import { exportBlockers } from "@/lib/tailoring.mjs";
import { coverageFor } from "../coverage/coverage-for.mjs";

export const runtime = "nodejs";

const percent = (c: { covered: number; total: number }) => Math.round((c.covered / c.total) * 100);

export const POST = route<{ id: string }>("tailorings.export", async (_req, { params, state }) => {
  const userId = await requireUser(state);
  // The export bucket is taken last, so a refusal by another bucket does not burn one of its 20 an hour.
  await takeRateLimit("tailoring", userId);
  await takeRateLimit("gateMs", userId);
  await takeRateLimit("export", userId);
  const { id } = await params;
  const db = await getDb();
  const tailoring = await getTailoring(db, userId, id);
  if (!tailoring) throw notFound();
  const engineGate = await loadFactGate();
  const facts = await getFacts(db, userId);

  // Every changed line is checked again here, from scratch, against the facts
  // as they are now. Stored checks and decisions alone never let text through.
  const blockers = await chargeGate(userId, (timed) =>
    timed(() => exportBlockers(facts, tailoring.suggestions, { jdText: tailoring.jdText ?? "", engineGate })),
  );
  if (blockers.length === 1 && blockers[0].issues.length === 1 && blockers[0].issues[0].kind === "facts_too_large") {
    await track(userId, "export_blocked", { reason: "facts_too_large" });
    throw new HttpError(409, "facts_too_large", blockers[0].issues[0].message);
  }
  if (blockers.length) {
    await track(userId, "export_blocked", { reason: "fact_gate" });
    throw new HttpError(
      409,
      "blocked",
      "Some accepted changes say things that are not in your confirmed facts. Edit or reject them, then export again.",
      { issues: flattenBlockers(blockers) },
    );
  }

  const { resume } = buildResume(facts, tailoring.suggestions);
  if (!resume.contact && !resume.summary && !resume.experience.length && !resume.education.length && !resume.skills.length) {
    await track(userId, "export_blocked", { reason: "nothing_confirmed" });
    throw new HttpError(409, "nothing_confirmed", "Confirm your facts before exporting a resume.");
  }
  const pdf = await renderPdf(resumeHtml(resume));
  // Coverage is for information only; a failure here never changes the export.
  const props: { coverage_before?: number; coverage_after?: number } = {};
  try {
    const { before, after } = coverageFor(facts, tailoring.suggestions, tailoring.jdText ?? "");
    if (before.total > 0) {
      props.coverage_before = percent(before);
      props.coverage_after = percent(after);
    }
  } catch {
    // A RangeError means the resume is over the keyword port's cap: leave the percentages out.
  }
  await track(userId, "export_succeeded", props);
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
