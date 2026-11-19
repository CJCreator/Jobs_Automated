// Text out of an uploaded PDF, in memory, without rendering it or running any
// of its actions. Plain .mjs so the integration test can read exported PDFs
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
export const PDF_TIME_BUDGET_MS = 15_000;

const TOO_MUCH_TEXT = "That PDF holds far more text than a resume. Upload only your resume pages.";
const TOO_COMPLEX = "That PDF took too long to read. Upload only your resume pages, or export it again.";

/**
 * @param {Uint8Array} bytes
 * @param {{ maxPages?: number, maxChars?: number, maxExpandedChars?: number, timeBudgetMs?: number }} [opts]
 * @returns {Promise<{ text: string, pages: number, truncated: boolean }>}
 */
export async function pdfText(
  bytes,
  {
    maxPages = MAX_PDF_PAGES,
    maxChars = MAX_PDF_CHARS,
    maxExpandedChars = MAX_PDF_EXPANDED_CHARS,
    timeBudgetMs = PDF_TIME_BUDGET_MS,
  } = {},
) {
  const deadline = performance.now() + timeBudgetMs;
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PdfTextError(413, "pdf_too_complex", TOO_COMPLEX)), Math.max(0, timeBudgetMs));
  });
  expired.catch(() => {});
  // Whatever is being awaited loses to the clock.
  const within = (promise) => Promise.race([promise, expired]);

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes),
    // No code generation from font programs, no font loading: text only.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const pdf = await within(task.promise);
    if (pdf.numPages > maxPages) {
      throw new PdfTextError(413, "too_many_pages", `That PDF has more than ${maxPages} pages. Upload only your resume pages.`);
    }
    let text = "";
    let expanded = 0;
    let truncated = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await within(pdf.getPage(i));
      const reader = page.streamTextContent().getReader();
      let pageText = "";
      try {
        for (;;) {
          if (performance.now() > deadline) throw new PdfTextError(413, "pdf_too_complex", TOO_COMPLEX);
          const { done, value } = await within(reader.read());
          if (done) break;
          for (const item of value.items) {
            if (!("str" in item)) continue;
            expanded += item.str.length + 1;
            if (expanded > maxExpandedChars) throw new PdfTextError(413, "pdf_too_much_text", TOO_MUCH_TEXT);
            pageText += item.str + (item.hasEOL ? "\n" : " ");
          }
        }
      } catch (error) {
        // pdf.js needs an Error as the reason, or it never tells the worker to stop.
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
  } catch (error) {
    if (error instanceof PdfTextError) throw error;
    if (error?.name === "PasswordException") {
      throw new PdfTextError(422, "pdf_locked", "That PDF is password protected. Upload a copy without a password.");
    }
    throw new PdfTextError(422, "pdf_unreadable", "That PDF could not be read. Check that it opens on your computer, then try again.");
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
