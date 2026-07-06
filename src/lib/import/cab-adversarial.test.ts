import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFirstPub } from "./cab";

/**
 * Adversarial proof for the pure-TS CAB reader (plan §10.1, P5): attack
 * cabinets — bombs, entry storms, truncations, lying headers, hostile
 * archived names — are synthesized IN the test (never committed as binaries)
 * with the same builder pattern as cab.test.ts (that file is frozen, so the
 * helpers are duplicated here, not imported). Every case must come back as
 * an honest ExtractResult; an uncaught throw anywhere is a failed control.
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
  comp: Buffer;
  uncompLen: number;
}

function buildFiles(files: SrcFile[]): Buffer {
  const parts: Buffer[] = [];
  let uoff = 0;
  for (const f of files) {
    parts.push(u32(f.data.length), u32(uoff), u16(0), u16(0), u16(0), u16(0), nameZ(f.name));
    uoff += f.data.length;
  }
  return Buffer.concat(parts);
}

function buildData(blocks: Block[]): Buffer {
  return Buffer.concat(blocks.flatMap((blk) => [u32(0), u16(blk.comp.length), u16(blk.uncompLen), blk.comp]));
}

/** Valid single-folder CAB; `cFilesOverride` lets a header lie about the table. */
function assembleCab(files: SrcFile[], blocks: Block[], typeCompress: number, cFilesOverride?: number): Uint8Array {
  const filesSec = buildFiles(files);
  const dataSec = buildData(blocks);
  const coffFiles = 36 + 8; // CFHEADER + one CFFOLDER
  const coffCabStart = coffFiles + filesSec.length;
  const header = Buffer.concat([
    Buffer.from("MSCF"),
    u32(0), // reserved1
    u32(coffCabStart + dataSec.length), // cbCabinet (offset 8)
    u32(0), // reserved2
    u32(coffFiles), // coffFiles (offset 16)
    u32(0), // reserved3
    Buffer.from([3, 1]), // versionMinor, versionMajor
    u16(1), // cFolders
    u16(cFilesOverride ?? files.length), // cFiles
    u16(0), // flags
    u16(0), // setID
    u16(0), // iCabinet
  ]);
  const folder = Buffer.concat([u32(coffCabStart), u16(blocks.length), u16(typeCompress)]);
  return new Uint8Array(Buffer.concat([header, folder, filesSec, dataSec]));
}

function chunk(stream: Buffer, blockSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let o = 0; o < stream.length; o += blockSize) {
    chunks.push(stream.subarray(o, Math.min(o + blockSize, stream.length)));
  }
  return chunks.length ? chunks : [Buffer.alloc(0)];
}

function storedCab(files: SrcFile[], blockSize = 32768): Uint8Array {
  const stream = Buffer.concat(files.map((f) => f.data));
  const blocks: Block[] = chunk(stream, blockSize).map((c) => ({ comp: c, uncompLen: c.length }));
  return assembleCab(files, blocks, 0);
}

/** MSZIP cab with the cross-block preset-dictionary scheme cab.ts inverts. */
function mszipCab(files: SrcFile[], blockSize = 32768): Uint8Array {
  const stream = Buffer.concat(files.map((f) => f.data));
  const blocks: Block[] = [];
  let history = Buffer.alloc(0);
  for (const c of chunk(stream, blockSize)) {
    const raw = deflateRawSync(c, history.length ? { dictionary: history } : {});
    blocks.push({ comp: Buffer.concat([Buffer.from("CK"), raw]), uncompLen: c.length });
    history = Buffer.concat([history, c]);
    if (history.length > DICT_WINDOW) history = history.subarray(history.length - DICT_WINDOW);
  }
  return assembleCab(files, blocks, 1);
}

/** Bytes that sniffPub accepts as a genuine .pub. */
function fakePub(): Buffer {
  const b = Buffer.alloc(560);
  b.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  b.set([0xe8, 0xac, 0x2c, 0x00], 512);
  return b;
}

const bufOf = (u: Uint8Array): Buffer => Buffer.from(u.buffer, u.byteOffset, u.byteLength);

afterEach(() => {
  delete process.env.STP_MAX_PUB_BYTES;
  vi.resetModules();
});

describe("extractFirstPub — decompression bomb (mid-inflate cap)", () => {
  it("aborts an MSZIP folder the moment inflation crosses MAX_PUB_BYTES", async () => {
    // A few hundred compressed bytes declaring 128 KiB of zeros (~1000:1) —
    // the bomb shape. The cap is env-shrunk to 64 KiB so the test both runs
    // instantly AND pins that the cap value flows from limits.ts: the error
    // detail must name the exact byte figure the env set.
    process.env.STP_MAX_PUB_BYTES = "65536";
    vi.resetModules();
    const { extractFirstPub: extractCapped } = await import("./cab");

    const bomb = mszipCab([{ name: "bomb.pub", data: Buffer.alloc(4 * 32768) }]);
    expect(bomb.length).toBeLessThan(2048); // genuinely a bomb, not a big file

    const res = extractCapped(bomb);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("corrupt");
      // Pinned: the abort happens MID-inflate at the cap, so memory is
      // bounded by cap + one 32 KiB block — never the declared total.
      expect(res.detail).toBe("folder decompresses past the 65536-byte cap");
    }

    // Control: under the default 25 MB cap the identical archive is a legal
    // (if silly) cabinet — proving the cap, not a parse quirk, rejected it.
    const relaxed = extractFirstPub(bomb);
    expect(relaxed).toMatchObject({ ok: true, name: "bomb.pub" });
  });
});

describe("extractFirstPub — entry-count storm", () => {
  it("walks 5000 CFFILE entries, returns bounded, and does not hang", () => {
    const files: SrcFile[] = Array.from({ length: 5000 }, (_, i) => ({
      name: `f${i}.bin`,
      data: Buffer.alloc(0),
    }));
    const cab = assembleCab(files, [{ comp: Buffer.alloc(0), uncompLen: 0 }], 0);

    const t0 = performance.now();
    const res = extractFirstPub(cab);
    expect(performance.now() - t0).toBeLessThan(2_000);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("empty");
      expect(res.detail).toContain("5000 file(s)");
    }
  });

  it("a header declaring 60000 files over a 1-entry table is corrupt, not a hang", () => {
    const cab = assembleCab([{ name: "x.pub", data: Buffer.from("tiny") }], [{ comp: Buffer.from("tiny"), uncompLen: 4 }], 0, 60_000);
    const res = extractFirstPub(cab);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("corrupt");
  });
});

describe("extractFirstPub — truncation never escapes as a throw", () => {
  it("bare 'MSCF' signature (4 bytes) → corrupt", () => {
    const res = extractFirstPub(new Uint8Array(Buffer.from("MSCF")));
    expect(res).toMatchObject({ ok: false, error: "corrupt" });
  });

  it("header cut mid-CFFOLDER → corrupt", () => {
    const whole = storedCab([{ name: "x.pub", data: fakePub() }]);
    const res = extractFirstPub(whole.subarray(0, 40)); // 36-byte header + 4 of 8 folder bytes
    expect(res).toMatchObject({ ok: false, error: "corrupt" });
  });

  it("CFDATA cut short of its declared cbData → corrupt", () => {
    const whole = storedCab([{ name: "x.pub", data: fakePub() }]);
    const res = extractFirstPub(whole.subarray(0, whole.length - 10));
    expect(res).toMatchObject({ ok: false, error: "corrupt" });
  });
});

describe("extractFirstPub — header size-field lies", () => {
  // cab.ts deliberately ignores cbCabinet ("we trust our own bounds instead"):
  // every read is bounds-checked against the REAL buffer, so a lying total
  // can neither over-read nor mislead — the field is inert either way.
  it("cbCabinet = 0 and cbCabinet = 0xFFFFFFFF both extract identically", () => {
    const pub = fakePub();
    for (const lie of [0, 0xffffffff]) {
      const cab = storedCab([{ name: "x.pub", data: pub }]).slice();
      new DataView(cab.buffer).setUint32(8, lie, true); // CFHEADER.cbCabinet
      const res = extractFirstPub(cab);
      expect(res.ok).toBe(true);
      if (res.ok) expect(bufOf(res.pub).equals(pub)).toBe(true);
    }
  });

  it("coffFiles pointing past the end → corrupt, never an over-read", () => {
    const cab = storedCab([{ name: "x.pub", data: fakePub() }]).slice();
    new DataView(cab.buffer).setUint32(16, 0x7fffffff, true); // CFHEADER.coffFiles
    const res = extractFirstPub(cab);
    expect(res).toMatchObject({ ok: false, error: "corrupt" });
  });
});

describe("extractFirstPub — hostile archived names are inert data", () => {
  // Posture: extraction is fully in-memory. cab.ts never joins an archived
  // name onto a filesystem path — the name's only uses are the result's
  // `name` field and error text — so `../` traversal and absolute paths have
  // NO sink. These tests pin that the bytes come back intact and the name is
  // returned verbatim, with nothing interpreted along the way.
  it("'../../etc/passwd' extracts as plain data with the name preserved", () => {
    const pub = fakePub();
    const res = extractFirstPub(storedCab([{ name: "../../etc/passwd", data: pub }]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.name).toBe("../../etc/passwd");
      expect(bufOf(res.pub).equals(pub)).toBe(true);
    }
  });

  it("'C:\\abs\\evil.pub' extracts as plain data with the name preserved", () => {
    const pub = fakePub();
    const res = extractFirstPub(storedCab([{ name: "C:\\abs\\evil.pub", data: pub }]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.name).toBe("C:\\abs\\evil.pub");
      expect(bufOf(res.pub).equals(pub)).toBe(true);
    }
  });
});
