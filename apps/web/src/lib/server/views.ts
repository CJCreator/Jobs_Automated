// Response shapes shared by several routes.

import { HttpError } from "./http";

type StoredTailoring = {
  id: string;
  title: string | null;
  company: string | null;
  jdText: string | null;
  createdAt: string | null;
  linesTotal?: number | null;
  linesSent?: number | null;
  rewritesReturned?: number | null;
};

export function tailoringView(t: StoredTailoring, suggestions: unknown[]) {
  return {
    id: t.id,
    title: t.title ?? "",
    company: t.company ?? "",
    jdText: t.jdText ?? "",
    suggestions,
    createdAt: t.createdAt,
    linesTotal: t.linesTotal ?? null,
    linesSent: t.linesSent ?? null,
    rewritesReturned: t.rewritesReturned ?? null,
  };
}

/** One flat issue list (the client's CheckIssue shape) that still says which suggestion each came from. */
export function flattenBlockers(blockers: { sid: string | null; ref: string | null; text?: string; issues: { kind: string; value: string; message: string }[] }[]) {
  return blockers.flatMap((b) => b.issues.map((issue) => ({ ...issue, sid: b.sid, ref: b.ref, line: b.text ?? "" })));
}

export const notFound = () => new HttpError(404, "not_found", "That tailoring was not found.");
