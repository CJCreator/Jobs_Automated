// P2-6: the dependency-free zip writer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, createZip, safeEntryName } from "../src/lib/server/zip.mjs";

/** Read a zip back through its central directory, checking each CRC. */
export function readZip(buf) {
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("ascii", p + 46, p + 46 + nameLen);
    assert.equal(buf.readUInt32LE(local), 0x04034b50);
    assert.equal(buf.readUInt16LE(local + 8), 0, "stored");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    assert.equal(crc32(data), crc);
    out.push({ name, data });
    p += 46 + nameLen;
  }
  return out;
}

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("a zip with two entries reads back with matching CRCs", () => {
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 255, 1, 2]);
  const zip = createZip([{ name: "a.pdf", data: pdf }, { name: "README.txt", data: "hello" }]);
  const files = readZip(zip);
  assert.deepEqual(files.map((f) => f.name), ["a.pdf", "README.txt"]);
  assert.deepEqual(files[0].data, pdf);
  assert.equal(files[1].data.toString(), "hello");
});

test("names are sanitised to ASCII with no separators or dot-dot, and stay unique", () => {
  assert.equal(safeEntryName("../../etc/passwd"), "etc-passwd");
  assert.equal(safeEntryName("a\\b/c.pdf"), "a-b-c.pdf");
  assert.equal(safeEntryName("résumé ñ 日本.pdf"), "resume-n-.pdf");
  assert.equal(safeEntryName(".."), "file");
  const names = readZip(createZip([{ name: "x/../a.pdf", data: "1" }, { name: "x/../a.pdf", data: "2" }])).map((f) => f.name);
  for (const n of names) assert.match(n, /^[A-Za-z0-9._-]+$/);
  assert.equal(new Set(names).size, 2);
  assert.ok(!names.some((n) => n.includes("..") || n.includes("/")));
});

test("an empty zip is valid", () => {
  assert.deepEqual(readZip(createZip([])), []);
});
