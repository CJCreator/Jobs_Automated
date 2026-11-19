// Bridge to the engine checkout (the original project's scripts).
//
// The engine is loaded at runtime from a directory chosen by an environment
// variable, so the bundler must not try to follow these imports: hence the
// ignore comments, the same approach the existing web app uses.
//
// Plain .mjs with no framework imports so the integration test can use it too.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Raised when the engine's fact gate cannot be loaded; routes answer 503. */
export class EngineUnavailableError extends Error {
  constructor(message = "The fact check is not available right now, so nothing can be checked or exported. Try again later.") {
    super(message);
    this.name = "EngineUnavailableError";
    this.code = "engine_unavailable";
    this.status = 503;
  }
}

/**
 * Absolute path of the engine checkout.
 *
 * The checkout is chosen at runtime, so these paths must stay out of the
 * bundler's static analysis: without the ignore comments, `next build` sees
 * `process.cwd()/..` and traces the whole project into the server output.
 */
export function engineCodeRoot() {
  const explicit = (process.env.CAREER_OPS_CODE_ROOT || "").trim();
  return explicit
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), explicit)
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), "..");
}

/**
 * The engine reads a "data root" when a module is first imported and would
 * otherwise fall back to the checkout, which holds files belonging to whoever
 * runs the server. Our data lives in the database, so point it at an empty
 * directory before anything from the engine is imported.
 */
function isolateEngineDataRoot() {
  if (process.env.CAREER_OPS_ROOT || process.env.CAREER_OPS_DATA_DIR) return;
  process.env.CAREER_OPS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "rolewright-engine-"));
}

/** Import one engine file by absolute path, out of the bundler's sight. */
export async function importEngineFile(relativeFile) {
  isolateEngineDataRoot();
  const file = path.join(/* turbopackIgnore: true */ engineCodeRoot(), relativeFile);
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(file).href);
}

const GATE_KEY = Symbol.for("rolewright.engine.factGate");

/**
 * The engine's fact gate, `(text, { sourceText }) => result`. Only the source
 * text is passed through: the engine's phrase lists are per-user files in the
 * original project and have no meaning here.
 *
 * The promise is cached on globalThis (dev hot reload re-evaluates modules);
 * a failed load is not cached, so a fixed deployment recovers without restart.
 *
 * @returns {Promise<(text: string, opts: { sourceText: string }) => any>}
 * @throws {EngineUnavailableError}
 */
export function loadFactGate() {
  const g = /** @type {any} */ (globalThis);
  if (!g[GATE_KEY]) {
    const loading = (async () => {
      let mod;
      try {
        mod = await importEngineFile("verify-cv-facts.mjs");
      } catch {
        throw new EngineUnavailableError();
      }
      const verify = mod?.verifyFactsFromText;
      if (typeof verify !== "function") throw new EngineUnavailableError();
      return (text, { sourceText }) => verify(text, { sourceText });
    })();
    g[GATE_KEY] = loading;
    loading.catch(() => {
      if (g[GATE_KEY] === loading) delete g[GATE_KEY];
    });
  }
  return g[GATE_KEY];
}
