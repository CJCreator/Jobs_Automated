// The fact gate and render path for a resume PDF, shared by the single-tailoring
// export route and the PDF bundle in the data export. One function, not two
// copies: a tailoring that cannot be exported on its own cannot be bundled.
//
// Plain .mjs so `node --test` can import it. The database, the fact-gate runner
// and the renderer are passed in, so tests stub the Chromium renderer.

import { buildResume } from "../facts.mjs";
import { exportBlockers } from "../tailoring.mjs";
import { resumeHtml } from "../resume-html.mjs";
import { createZip } from "./zip.mjs";

export const MAX_BUNDLE_TAILORINGS = 20;
export const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;

export class BundleError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "BundleError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Check every accepted change against the facts as they are now, then build the resume.
 * `runGate(fn)` runs the gate work (the routes charge its time to the gateMs bucket).
 * @returns {Promise<{ ok: true, resume: any } | { ok: false, reason: "facts_too_large" | "fact_gate" | "nothing_confirmed", blockers: any[] }>}
 */
export async function gateTailoring(facts, tailoring, { engineGate, runGate }) {
  const blockers = await runGate(() => exportBlockers(facts, tailoring.suggestions, { jdText: tailoring.jdText ?? "", engineGate }));
  if (blockers.length === 1 && blockers[0].issues.length === 1 && blockers[0].issues[0].kind === "facts_too_large") {
    return { ok: false, reason: "facts_too_large", blockers };
  }
  if (blockers.length) return { ok: false, reason: "fact_gate", blockers };
  const { resume } = buildResume(facts, tailoring.suggestions);
  if (!resume.contact && !resume.summary && !resume.experience.length && !resume.education.length && !resume.skills.length) {
    return { ok: false, reason: "nothing_confirmed", blockers: [] };
  }
  return { ok: true, resume };
}

/** Gate, then render. The renderer only ever sees a resume that passed the gate. */
export async function gateAndRender(facts, tailoring, { engineGate, runGate, render }) {
  const gated = await gateTailoring(facts, tailoring, { engineGate, runGate });
  if (!gated.ok) return gated;
  const pdf = await render(resumeHtml(gated.resume));
  return { ...gated, pdf };
}

const slug = (v) =>
  String(v ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "") || "resume";

/**
 * One PDF per tailoring that passes the gate today, plus a README.txt that lists
 * every other one by reason code only. Rendered one at a time.
 * @param {{ listIds: () => Promise<string[]>, load: (id: string) => Promise<any>, facts: any,
 *   engineGate: any, runGate: (fn: () => any) => Promise<any>, render: (html: string) => Promise<Uint8Array>, date?: Date }} deps
 * @returns {Promise<{ zip: Buffer, included: number, skipped: { name: string, reason: string }[] }>}
 */
export async function buildPdfBundle({ listIds, load, facts, engineGate, runGate, render, date = new Date() }) {
  const all = await listIds();
  const ids = all.slice(0, MAX_BUNDLE_TAILORINGS);
  const entries = [];
  const skipped = [];
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    const tailoring = await load(ids[i]);
    if (!tailoring) continue;
    const name = `rolewright-${slug(tailoring.title)}-${i + 1}.pdf`;
    let result;
    try {
      result = await gateAndRender(facts, tailoring, { engineGate, runGate, render });
    } catch (e) {
      // A rate-limit or storage failure stops the whole bundle; only a failed render is listed.
      if (e?.code !== "pdf_failed") throw e;
      skipped.push({ name, reason: "render_failed" });
      continue;
    }
    if (!result.ok) {
      skipped.push({ name, reason: result.reason });
      continue;
    }
    total += result.pdf.length;
    if (total > MAX_BUNDLE_BYTES) throw new BundleError("bundle_too_large", "Your PDFs add up to more than 25 MB, so they could not be bundled.", 413);
    entries.push({ name, data: result.pdf });
  }
  const over = all.length - ids.length;
  const lines = [
    "Rolewright PDF bundle",
    `Made ${date.toISOString().slice(0, 10)}`,
    "",
    `Included: ${entries.length} resume PDF${entries.length === 1 ? "" : "s"}.`,
  ];
  if (skipped.length || over > 0) {
    lines.push("", "Not included (reason code only):");
    for (const s of skipped) lines.push(`- ${s.name}: ${s.reason}`);
    if (over > 0) lines.push(`- ${over} older tailoring${over === 1 ? "" : "s"}: over_cap (a bundle holds the newest ${MAX_BUNDLE_TAILORINGS})`);
    lines.push(
      "",
      "Reason codes:",
      "fact_gate: an accepted change says something not in your confirmed facts. Edit or reject it in the app.",
      "facts_too_large: your confirmed facts are too large to check.",
      "nothing_confirmed: nothing was confirmed to put on the resume.",
      "render_failed: the PDF could not be made right now.",
      "over_cap: the bundle limit was reached.",
    );
  }
  entries.push({ name: "README.txt", data: `${lines.join("\n")}\n` });
  return { zip: createZip(entries, { date }), included: entries.length - 1, skipped };
}
