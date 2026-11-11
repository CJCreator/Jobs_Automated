import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { canonicalizeStatus } from "@/lib/core/states";
import { trackerRowArg } from "@/lib/status-cli.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";

// Writeback: UPDATE the status cell of an EXISTING tracker row in-process.
// Uses executeSetStatus from lib/services/tracker-service.mjs.
// Holds the shared tracker lock across the read-modify-write, validates state,
// appends to status-log.tsv, and fires hooks (JD archive, follow-up seed).

const EXIT_TO_HTTP: Record<number, number> = { 2: 404, 3: 409, 4: 503 };
const CLIENT_ERROR_CODES = new Set(["usage", "invalid-state", "undo-unknown-prior", "not-found", "ambiguous"]);
const GENERIC_FAILURE = "status update failed";
// The in-process write holds the tracker lock; a request that waits longer than
// this is answered 504 instead of hanging the browser. The write itself is not
// cancelled and may still complete after the response.
const STATUS_TIMEOUT_MS = 30_000;

type TrackerServiceModule = {
  executeSetStatus: (options: Record<string, unknown>) => Promise<{ newStatus?: string; changed?: boolean; statusLogged?: boolean }>;
  TrackerServiceError: new (...args: never[]) => Error & { code?: string; exitCode?: number };
};

class StatusTimeoutError extends Error {}

export async function POST(req: Request) {
  const body = await readJsonObject<{ n?: string; status?: string; undo?: boolean }>(req);
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });
  const { n, status } = body;

  if (body.undo === true) return writeStatus(n, null);
  if (!n || typeof status !== "string" || !status.trim()) {
    return Response.json({ error: "n and status required" }, { status: 400 });
  }

  if (/[|\r\n*]/.test(status)) {
    return Response.json({ error: "invalid status (table-breaking characters)" }, { status: 400 });
  }

  const canon = canonicalizeStatus(status);
  if (!canon) {
    return Response.json({ error: `not a canonical status: ${status}` }, { status: 400 });
  }
  return writeStatus(n, canon);
}

async function writeStatus(n: unknown, canon: string | null) {
  const row = trackerRowArg(n);
  if (!row) {
    return Response.json({ error: "n must be a tracker row number" }, { status: 400 });
  }

  const codeRoot = resolveCodeRoot(process.cwd(), process.env);
  const serviceFile = path.join(codeRoot, "lib/services/tracker-service.mjs");
  if (!fs.existsSync(serviceFile)) {
    return Response.json(
      {
        error: "status updates need the career-ops scripts; this root has data only",
        code: "core-script-missing",
      },
      { status: 503 },
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let service: TrackerServiceModule | null = null;
  try {
    service = (await import(
      /* webpackIgnore: true */ pathToFileURL(serviceFile).href
    )) as TrackerServiceModule;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StatusTimeoutError("status update timed out")), STATUS_TIMEOUT_MS);
    });
    const result = await Promise.race([
      service.executeSetStatus({
        row,
        state: canon,
        undo: !canon,
        source: "web",
        detachJdArchive: true,
        codeRoot,
        dataRoot: careerOpsRoot(),
      }),
      timeout,
    ]);

    return Response.json({
      ok: true,
      status: canon ?? result.newStatus,
      changed: result.changed === true,
      statusLogged: result.statusLogged === true,
    });
  } catch (err: unknown) {
    if (err instanceof StatusTimeoutError) {
      console.error("[api/status] in-process status update exceeded the timeout");
      return Response.json({ error: "status update timed out", code: "timeout" }, { status: 504 });
    }

    // Only the service's own errors carry a message fit for the caller. Anything
    // else (filesystem paths, stack detail) is logged server-side and replaced.
    const ServiceError = service?.TrackerServiceError;
    if (ServiceError && err instanceof ServiceError) {
      const exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
      const errCode = typeof err.code === "string" ? err.code : "error";
      const httpStatus =
        exitCode === 1
          ? (CLIENT_ERROR_CODES.has(errCode) ? 400 : 500)
          : (EXIT_TO_HTTP[exitCode] ?? 500);

      return Response.json(
        { error: err.message || GENERIC_FAILURE, code: errCode },
        {
          status: httpStatus,
          ...(httpStatus === 503 ? { headers: { "Retry-After": "5" } } : {}),
        },
      );
    }

    console.error("[api/status] status update failed:", err);
    return Response.json({ error: GENERIC_FAILURE, code: "error" }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
