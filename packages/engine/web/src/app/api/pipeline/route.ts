import { pipelineSummary, careerOpsRoot } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exposes the user's pipeline (inbox + tracker) to the client.
// Supports fast indexed filtering via SQLite query parameters (?status=...&search=...&stats=true).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const minScoreParam = url.searchParams.get("minScore");
  const statsOnly = url.searchParams.get("stats") === "true";

  if (search || status || minScoreParam || statsOnly) {
    try {
      const codeRoot = resolveCodeRoot(process.cwd(), process.env);
      const projectorPath = path.join(codeRoot, "lib/storage/markdown-projector.mjs");
      if (fs.existsSync(projectorPath)) {
        const { MarkdownProjector } = await import(
          /* webpackIgnore: true */ pathToFileURL(projectorPath).href
        );
        const projector = new MarkdownProjector({ dataRoot: careerOpsRoot() });
        if (statsOnly) {
          return Response.json(projector.getPipelineSummary());
        }
        const minScore = minScoreParam ? parseFloat(minScoreParam) : undefined;
        const rows = projector.queryApplications({
          search: search || undefined,
          status: status || undefined,
          minScore,
        });
        return Response.json({
          count: rows.length,
          applications: rows,
        });
      }
    } catch {
      // fallback to full summary below
    }
  }

  const s = pipelineSummary();
  return Response.json({
    inbox: s.inbox,
    applications: s.applications,
    root: s.root,
    rootExists: s.rootExists,
  });
}
