import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { readJsonObject } from "@/lib/json-body";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

// POST /api/agents/run — Dispatches an end-to-end multi-agent evaluation workflow.
export async function POST(req: Request) {
  const body = await readJsonObject<{ url?: string; company?: string; role?: string; jdText?: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const codeRoot = resolveCodeRoot(process.cwd(), process.env);
  const supervisorModule = path.join(codeRoot, "agents/supervisor.mjs");

  if (!fs.existsSync(supervisorModule)) {
    return Response.json({ error: "Supervisor agent module not found" }, { status: 503 });
  }

  try {
    const { CareerOpsSupervisor } = await import(
      /* webpackIgnore: true */ pathToFileURL(supervisorModule).href
    );

    const supervisor = new CareerOpsSupervisor();

    const company = body.company || "Target Company";
    const role = body.role || "Software Engineer";
    const url = body.url || "https://example.com/jobs/role";
    const jdText = body.jdText || "";

    const result = await supervisor.processOpportunity({
      company,
      role,
      url,
      jdText,
    });

    return Response.json({
      ok: true,
      result,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

