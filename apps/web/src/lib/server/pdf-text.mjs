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

/**
 * @param {Uint8Array} bytes
 * @param {{ maxPages?: number, maxChars?: number }} [opts]
 * @returns {Promise<{ text: string, pages: number, truncated: boolean }>}
 */
export async function pdfText(bytes, { maxPages = MAX_PDF_PAGES, maxChars = MAX_PDF_CHARS } = {}) {
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
    const pdf = await task.promise;
    if (pdf.numPages > maxPages) {
      throw new PdfTextError(413, "too_many_pages", `That PDF has more than ${maxPages} pages. Upload only your resume pages.`);
    }
    let text = "";
    let truncated = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const { items } = await page.getTextContent();
      text += items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("") + "\n\n";
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
    await task.destroy();
  }
}
