import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractFirstPub } from "./cab";

/**
 * Unit proof for the pure-TS CAB reader (cab.ts). No `cabextract` and no real
 * `.puz` sample exist in this environment, so we synthesize cabinets IN THE
 * TEST — a tiny CAB-builder below — and round-trip them. The MSZIP cases use
 * the platform's own `deflateRawSync` with the exact "CK"-prefix + preset-
 * dictionary scheme cab.ts inverts, including a multi-block case that only
 * decodes correctly when the cross-block dictionary is honored.
 */

const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const nameZ = (s: string): Buffer => Buffer.concat([Buffer.from(s, "ascii"), Buffer.from([0])]);

const DICT_WINDOW = 32 * 1024;

interface SrcFile {
  name: string;
  data: Buffer;
}
interface Block {
  comp: Buffer; // the CFDATA payload bytes (for MSZIP: "CK" + raw deflate)
  raw: Buffer; // just the raw deflate stream (MSZIP only; = comp.subarray(2))
  uncompLen: number;
}

/** CFFILE table: cbFile, uoffFolderStart, iFolder, date, time, attribs, name\0. */
function buildFiles(files: SrcFile[]): Buffer {
  const parts: Buffer[] = [];
  let uoff = 0;
  for (const f of files) {
    parts.push(u32(f.data.length)); // cbFile
    parts.push(u32(uoff)); // uoffFolderStart
    parts.push(u16(0)); // iFolder (single folder)
    parts.push(u16(0)); // date
    parts.push(u16(0)); // time
    parts.push(u16(0)); // attribs
    parts.push(nameZ(f.name));
    uoff += f.data.length;
  }
  return Buffer.concat(parts);
}

/** CFDATA chain: csum, cbData, cbUncomp, then the block bytes. */
function buildData(blocks: Block[]): Buffer {
  const parts: Buffer[] = [];
  for (const blk of blocks) {
    parts.push(u32(0)); // csum (0 = not checksummed)
    parts.push(u16(blk.comp.length)); // cbData
    parts.push(u16(blk.uncompLen)); // cbUncomp
    parts.push(blk.comp);
  }
  return Buffer.concat(parts);
}

/** Assemble a valid single-folder CAB from its already-formed data blocks. */
function assembleCab(files: SrcFile[], blocks: Block[], typeCompress: number): Uint8Array {
  const filesSec = buildFiles(files);
  const dataSec = buildData(blocks);
  const coffFiles = 36 + 8; // CFHEADER + one CFFOLDER
  const coffCabStart = coffFiles + filesSec.length;
  const total = coffCabStart + dataSec.length;

  const header = Buffer.concat([
    Buffer.from("MSCF"), // signature
    u32(0), // reserved1
    u32(total), // cbCabinet
    u32(0), // reserved2
    u32(coffFiles), // coffFiles
    u32(0), // reserved3
    Buffer.from([3, 1]), // versionMinor, versionMajor
    u16(1), // cFolders
    u16(files.length), // cFiles
    u16(0), // flags (no reserve, no spanning)
    u16(0), // setID
    u16(0), // iCabinet
  ]);
  const folder = Buffer.concat([
    u32(coffCabStart), // coffCabStart
    u16(blocks.length), // cCFData
    u16(typeCompress), // typeCompress
  ]);
  return new Uint8Array(Buffer.concat([header, folder, filesSec, dataSec]));
}

/** Split a folder stream into ≤blockSize chunks. */
function chunk(stream: Buffer, blockSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let o = 0; o < stream.length; o += blockSize) {
    chunks.push(stream.subarray(o, Math.min(o + blockSize, stream.length)));
  }
  return chunks.length ? chunks : [Buffer.alloc(0)];
}

/** Stored (uncompressed) CAB: each chunk goes in verbatim, typeCompress = 0. */
function storedCab(files: SrcFile[], blockSize = 32768): Uint8Array {
  const stream = Buffer.concat(files.map((f) => f.data));
  const blocks: Block[] = chunk(stream, blockSize).map((c) => ({ comp: c, raw: c, uncompLen: c.length }));
  return assembleCab(files, blocks, 0);
}

/**
 * MSZIP CAB: each chunk is deflated with the previous output's ≤32 KB tail as a
 * preset dictionary and prefixed with "CK" — exactly the scheme cab.ts inverts.
 * Returns the raw blocks too so a test can prove the dictionary is load-bearing.
 */
function mszipCab(files: SrcFile[], blockSize = 32768): { cab: Uint8Array; blocks: Block[] } {
  const stream = Buffer.concat(files.map((f) => f.data));
  const chunks = chunk(stream, blockSize);
  const blocks: Block[] = [];
  let history = Buffer.alloc(0);
  for (const c of chunks) {
    const raw = deflateRawSync(c, history.length ? { dictionary: history } : {});
    blocks.push({ comp: Buffer.concat([Buffer.from("CK"), raw]), raw, uncompLen: c.length });
    history = Buffer.concat([history, c]);
    if (history.length > DICT_WINDOW) history = history.subarray(history.length - DICT_WINDOW);
  }
  return { cab: assembleCab(files, blocks, 1), blocks };
}

// A minimal byte blob that sniffPub accepts as a real `.pub`: CFBF/OLE2 magic
// at 0 plus the Publisher 2002+ Contents marker at an offset.
function fakePub(): Buffer {
  const b = Buffer.alloc(560);
  b.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0); // CFBF magic
  b.set([0xe8, 0xac, 0x2c, 0x00], 512); // Publisher Contents marker
  return b;
}

// A larger fake `.pub` whose body is a period-16 repeating pattern, so that a
// small block size forces later MSZIP blocks to back-reference earlier ones —
// the only way to exercise cross-block dictionary continuation.
function repeatingPub(len = 900): Buffer {
  const b = Buffer.alloc(len);
  for (let i = 0; i < len; i++) b[i] = 0x41 + (i % 16); // 'A'..'P' repeating
  b.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  b.set([0xe8, 0xac, 0x2c, 0x00], 512);
  return b;
}

const bufOf = (u: Uint8Array): Buffer => Buffer.from(u.buffer, u.byteOffset, u.byteLength);

describe("extractFirstPub — stored (uncompressed) cabinets", () => {
  it("returns the exact inner .pub bytes", () => {
    const pub = fakePub();
    const res = extractFirstPub(storedCab([{ name: "publication.pub", data: pub }]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.name).toBe("publication.pub");
      expect(bufOf(res.pub).equals(pub)).toBe(true);
    }
  });

  it("reassembles a file that spans several stored CFDATA blocks", () => {
    const pub = repeatingPub(900);
    const res = extractFirstPub(storedCab([{ name: "big.pub", data: pub }], 200));
    expect(res.ok).toBe(true);
    if (res.ok) expect(bufOf(res.pub).equals(pub)).toBe(true);
  });
});

describe("extractFirstPub — MSZIP cabinets", () => {
  it("round-trips a single-block MSZIP folder", () => {
    const pub = fakePub();
    const { cab } = mszipCab([{ name: "flyer.pub", data: pub }]);
    const res = extractFirstPub(cab);
    expect(res.ok).toBe(true);
    if (res.ok) expect(bufOf(res.pub).equals(pub)).toBe(true);
  });

  it("round-trips a multi-block MSZIP folder via cross-block dictionary continuation", () => {
    const pub = repeatingPub(900);
    const { cab, blocks } = mszipCab([{ name: "flyer.pub", data: pub }], 200);
    expect(blocks.length).toBeGreaterThan(1); // genuinely multi-block

    const res = extractFirstPub(cab);
    expect(res.ok).toBe(true);
    if (res.ok) expect(bufOf(res.pub).equals(pub)).toBe(true);

    // Negative control: decoding each block WITHOUT the carried dictionary must
    // fail to reproduce the original — proving the dictionary is load-bearing,
    // not incidental. Later blocks back-reference the previous folder output, so
    // a naive per-block inflate either throws ("distance too far back") or emits
    // wrong bytes.
    let brokenWithoutDict = false;
    try {
      const naive = Buffer.concat(blocks.map((b) => inflateRawSync(b.raw)));
      brokenWithoutDict = !naive.equals(pub);
    } catch {
      brokenWithoutDict = true;
    }
    expect(brokenWithoutDict).toBe(true);
  });
});

describe("extractFirstPub — selection and honest rejections", () => {
  it("rejects a non-CAB input", () => {
    const res = extractFirstPub(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])); // "%PDF-"
    expect(res).toEqual({ ok: false, error: "not-cab", detail: expect.any(String) });
  });

  it("rejects Quantum-compressed folders honestly", () => {
    // Body bytes are irrelevant — the method is rejected before any decode.
    const cab = assembleCab([{ name: "x.pub", data: fakePub() }], [{ comp: Buffer.from([0]), raw: Buffer.from([0]), uncompLen: 1 }], 2);
    const res = extractFirstPub(cab);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("unsupported-compression");
      expect(res.detail).toBe("Quantum");
    }
  });

  it("rejects LZX-compressed folders honestly", () => {
    const cab = assembleCab([{ name: "x.pub", data: fakePub() }], [{ comp: Buffer.from([0]), raw: Buffer.from([0]), uncompLen: 1 }], 3);
    const res = extractFirstPub(cab);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toBe("LZX");
  });

  it("picks the file whose BYTES sniff as pub, ignoring the archived name", () => {
    // The real pub is named 'readme.txt'; a decoy text file is named 'doc.pub'.
    const pub = fakePub();
    const res = extractFirstPub(
      storedCab([
        { name: "doc.pub", data: Buffer.from("not actually a publisher file") },
        { name: "readme.txt", data: pub },
      ])
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.name).toBe("readme.txt");
      expect(bufOf(res.pub).equals(pub)).toBe(true);
    }
  });

  it("falls back to the sole file even when it doesn't sniff as pub", () => {
    const only = Buffer.from("mystery payload");
    const res = extractFirstPub(storedCab([{ name: "thing.bin", data: only }]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(bufOf(res.pub).equals(only)).toBe(true);
  });

  it("reports empty when several files are present and none is a pub", () => {
    const res = extractFirstPub(
      storedCab([
        { name: "a.txt", data: Buffer.from("alpha") },
        { name: "b.txt", data: Buffer.from("bravo") },
      ])
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("empty");
  });

  it("reports corrupt when a file's slice runs past its folder stream", () => {
    // Hand-craft a CAB whose single CFFILE claims more bytes than the folder holds.
    const files = buildFiles([{ name: "x.pub", data: Buffer.alloc(10) }]); // cbFile=10
    const dataSec = buildData([{ comp: Buffer.alloc(4), raw: Buffer.alloc(4), uncompLen: 4 }]); // only 4 bytes stored
    const coffFiles = 44;
    const coffCabStart = coffFiles + files.length;
    const header = Buffer.concat([
      Buffer.from("MSCF"),
      u32(0),
      u32(coffCabStart + dataSec.length),
      u32(0),
      u32(coffFiles),
      u32(0),
      Buffer.from([3, 1]),
      u16(1),
      u16(1),
      u16(0),
      u16(0),
      u16(0),
    ]);
    const folder = Buffer.concat([u32(coffCabStart), u16(1), u16(0)]);
    const cab = new Uint8Array(Buffer.concat([header, folder, files, dataSec]));
    const res = extractFirstPub(cab);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("corrupt");
  });
});
