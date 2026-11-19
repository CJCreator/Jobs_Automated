import { Worker } from "node:worker_threads";

// Text out of an uploaded PDF, in memory, without rendering it or running any
// of its actions. Parsing runs in a worker thread (pdf-text-worker.mjs) that is terminated at the
// deadline, because pdf.js can spend seconds in a single synchronous step. Plain .mjs so the integration test can read exported PDFs
// with exactly the same code.

/** A PDF we refuse to read, with the HTTP status and a plain-words reason. */
export class PdfTextError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PdfTextError";
    this.status = status;
    this.code = code;
  }
}

export const MAX_PDF_PAGES = 30;
export const MAX_PDF_CHARS = 60_000;
// Text a PDF may hold before we stop reading it. A few KB of compressed stream can expand to
// tens of MB, so this is counted as chunks arrive, not after a page is built.
export const MAX_PDF_EXPANDED_CHARS = 200_000;
export const PDF_TIME_BUDGET_MS = 5_000;

const TOO_COMPLEX = "That PDF took too long to read. Upload only your resume pages, or export it again.";

/**
 * @param {Uint8Array} bytes
 * @param {{ maxPages?: number, maxChars?: number, maxExpandedChars?: number, timeBudgetMs?: number }} [opts]
 * @returns {Promise<{ text: string, pages: number, truncated: boolean }>}
 */
export function pdfText(
  bytes,
  {
    maxPages = MAX_PDF_PAGES,
    maxChars = MAX_PDF_CHARS,
    maxExpandedChars = MAX_PDF_EXPANDED_CHARS,
    timeBudgetMs = PDF_TIME_BUDGET_MS,
  } = {},
) {
  return new Promise((resolve, reject) => {
    let timer;
    let worker;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // terminate() stops the thread even in the middle of a synchronous loop.
      worker?.terminate().catch(() => {});
      fn(value);
    };
    const unreadable = () => new PdfTextError(422, "pdf_unreadable", "That PDF could not be read. Check that it opens on your computer, then try again.");
    try {
      // Spelled as a literal new URL() so the bundler copies the worker file into the build.
      worker = new Worker(new URL("./pdf-text-worker.mjs", import.meta.url), {
        workerData: { bytes: new Uint8Array(bytes), maxPages, maxChars, maxExpandedChars, timeBudgetMs },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      });
    } catch {
      reject(unreadable());
      return;
    }
    // Created only once the worker exists, so a setup failure never leaves a live timer.
    timer = setTimeout(() => finish(reject, new PdfTextError(413, "pdf_too_complex", TOO_COMPLEX)), Math.max(0, timeBudgetMs));
    worker.once("message", (m) => {
      if (m.ok) finish(resolve, m.result);
      else finish(reject, new PdfTextError(m.status, m.code, m.message));
    });
    worker.once("error", (error) => {
      // Out of memory in the worker means the PDF was far bigger than a resume.
      const oom = error?.code === "ERR_WORKER_OUT_OF_MEMORY";
      finish(reject, oom ? new PdfTextError(413, "pdf_too_much_text", "That PDF holds far more text than a resume. Upload only your resume pages.") : unreadable());
    });
    worker.once("exit", () => finish(reject, unreadable()));
  });
}
