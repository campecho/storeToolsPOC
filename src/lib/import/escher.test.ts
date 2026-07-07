import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractShapeTransforms } from "./escher";

/**
 * Unit proof for the Escher transform reader (escher.ts). Two layers are
 * exercised: (1) the CFBF/OLE2 container, synthesized IN THE TEST — a minimal
 * mini-stream cabinet with a hand-built `EscherStm` — so flag/rotation/anchor
 * decode and every malformed-input guard are pinned without a real file; and
 * (2) the real store corpus (fixtures/pub-corpus), where the reader must land
 * exactly on libmspub's shape set and the known title/footer geometry.
 *
 * The `.pub` payloads carry no model identifiers; the goldens (259 SPs / 23
 * flipped, per-file counts) were derived by walking the real bytes.
 */

const EMU = 914400;

// ── Little-endian byte helpers ────────────────────────────────────────────
const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n >>> 0);
  return b;
};
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const i32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};

const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;

// ── Office Art record builders ────────────────────────────────────────────
/** 8-byte record header (verInst, type, len) + payload. */
const rec = (verInst: number, type: number, payload: Buffer): Buffer =>
  Buffer.concat([u16(verInst), u16(type), u32(payload.length), payload]);

/** OfficeArtFSP: u32 spid, u32 flags (0x40 flipH, 0x80 flipV). */
const fsp = (spid: number, flags: number): Buffer => rec(0x0002, 0xf00a, Buffer.concat([u32(spid), u32(flags)]));

/** OfficeArtFOPT with a single rotation property (id 4, 16.16 fixed degrees). */
const foptRotation = (deg: number): Buffer =>
  rec((1 << 4) | 3, 0xf00b, Buffer.concat([u16(0x0004), i32(Math.round(deg * 65536))]));

/** Publisher client anchor: 4-byte header + (u16 id, u32 value) pairs, ids
    0x2001..0x2004 = left/top/right/bottom in EMU. Coords are page-center
    relative. Pass inch left/top/width/height; converted to EMU edges here. */
const clientAnchor = (xIn: number, yIn: number, wIn: number, hIn: number): Buffer => {
  const xs = Math.round(xIn * EMU);
  const ys = Math.round(yIn * EMU);
  const xe = Math.round((xIn + wIn) * EMU);
  const ye = Math.round((yIn + hIn) * EMU);
  const body = Buffer.concat([
    u32(0), // 4-byte header (skipped by the reader)
    u16(0x2001),
    i32(xs),
    u16(0x2002),
    i32(ys),
    u16(0x2003),
    i32(xe),
    u16(0x2004),
    i32(ye),
  ]);
  return rec(0x0000, 0xf010, body);
};

/** OfficeArtSpContainer (0xF004) wrapping the given child records. */
const spContainer = (...children: Buffer[]): Buffer => rec(0x000f, 0xf004, Buffer.concat(children));

interface ShapeSpec {
  spid: number;
  flipH?: boolean;
  flipV?: boolean;
  rotationDeg?: number;
  anchor?: { x: number; y: number; w: number; h: number };
}
const shape = (s: ShapeSpec): Buffer => {
  const flags = (s.flipH ? 0x40 : 0) | (s.flipV ? 0x80 : 0);
  const parts = [fsp(s.spid, flags)];
  if (s.rotationDeg !== undefined) parts.push(foptRotation(s.rotationDeg));
  if (s.anchor) parts.push(clientAnchor(s.anchor.x, s.anchor.y, s.anchor.w, s.anchor.h));
  return spContainer(...parts);
};

/**
 * Build an `EscherStm`: a DG container holding an SPGR of `grouped` shapes
 * plus any `bare` SP containers directly under the DG (the stray-shape path).
 * A 4-byte tail follows the DG, matching Publisher's segmentation.
 */
const escherStm = (grouped: ShapeSpec[], bare: ShapeSpec[] = []): Buffer => {
  const fdg = rec(0x0010, 0xf008, u32(0)); // OfficeArtFDG atom (skipped)
  const spgr = rec(0x000f, 0xf003, Buffer.concat(grouped.map(shape)));
  const dgBody = Buffer.concat([fdg, spgr, ...bare.map(shape)]);
  const dg = rec(0x000f, 0xf002, dgBody);
  return Buffer.concat([dg, u32(0)]); // DG + 4-byte tail
};

// ── Minimal mini-stream CFBF builder ──────────────────────────────────────
const SECTOR = 512;
const MINI = 64;

const dirEntry = (name: string, type: number, start: number, size: number): Buffer => {
  const e = Buffer.alloc(128, 0);
  for (let i = 0; i < name.length; i++) e.writeUInt16LE(name.charCodeAt(i), i * 2);
  e.writeUInt16LE((name.length + 1) * 2, 64); // name length incl. NUL
  e.writeUInt8(type, 66);
  e.writeUInt8(1, 67); // color = black
  e.writeUInt32LE(NOSTREAM, 68); // left sibling
  e.writeUInt32LE(NOSTREAM, 72); // right sibling
  e.writeUInt32LE(NOSTREAM, 76); // child
  e.writeUInt32LE(start, 116);
  e.writeUInt32LE(size >>> 0, 120);
  e.writeUInt32LE(Math.floor(size / 0x100000000), 124);
  return e;
};

const sectorOfU32 = (values: number[]): Buffer => {
  const b = Buffer.alloc(SECTOR, 0xff); // pad with FREESECT
  values.forEach((v, i) => b.writeUInt32LE(v >>> 0, i * 4));
  return b;
};

/** Assemble a CFBF whose streams all live in the mini-stream (< 4096 bytes). */
function buildCfbf(streams: { name: string; data: Buffer }[]): Buffer {
  // Mini-stream: each stream padded to a whole mini-sector.
  const miniParts: Buffer[] = [];
  const dirEntries: Buffer[] = [];
  let miniSectorCursor = 0;
  const miniFat: number[] = [];
  for (const s of streams) {
    const nSectors = Math.max(1, Math.ceil(s.data.length / MINI));
    const padded = Buffer.alloc(nSectors * MINI, 0);
    s.data.copy(padded);
    miniParts.push(padded);
    for (let i = 0; i < nSectors; i++) {
      miniFat.push(i === nSectors - 1 ? ENDOFCHAIN : miniSectorCursor + i + 1);
    }
    dirEntries.push(dirEntry(s.name, 2, miniSectorCursor, s.data.length));
    miniSectorCursor += nSectors;
  }
  const miniStream = Buffer.concat(miniParts);
  const rootSize = miniStream.length;
  const miniStreamSectors = Math.max(1, Math.ceil(miniStream.length / SECTOR));

  // Regular sectors: 0 = FAT, 1 = directory, 2 = mini-FAT, 3.. = mini-stream.
  const FAT_SEC = 0;
  const DIR_SEC = 1;
  const MINIFAT_SEC = 2;
  const MINISTREAM_SEC = 3;

  const root = dirEntry("Root Entry", 5, MINISTREAM_SEC, rootSize);
  const dirBuf = Buffer.concat([root, ...dirEntries]);
  const dirSector = Buffer.alloc(Math.ceil(dirBuf.length / SECTOR) * SECTOR, 0);
  dirBuf.copy(dirSector);
  // Fill unused directory entry slots with type 0 (already zeroed).

  // FAT: mark FAT/dir/mini-FAT, then chain the mini-stream sectors.
  const fatValues: number[] = [FATSECT, ENDOFCHAIN, ENDOFCHAIN];
  for (let i = 0; i < miniStreamSectors; i++) {
    fatValues[MINISTREAM_SEC + i] = i === miniStreamSectors - 1 ? ENDOFCHAIN : MINISTREAM_SEC + i + 1;
  }
  const fatSector = sectorOfU32(fatValues);
  const miniFatSector = sectorOfU32(miniFat);
  const miniStreamPadded = Buffer.alloc(miniStreamSectors * SECTOR, 0);
  miniStream.copy(miniStreamPadded);

  // Header (512 bytes).
  const header = Buffer.alloc(SECTOR, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24); // minor version
  header.writeUInt16LE(0x0003, 26); // major version
  header.writeUInt16LE(0xfffe, 28); // byte order
  header.writeUInt16LE(9, 30); // sector shift → 512
  header.writeUInt16LE(6, 32); // mini sector shift → 64
  header.writeUInt32LE(1, 44); // num FAT sectors
  header.writeUInt32LE(DIR_SEC, 48); // first directory sector
  header.writeUInt32LE(4096, 56); // mini stream cutoff
  header.writeUInt32LE(MINIFAT_SEC, 60); // first mini-FAT sector
  header.writeUInt32LE(1, 64); // num mini-FAT sectors
  header.writeUInt32LE(ENDOFCHAIN, 68); // first DIFAT sector
  header.writeUInt32LE(0, 72); // num DIFAT sectors
  header.writeUInt32LE(FAT_SEC, 76); // DIFAT[0] → FAT sector
  for (let i = 1; i < 109; i++) header.writeUInt32LE(FREESECT, 76 + i * 4);

  return Buffer.concat([header, fatSector, dirSector, miniFatSector, miniStreamPadded]);
}

/** Convenience: run the reader over a hand-built EscherStm. */
const runShapes = (grouped: ShapeSpec[], bare: ShapeSpec[] = []) => {
  const cfbf = buildCfbf([{ name: "EscherStm", data: escherStm(grouped, bare) }]);
  return extractShapeTransforms(new Uint8Array(cfbf));
};

// ──────────────────────────────────────────────────────────────────────────
describe("escher: synthetic CFBF decode", () => {
  it("decodes flip flags for every H/V combination", () => {
    const r = runShapes([
      { spid: 100 },
      { spid: 101, flipH: true },
      { spid: 102, flipV: true },
      { spid: 103, flipH: true, flipV: true },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes.map((s) => s.spid)).toEqual([100, 101, 102, 103]);
    expect(r.shapes.map((s) => [s.flipH, s.flipV])).toEqual([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]);
  });

  it("decodes the rotation property and normalizes to [0, 360)", () => {
    const r = runShapes([
      { spid: 1, rotationDeg: 0 },
      { spid: 2, rotationDeg: 90 },
      { spid: 3, rotationDeg: 45.5 },
      { spid: 4, rotationDeg: -90 }, // stored signed → folds to 270
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes.map((s) => Math.round(s.rotationDeg * 100) / 100)).toEqual([0, 90, 45.5, 270]);
  });

  it("shape without a rotation property reads rotation 0", () => {
    const r = runShapes([{ spid: 7, flipH: true }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes[0].rotationDeg).toBe(0);
  });

  it("decodes the client anchor to a page-center-relative inch bbox", () => {
    const r = runShapes([{ spid: 5, anchor: { x: 1.5, y: 2.5, w: 3, h: 0.75 } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.shapes[0].bbox!;
    expect(b.x).toBeCloseTo(1.5, 4);
    expect(b.y).toBeCloseTo(2.5, 4);
    expect(b.w).toBeCloseTo(3, 4);
    expect(b.h).toBeCloseTo(0.75, 4);
  });

  it("shape without a client anchor has no bbox", () => {
    const r = runShapes([{ spid: 9, flipV: true }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes[0].bbox).toBeUndefined();
  });

  it("captures a bare SP container directly under the DG", () => {
    const r = runShapes([{ spid: 200 }], [{ spid: 201, flipH: true, anchor: { x: 0, y: 0, w: 1, h: 1 } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes.map((s) => s.spid).sort((a, b) => a - b)).toEqual([200, 201]);
    expect(r.shapes.find((s) => s.spid === 201)?.flipH).toBe(true);
  });

  it("selects EscherStm, not EscherDelayStm", () => {
    const cfbf = buildCfbf([
      { name: "EscherDelayStm", data: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) },
      { name: "EscherStm", data: escherStm([{ spid: 42, flipH: true }]) },
    ]);
    const r = extractShapeTransforms(new Uint8Array(cfbf));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0].spid).toBe(42);
  });
});

describe("escher: malformed inputs → { ok: false }", () => {
  it("rejects a buffer shorter than a CFBF header", () => {
    const r = extractShapeTransforms(new Uint8Array(100));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("CFBF header") });
  });

  it("rejects a bad signature", () => {
    const r = extractShapeTransforms(new Uint8Array(SECTOR)); // 512 zero bytes
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("signature");
  });

  it("rejects a directory chain pointing off the FAT", () => {
    const cfbf = buildCfbf([{ name: "EscherStm", data: escherStm([{ spid: 1 }]) }]);
    cfbf.writeUInt32LE(9999, 48); // directory start → nonexistent sector
    const r = extractShapeTransforms(new Uint8Array(cfbf));
    expect(r.ok).toBe(false);
  });

  it("guards against a cyclic sector chain", () => {
    const cfbf = buildCfbf([{ name: "EscherStm", data: escherStm([{ spid: 1 }]) }]);
    // FAT lives in sector 0; make the mini-stream chain (entry 3) point to itself.
    cfbf.writeUInt32LE(3, SECTOR + 3 * 4);
    const r = extractShapeTransforms(new Uint8Array(cfbf));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("cycle");
  });

  it("reports a missing EscherStm honestly", () => {
    const cfbf = buildCfbf([{ name: "EscherDelayStm", data: Buffer.from([0, 0, 0, 0]) }]);
    const r = extractShapeTransforms(new Uint8Array(cfbf));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("EscherStm") });
  });
});

// ──────────────────────────────────────────────────────────────────────────
const corpus = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "fixtures", "pub-corpus", `${name}.pub`)));

// Parse each corpus file once; the extractor is fast but the files are large.
const extractOnce = (() => {
  const cache = new Map<string, ReturnType<typeof extractShapeTransforms>>();
  return (name: string) => {
    let r = cache.get(name);
    if (!r) {
      r = extractShapeTransforms(corpus(name));
      cache.set(name, r);
    }
    return r;
  };
})();

const flipCounts = (shapes: { flipH: boolean; flipV: boolean }[]) => {
  const flipped = shapes.filter((s) => s.flipH || s.flipV);
  return {
    total: flipped.length,
    hv: flipped.filter((s) => s.flipH && s.flipV).length,
    v: flipped.filter((s) => s.flipV && !s.flipH).length,
    h: flipped.filter((s) => s.flipH && !s.flipV).length,
  };
};

describe("escher: real corpus — ecl_workbook.pub", () => {
  it("lands on libmspub's shape set: 259 SPs, 23 flipped (6 HV, 11 V, 6 H)", () => {
    const r = extractOnce("ecl_workbook");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shapes).toHaveLength(259);
    expect(flipCounts(r.shapes)).toEqual({ total: 23, hv: 6, v: 11, h: 6 });
  });

  it("decodes the flipped title/footer anchors to the known page geometry", () => {
    const r = extractOnce("ecl_workbook");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Page is 8.5 × 11in; anchors are center-relative, so add (4.25, 5.5).
    const abs = (spid: number) => {
      const s = r.shapes.find((x) => x.spid === spid)!;
      expect(s.bbox).toBeDefined();
      return { x: s.bbox!.x + 4.25, y: s.bbox!.y + 5.5, w: s.bbox!.w, h: s.bbox!.h, flipH: s.flipH, flipV: s.flipV };
    };

    const title = abs(1042); // flipped title on most pages
    expect(title.x).toBeCloseTo(4.1661, 3);
    expect(title.y).toBeCloseTo(0.5, 3);
    expect(title.w).toBeCloseTo(3.875, 3);
    expect(title.h).toBeCloseTo(0.8333, 3);
    expect(title.flipH).toBe(true);

    const titleVariant = abs(1038); // the (3.9298, 0.5) variant
    expect(titleVariant.x).toBeCloseTo(3.9298, 3);
    expect(titleVariant.y).toBeCloseTo(0.5, 3);
    expect(titleVariant.w).toBeCloseTo(3.875, 3);

    const footer = abs(1040); // flipped footer band
    expect(footer.x).toBeCloseTo(0, 3);
    expect(footer.y).toBeCloseTo(10.5, 3);
    expect(footer.w).toBeCloseTo(8.5, 3);
    expect(footer.h).toBeCloseTo(0.5, 3);
    expect(footer.flipH).toBe(true);
  });
});

describe("escher: real corpus — the other four files parse clean (goldens)", () => {
  // Probed from the real bytes; only ecl_workbook carries flipped shapes.
  const goldens: Record<string, { sps: number; flipped: number }> = {
    "3up_tabs": { sps: 9, flipped: 0 },
    bcim_double_cut: { sps: 19, flipped: 0 },
    business_card_template_10up: { sps: 6, flipped: 0 },
    production_checkpoint_labels: { sps: 198, flipped: 0 },
  };

  for (const [name, g] of Object.entries(goldens)) {
    it(`${name}: ${g.sps} SPs, ${g.flipped} flipped`, () => {
      const r = extractOnce(name);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.shapes).toHaveLength(g.sps);
      expect(flipCounts(r.shapes).total).toBe(g.flipped);
    });
  }
});
