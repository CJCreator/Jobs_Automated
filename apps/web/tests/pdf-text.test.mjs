// pdfText: a small PDF that expands to huge text is refused before the text is built.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { threadId, isMainThread } from "node:worker_threads";
import { pdfText, pdfParseStats, PdfTextError, __setWorkerExecArgvForTests } from "../src/lib/server/pdf-text.mjs";

/** Build a PDF with one page per content string. Optionally Flate-compress each stream. */
function buildPdf(contents, { compress = false, rawFilter = null } = {}) {
  const n = contents.length;
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${contents.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[4] = null;
  contents.forEach((content, i) => {
    // rawFilter: `content` is already encoded as a Buffer and the stream dictionary names these filters.
    const data = rawFilter ? content : compress ? zlib.deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
    const filter = rawFilter ? ` /Filter [${rawFilter}]` : compress ? " /Filter /FlateDecode" : "";
    objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objs[6 + i * 2] = { head: `<< /Length ${data.length}${filter} >>`, data };
  });
  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [];
  let pos = chunks[0].length;
  for (let i = 1; i < objs.length; i++) {
    if (objs[i] === null) continue;
    offsets[i] = pos;
    const o = objs[i];
    const buf = typeof o === "string"
      ? Buffer.from(`${i} 0 obj\n${o}\nendobj\n`, "latin1")
      : Buffer.concat([Buffer.from(`${i} 0 obj\n${o.head}\nstream\n`, "latin1"), o.data, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    chunks.push(buf);
    pos += buf.length;
  }
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) {
    xref += objs[i] === null ? "0000000000 65535 f \n" : `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}

// pdf.js drops text that falls outside the page, so the font is tiny and the lines are packed
// close together: 1,000 letters across and 60,000 lines down all stay on the page.
const textStream = (line, times) => "BT /F1 0.5 Tf 0.01 TL 20 700 Td " + `(${line}) Tj T*\n`.repeat(times) + "ET";

test("a PDF bomb is refused with 413 pdf_too_much_text, without building the text", async () => {
  const bomb = buildPdf([textStream("A".repeat(1000), 60000)], { compress: true });
  assert.ok(bomb.length < 300_000, `fixture is ${bomb.length} bytes`);
  const started = performance.now();
  await assert.rejects(pdfText(bomb), (error) => {
    assert.ok(error instanceof PdfTextError);
    assert.equal(error.status, 413);
    // The worker's own refusal (expanded text), not the watchdog and not the timer.
    assert.equal(error.code, "pdf_too_much_text");
    assert.equal(error.cause, undefined);
    assert.ok(error.refusedBy === "worker", `refused by ${error.refusedBy}`);
    return true;
  });
  console.log(`text bomb: ${Math.round(performance.now() - started)} ms, pdf ${bomb.length} bytes`);
});

test("a small one-page PDF returns its text", async () => {
  const line = "Led a team of five engineers at Acme Corp and shipped the billing rewrite.";
  const bytes = buildPdf([textStream(line, 5)]);
  const { text, pages, truncated } = await pdfText(bytes);
  assert.equal(pages, 1);
  assert.equal(truncated, false);
  assert.ok(text.includes(line), text);
  assert.ok(text.length >= 370 && text.length < 600, `length ${text.length}`);
});

test("more than 30 pages still gives 413 too_many_pages", async () => {
  const bytes = buildPdf(Array.from({ length: 31 }, () => textStream("hello", 1)));
  await assert.rejects(pdfText(bytes), (error) => {
    assert.ok(error instanceof PdfTextError);
    assert.equal(error.status, 413);
    assert.equal(error.code, "too_many_pages");
    return true;
  });
});

test("70,000 characters return 60,000 with truncated true", async () => {
  const bytes = buildPdf([textStream("A".repeat(1000), 70)]);
  const { text, truncated } = await pdfText(bytes);
  assert.equal(truncated, true, `length ${text.length}`);
  assert.equal(text.length, 60_000);
});

test("a wall-clock budget of zero gives 413 pdf_too_complex", async () => {
  const bytes = buildPdf([textStream("A".repeat(1000), 70)]);
  await assert.rejects(pdfText(bytes, { timeBudgetMs: 0 }), (error) => {
    assert.ok(error instanceof PdfTextError);
    assert.equal(error.status, 413);
    assert.equal(error.code, "pdf_too_complex");
    return true;
  });
});

// P0-6b: parsing runs in a worker the parent terminates at the deadline.
const OFF_PAGE = "BT /F1 12 Tf 0.01 TL 5000 700 Td " + `(${"A".repeat(1000)}) Tj T*\n`.repeat(60000) + "ET";
const Q_Q = "q Q\n".repeat(15_000_000);

/** Run fn while a 20 ms interval ticks on the main thread; return the largest gap. */
async function withTicker(fn) {
  let last = performance.now();
  let maxGap = 0;
  const ticker = setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
  }, 20);
  const started = performance.now();
  let result;
  try {
    result = await fn().then(() => "ok", (error) => error);
  } finally {
    clearInterval(ticker);
  }
  return { result, maxGap, elapsed: performance.now() - started };
}

// Waits briefly for terminated workers to report exit, then asserts none are alive.
const noLiveWorkers = async () => {
  const deadline = performance.now() + 2000;
  while (pdfParseStats().workers > 0 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(pdfParseStats().workers, 0);
};

for (const [name, content] of [["off-page text", OFF_PAGE], ["a q Q operator stream", Q_Q]]) {
  test(`${name}: 413 pdf_too_complex within budget + 500 ms, main loop keeps ticking`, async () => {
    const bytes = buildPdf([content], { compress: true });
    console.log(`${name}: pdf ${bytes.length} bytes`);
    const budget = 1000;
    const { result, maxGap, elapsed } = await withTicker(() => pdfText(bytes, { timeBudgetMs: budget }));
    console.log(`${name}: ${Math.round(elapsed)} ms, max loop gap ${Math.round(maxGap)} ms`);
    assert.ok(result instanceof PdfTextError, String(result));
    assert.equal(result.status, 413);
    assert.equal(result.code, "pdf_too_complex");
    assert.ok(elapsed < budget + 500, `took ${elapsed} ms`);
    assert.ok(maxGap < 250, `event loop stalled for ${maxGap} ms`);
    await noLiveWorkers();
  });
}

test("expiry in the middle of a read: 413 pdf_too_complex", async () => {
  const bytes = buildPdf([textStream("A".repeat(1000), 60000)], { compress: true });
  await assert.rejects(pdfText(bytes, { timeBudgetMs: 400, maxExpandedChars: 1e9 }), (error) => {
    assert.ok(error instanceof PdfTextError);
    assert.equal(error.status, 413);
    assert.equal(error.code, "pdf_too_complex");
    return true;
  });
  await noLiveWorkers();
});

test("30 pages of resume text parse within the worker memory cap", async () => {
  const bytes = buildPdf(Array.from({ length: 30 }, () => textStream("Led a team of five engineers at Acme Corp.", 60)));
  const { pages, text } = await pdfText(bytes);
  assert.equal(pages, 30);
  assert.ok(text.length > 1000);
});

test("a normal PDF leaves no worker behind and the default budget is 5 s", async () => {
  const { PDF_TIME_BUDGET_MS } = await import("../src/lib/server/pdf-text.mjs");
  assert.equal(PDF_TIME_BUDGET_MS, 5000);
  assert.ok(isMainThread && threadId === 0);
  const started = performance.now();
  const { text } = await pdfText(buildPdf([textStream("Shipped the billing rewrite.", 5)]));
  console.log(`normal PDF: ${Math.round(performance.now() - started)} ms`);
  assert.ok(text.includes("billing rewrite"));
  await noLiveWorkers();
});

// P0-6c: memory watchdog, concurrency cap, server faults.
/** 1 GB of spaces, deflated twice: a few KB on the wire, ~1 GB of external (ArrayBuffer) memory in pdf.js. */
async function memoryBombPdf() {
  const chunk = Buffer.alloc(1024 * 1024, 0x20);
  const deflate = (input) => new Promise((resolve, reject) => {
    const out = [];
    const z = zlib.createDeflate({ level: 9 });
    z.on("data", (c) => out.push(c)).on("end", () => resolve(Buffer.concat(out))).on("error", reject);
    if (typeof input === "number") {
      for (let i = 0; i < input; i++) z.write(chunk);
      z.end();
    } else z.end(input);
  });
  const once = await deflate(1024);
  const twice = await deflate(once);
  // Filters apply in order: the first inflates `twice` to `once`, the second inflates that to 1 GB.
  return buildPdf([twice], { rawFilter: "/FlateDecode /FlateDecode" });
}

test("a double-deflated 1 GB PDF is cut off by the memory watchdog, well before the time budget", async () => {
  const bomb = await memoryBombPdf();
  console.log(`memory bomb: pdf ${bomb.length} bytes`);
  assert.ok(bomb.length < 10_000);
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  const error = await pdfText(bomb).then(() => null, (e) => e);
  const elapsed = performance.now() - started;
  const rssGrown = process.memoryUsage().rss - rssBefore;
  assert.ok(error instanceof PdfTextError, String(error));
  assert.equal(error.status, 413);
  assert.equal(error.code, "pdf_too_much_text");
  assert.equal(error.refusedBy, "memory");
  assert.ok(Number.isFinite(error.externalMemoryBytes), "reading recorded");
  assert.ok(error.externalMemoryBytes >= 256 * 1048576, `reading ${error.externalMemoryBytes}`);
  console.log(`memory bomb: refused in ${Math.round(elapsed)} ms, watchdog read ${Math.round(error.externalMemoryBytes / 1048576)} MB external, parent rss +${Math.round(rssGrown / 1048576)} MB`);
  // refusedBy === "memory" proves the watchdog acted; the bound only proves it acted before the deadline, not how fast.
  assert.ok(elapsed < 4500, `took ${elapsed} ms against a 5000 ms budget`);
  await noLiveWorkers();
});

test("a normal PDF is not refused by the watchdog", async () => {
  const { text } = await pdfText(buildPdf([textStream("Shipped the billing rewrite.", 5)]));
  assert.ok(text.includes("billing rewrite"));
});

test("at most two parses run at once; a third waits for a free slot and still succeeds", async () => {
  const bytes = buildPdf([OFF_PAGE], { compress: true });
  const budget = 600;
  const before = pdfParseStats();
  assert.equal(before.running, 0);
  let seen = 0;
  const sampler = setInterval(() => { seen = Math.max(seen, pdfParseStats().running); }, 5);
  const started = performance.now();
  const results = await Promise.all([1, 2, 3].map(() => pdfText(bytes, { timeBudgetMs: budget }).then(() => "ok", (e) => e)));
  const elapsed = performance.now() - started;
  clearInterval(sampler);
  console.log(`concurrency: peak ${pdfParseStats().peak} workers, ${Math.round(elapsed)} ms for 3 parses of ${budget} ms budget`);
  for (const r of results) {
    assert.ok(r instanceof PdfTextError, String(r));
    assert.equal(r.code, "pdf_too_complex", "the waiting parse gets its own full budget");
  }
  const peak = pdfParseStats().peak;
  assert.equal(peak, 2, `peak ${peak}`);
  assert.equal(seen, 2, `sampled ${seen}`);
  assert.equal(pdfParseStats().running, 0);
  assert.equal(pdfParseStats().waiting, 0);
  // Two waves: the third did not start until a slot freed.
  assert.ok(elapsed >= budget * 2 - 50, `took ${elapsed} ms`);
  await noLiveWorkers();
});

test("a worker that cannot start rejects with a plain Error, never forwarding the worker's text", async () => {
  const bytes = buildPdf([textStream("Shipped the billing rewrite.", 5)]);
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  let error;
  try {
    // --input-type is not allowed in a worker's execArgv, so the worker fails to start.
    __setWorkerExecArgvForTests(["--input-type=module"]);
    error = await pdfText(bytes).then(() => null, (e) => e);
  } finally {
    __setWorkerExecArgvForTests(undefined);
    console.error = original;
  }
  assert.ok(error instanceof Error, String(error));
  assert.ok(!(error instanceof PdfTextError), "a server fault is not a PdfTextError");
  assert.equal(error.name, "Error");
  assert.ok(!("status" in error));
  assert.match(error.message, /^pdf worker failed: [a-z_-]+$/);
  assert.ok(logged.some((l) => l.includes(error.message)), `logged: ${JSON.stringify(logged)}`);
  assert.ok(!/input-type|ERR_/.test(error.message), error.message);
  await noLiveWorkers();
});

test("a plain Error from pdfText becomes a 500 internal in the route wrapper", async () => {
  // The route wrapper only maps names in its safe list; anything else is a 500.
  const { readFileSync } = await import("node:fs");
  const http = readFileSync(new URL("../src/lib/server/http.ts", import.meta.url), "utf8");
  assert.match(http, /errorJson\(500, "internal"/);
  assert.ok(!/SAFE_NAMES = new Set\(\[[^\]]*"Error"/.test(http));
});

test("with 2 running and 8 waiting, the next parse is refused with 503 pdf_busy", async () => {
  const bytes = buildPdf([OFF_PAGE], { compress: true });
  const first = Array.from({ length: 10 }, () => pdfText(bytes, { timeBudgetMs: 200 }).then(() => "ok", (e) => e));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(pdfParseStats().running, 2);
  assert.equal(pdfParseStats().waiting, 8);
  const error = await pdfText(bytes).then(() => null, (e) => e);
  assert.ok(error instanceof PdfTextError, String(error));
  assert.equal(error.status, 503);
  assert.equal(error.code, "pdf_busy");
  assert.match(error.message, /Try again in a minute/);
  for (const r of await Promise.all(first)) assert.equal(r.code, "pdf_too_complex");
  assert.equal(pdfParseStats().waiting, 0);
  await noLiveWorkers();
});

test("pdfText does not accept execArgv as a public option", async () => {
  const bytes = buildPdf([textStream("Shipped the billing rewrite.", 5)]);
  const { text } = await pdfText(bytes, { execArgv: ["--input-type=module"] });
  assert.ok(text.includes("billing rewrite"));
});
