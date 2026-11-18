// HTML to PDF with headless Chromium, straight through Playwright.
//
// The engine's renderHtmlToPdf was not used: it launches and closes a browser
// on every call, refuses output paths outside its own workspace, writes the
// PDF to disk, appends a row to a manifest in the data root and logs the
// output path. A hosted app needs none of that and must not write a user's
// resume to disk at all; page.pdf() returns the bytes directly.
//
// The HTML is built from user data and AI text, so the page runs with
// JavaScript off and every network request aborted.
//
// Plain .mjs so the integration test can render its upload fixture with it.

import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { engineCodeRoot } from "./engine.mjs";

export class PdfRenderError extends Error {
  constructor(message = "The PDF could not be made right now. Try again in a minute.") {
    super(message);
    this.name = "PdfRenderError";
    this.code = "pdf_failed";
    this.status = 503;
  }
}

const BROWSER_KEY = Symbol.for("rolewright.pdf.browser");
const RENDER_MS = 30_000;

/** Playwright is resolved from the engine checkout, which installs it with its browsers. */
async function loadChromium() {
  const requireFromEngine = createRequire(path.join(/* turbopackIgnore: true */ engineCodeRoot(), "package.json"));
  const entry = requireFromEngine.resolve("playwright");
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(entry).href);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error("playwright has no chromium export");
  return chromium;
}

/** One browser per process, shared by every render; relaunched if it dies. */
function getBrowser() {
  const g = /** @type {any} */ (globalThis);
  if (!g[BROWSER_KEY]) {
    const launching = (async () => {
      const chromium = await loadChromium();
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
      const browser = await chromium.launch({ headless: true, executablePath });
      browser.on("disconnected", () => {
        if (g[BROWSER_KEY] === launching) delete g[BROWSER_KEY];
      });
      return browser;
    })();
    g[BROWSER_KEY] = launching;
    launching.catch(() => {
      if (g[BROWSER_KEY] === launching) delete g[BROWSER_KEY];
    });
  }
  return g[BROWSER_KEY];
}

/**
 * Render a complete HTML document to an A4 PDF.
 * @param {string} html
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<Buffer>}
 * @throws {PdfRenderError}
 */
export async function renderPdf(html, { timeoutMs = RENDER_MS } = {}) {
  let browser;
  try {
    browser = await getBrowser();
  } catch {
    throw new PdfRenderError();
  }
  let context = null;
  let timer;
  try {
    context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const work = (async () => {
      await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
      return page.pdf({ format: "A4", printBackground: false, preferCSSPageSize: true });
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new PdfRenderError("Making the PDF took too long. Try again.")), timeoutMs);
    });
    return Buffer.from(await Promise.race([work, timeout]));
  } catch (err) {
    if (err instanceof PdfRenderError) throw err;
    throw new PdfRenderError();
  } finally {
    clearTimeout(timer);
    // Closing the context closes its page too, including one stuck mid-render.
    if (context) await context.close().catch(() => {});
  }
}

/** Close the shared browser (tests and shutdown). */
export async function closeBrowser() {
  const g = /** @type {any} */ (globalThis);
  const launching = g[BROWSER_KEY];
  delete g[BROWSER_KEY];
  if (!launching) return;
  try {
    const browser = await launching;
    await browser.close();
  } catch {
    // Already gone.
  }
}
