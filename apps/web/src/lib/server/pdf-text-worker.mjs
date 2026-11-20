// Runs inside a worker thread started by pdf-text.mjs. The parent terminates this thread at the
// deadline, so nothing here needs to be fast to be safe: a PDF that never yields cannot block the
// server. Input and output are plain messages; no state is shared with the parent.
import { parentPort, workerData } from "node:worker_threads";

// Top level, outside any try: a missing module fails the worker (a server fault the parent reports
// as a 500), not every PDF as "could not be read".
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const TOO_MUCH_TEXT = "That PDF holds far more text than a resume. Upload only your resume pages.";
const TOO_COMPLEX = "That PDF took too long to read. Upload only your resume pages, or export it again.";

class Refusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function read({ bytes, maxPages, maxChars, maxExpandedChars, timeBudgetMs }) {
  const deadline = performance.now() + timeBudgetMs;
  const task = getDocument({
    data: bytes, // already our own copy, transferred in
    // No code generation from font programs, no font loading: text only.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > maxPages) {
      throw new Refusal(413, "too_many_pages", `That PDF has more than ${maxPages} pages. Upload only your resume pages.`);
    }
    let text = "";
    let expanded = 0;
    let truncated = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const reader = page.streamTextContent().getReader();
      let pageText = "";
      try {
        for (;;) {
          if (performance.now() > deadline) throw new Refusal(413, "pdf_too_complex", TOO_COMPLEX);
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value.items) {
            if (!("str" in item)) continue;
            expanded += item.str.length + 1;
            if (expanded > maxExpandedChars) throw new Refusal(413, "pdf_too_much_text", TOO_MUCH_TEXT);
            pageText += item.str + (item.hasEOL ? "\n" : " ");
          }
        }
      } catch (error) {
        // pdf.js needs an Error as the reason, or it never tells its own worker to stop.
        await reader.cancel(error instanceof Error ? error : new Error("cancelled")).catch(() => {});
        throw error;
      }
      text += pageText + "\n\n";
      page.cleanup();
      if (text.length > maxChars) {
        text = text.slice(0, maxChars);
        truncated = true;
        break;
      }
    }
    return { text: text.trim(), pages: pdf.numPages, truncated };
  } finally {
    await task.destroy().catch(() => {});
  }
}

try {
  parentPort.postMessage({ ok: true, result: await read(workerData) });
} catch (error) {
  if (error instanceof Refusal) {
    parentPort.postMessage({ ok: false, status: error.status, code: error.code, message: error.message });
  } else if (error?.name === "PasswordException") {
    parentPort.postMessage({ ok: false, status: 422, code: "pdf_locked", message: "That PDF is password protected. Upload a copy without a password." });
  } else {
    parentPort.postMessage({ ok: false, status: 422, code: "pdf_unreadable", message: "That PDF could not be read. Check that it opens on your computer, then try again." });
  }
}
