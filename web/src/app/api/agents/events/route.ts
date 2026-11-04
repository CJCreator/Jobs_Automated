import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agents/events — Returns recent agent blackboard events.
export async function GET(req: Request) {
  const codeRoot = resolveCodeRoot(process.cwd(), process.env);
  const eventsModule = path.join(codeRoot, "lib/agent-events.mjs");

  if (!fs.existsSync(eventsModule)) {
    return Response.json({ events: [] });
  }

  try {
    const { readAgentEvents } = await import(
      /* webpackIgnore: true */ pathToFileURL(eventsModule).href
    );

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const agent = url.searchParams.get("agent") || undefined;
    const type = url.searchParams.get("type") || undefined;

    const events = readAgentEvents({ limit, agent, type });
    return Response.json({ events });
  } catch (err: any) {
    return Response.json({ error: err.message, events: [] }, { status: 500 });
  }
}

