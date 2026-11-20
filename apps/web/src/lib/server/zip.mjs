// A minimal zip writer: stored (uncompressed) entries, CRC-32, local headers,
// a central directory and an end record. No dependency; PDFs are already compressed.
// Names are ASCII only and never contain a path separator or "..".

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) of a byte array, as an unsigned number. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An ASCII-only file name with no "/", "\\" or "..": anything else becomes "-". */
export function safeEntryName(name) {
  const cleaned = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+/, "")
    .slice(0, 100);
  return cleaned || "file";
}

const MAX_ENTRIES = 0xfffe;
const MAX_U32 = 0xffffffff;

/**
 * @param {{ name: string, data: Uint8Array | string }[]} entries
 * @param {{ date?: Date }} [opts]
 * @returns {Buffer}
 */
export function createZip(entries, { date = new Date() } = {}) {
  if (entries.length > MAX_ENTRIES) throw new RangeError("too many zip entries");
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const dosDate = (Math.max(date.getUTCFullYear() - 1980, 0) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const used = new Set();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    let name = safeEntryName(entry.name);
    // Two entries must never share a name: the second would hide the first in some readers.
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      name = `${base}-${i}${ext}`;
    }
    used.add(name.toLowerCase());
    const nameBytes = Buffer.from(name, "ascii");
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    if (data.length > MAX_U32 || offset > MAX_U32) throw new RangeError("zip too large");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  if (offset + centralSize > MAX_U32) throw new RangeError("zip too large");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
