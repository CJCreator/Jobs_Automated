import { Worker } from "node:worker_threads";

// Text out of an uploaded PDF, in memory, without rendering it or running any
// of its actions. Parsing runs in a worker thread (pdf-text-worker.mjs) that is terminated at the
// deadline, because pdf.js can spend seconds in a single synchronous step. Plain .mjs so the
// integration test can read exported PDFs with exactly the same code.

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
// resourceLimits bounds only the JS heap. A deflated stream of spaces fills ArrayBuffers, which are
// "external" memory, so the parent samples the worker and terminates it past this.
export const MAX_EXTERNAL_BYTES = 256 * 1024 * 1024;
const WATCHDOG_INTERVAL_MS = 100;
// A resume parse is cheap; two at once bounds the worst case at two budgets of CPU and two memory
// caps. A third request waits (rather than getting a 503) so a busy moment costs a user a short
// delay and not a failed upload; its time budget starts only when it gets a slot.
export const MAX_CONCURRENT_PARSES = 2;

let running = 0;
let peak = 0;
const waiters = [];
const acquire = () => new Promise((resolve) => {
  if (running < MAX_CONCURRENT_PARSES) {
    running++;
    peak = Math.max(peak, running);
    resolve();
  } else waiters.push(resolve);
});
const release = () => {
  const next = waiters.shift();
  if (next) next(); // the slot passes straight to the next waiter
  else running--;
};
/** Parses running, waiting, and the most that have run at once (for tests and logs). */
export const pdfParseStats = () => ({ running, waiting: waiters.length, peak });

const TOO_MUCH_TEXT = "That PDF holds far more text than a resume. Upload only your resume pages.";
const TOO_COMPLEX = "That PDF took too long to read. Upload only your resume pages, or export it again.";

/** A server-side fault: a plain Error that carries only a short cause label, never worker text. */
function serverFault(cause) {
  console.error(`pdf worker failed: ${cause}`);
  return new Error(`pdf worker failed: ${cause}`);
}

/**
 * @param {Uint8Array} bytes
 * @param {{ maxPages?: number, maxChars?: number, maxExpandedChars?: number, timeBudgetMs?: number, execArgv?: string[] }} [opts]
 * @returns {Promise<{ text: string, pages: number, truncated: boolean }>}
 */
export async function pdfText(
  bytes,
  {
    maxPages = MAX_PDF_PAGES,
    maxChars = MAX_PDF_CHARS,
    maxExpandedChars = MAX_PDF_EXPANDED_CHARS,
    timeBudgetMs = PDF_TIME_BUDGET_MS,
    execArgv,
  } = {},
) {
  await acquire();
  try {
    return await parse(bytes, { maxPages, maxChars, maxExpandedChars, timeBudgetMs, execArgv });
  } finally {
    release();
  }
}

function parse(bytes, { maxPages, maxChars, maxExpandedChars, timeBudgetMs, execArgv }) {
  return new Promise((resolve, reject) => {
    let timer;
    let watchdog;
    let worker;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(watchdog);
      // terminate() stops the thread even in the middle of a synchronous loop.
      worker?.terminate().catch(() => {});
      fn(value);
    };
    const tooMuch = (refusedBy, externalMemoryBytes) => {
      const error = new PdfTextError(413, "pdf_too_much_text", TOO_MUCH_TEXT);
      error.refusedBy = refusedBy;
      if (externalMemoryBytes !== undefined) error.externalMemoryBytes = externalMemoryBytes;
      return error;
    };
    try {
      // One copy, handed over (not copied again): the caller's buffer is left alone.
      const copy = new Uint8Array(bytes);
      // A literal new URL() lets the bundler find the worker; it bundles it into its own
      // [worker thread] chunk rather than copying the file.
      worker = new Worker(new URL("./pdf-text-worker.mjs", import.meta.url), {
        workerData: { bytes: copy, maxPages, maxChars, maxExpandedChars, timeBudgetMs },
        transferList: [copy.buffer],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
        ...(execArgv ? { execArgv } : {}),
      });
    } catch {
      reject(serverFault("start"));
      return;
    }
    // Created only once the worker exists, so a setup failure never leaves a live timer.
    timer = setTimeout(() => finish(reject, new PdfTextError(413, "pdf_too_complex", TOO_COMPLEX)), Math.max(0, timeBudgetMs));
    if (typeof worker.getHeapStatistics === "function") {
      let sampling = false;
      watchdog = setInterval(async () => {
        if (sampling || settled) return;
        sampling = true;
        try {
          const stats = await worker.getHeapStatistics();
          if (stats.external_memory > MAX_EXTERNAL_BYTES) finish(reject, tooMuch("memory", stats.external_memory));
        } catch {
          // The worker already ended; its own events settle the promise.
        } finally {
          sampling = false;
        }
      }, WATCHDOG_INTERVAL_MS);
    }
    worker.once("message", (m) => {
      if (m.ok) finish(resolve, m.result);
      else {
        const error = new PdfTextError(m.status, m.code, m.message);
        error.refusedBy = "worker";
        finish(reject, error);
      }
    });
    worker.once("error", (error) => {
      // Out of memory in the worker means the PDF was far bigger than a resume. Anything else is
      // our fault, not the user's file: a plain Error, whose text (which can quote the PDF) is dropped.
      if (error?.code === "ERR_WORKER_OUT_OF_MEMORY") finish(reject, tooMuch("oom"));
      else finish(reject, serverFault("error"));
    });
    worker.once("exit", () => {
      if (!settled) finish(reject, serverFault("exit"));
    });
  });
}
