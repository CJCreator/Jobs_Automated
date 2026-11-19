// pdfText: a small PDF that expands to huge text is refused before the text is built.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { pdfText, PdfTextError } from "../src/lib/server/pdf-text.mjs";

/** Build a PDF with one page per content string. Optionally Flate-compress each stream. */
function buildPdf(contents, { compress = false } = {}) {
  const n = contents.length;
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${contents.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[4] = null;
  contents.forEach((content, i) => {
    const data = compress ? zlib.deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
    const filter = compress ? " /Filter /FlateDecode" : "";
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

test("a PDF bomb is refused with 413 pdf_too_much_text, quickly, without building the text", async () => {
  const bomb = buildPdf([textStream("A".repeat(1000), 60000)], { compress: true });
  assert.ok(bomb.length < 300_000, `fixture is ${bomb.length} bytes`);
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  await assert.rejects(pdfText(bomb), (error) => {
    assert.ok(error instanceof PdfTextError);
    assert.equal(error.status, 413);
    assert.equal(error.code, "pdf_too_much_text");
    return true;
  });
  const elapsed = performance.now() - started;
  const grown = process.memoryUsage().rss - rssBefore;
  console.log(`bomb: ${Math.round(elapsed)} ms, rss +${Math.round(grown / 1048576)} MB, pdf ${bomb.length} bytes`);
  assert.ok(elapsed < 2000, `took ${elapsed} ms`);
  assert.ok(grown < 200 * 1048576, `rss grew ${grown} bytes`);
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
