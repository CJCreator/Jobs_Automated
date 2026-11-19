import { pipelineSummary } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exposes the user's pipeline (inbox + tracker) to the client.
// Errors are returned as HTTP 500 with an explicit `error` field; they are never
// replaced with unfiltered data.
export async function GET() {
  try {
    const s = pipelineSummary();
    return Response.json({
      inbox: s.inbox,
      applications: s.applications,
      root: s.root,
      rootExists: s.rootExists,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "pipeline_unavailable", message }, { status: 500 });
  }
}
