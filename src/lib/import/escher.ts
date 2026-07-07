/**
 * Escher (Office Drawing) transform reader for `.pub` files (plan §10, the
 * "flip correction" slice). Reads shape mirroring (fFlipH/fFlipV), rotation,
 * and anchor geometry straight from the publication's `EscherStm` — the ground
 * truth the conversion toolchain (libmspub) discards when it paints text.
 *
 * WHY this exists: Publisher stores a box's mirroring as Escher flip flags and
 * renders text in a flipped box right-side-up. libmspub composes rotation∘flips
 * into a matrix and, when emitting a TEXT object, keeps only the extracted
 * rotation angle (MSPUBCollector: `thisTransform.getRotation()`), dropping the
 * mirror. getRotation() reads atan2(m21, m11); with m11 = fFlipH?-1:1, a box
 * with fFlipH set folds to a bare `librevenge:rotate: 180` and renders upside
 * down — while Publisher shows it upright. The mirror bit survives only in the
 * `.pub` bytes, which the import route has. flip-correct.ts consumes this.
 *
 * SERVER-ONLY posture, mirrored from cab.ts: pure TypeScript, every read is
 * bounds-checked, chain walks are cycle-guarded, and no malformed structure
 * escapes as a thrown error — the export always returns a typed result. A file
 * we can't read cleanly comes back `{ ok: false }` and the route proceeds
 * uncorrected (the honest fallback), never failing the import.
 *
 * Two nested formats:
 *  1. CFBF / OLE2 (MS-CFB) — the `.pub` container; we walk its FAT/mini-FAT to
 *     pull the `EscherStm` stream out.
 *  2. Office Art records (MS-ODRAW) inside `EscherStm` — u16 verInst · u16 type
 *     · u32 len headers, containers where (verInst & 0xF) == 0xF. We mirror
 *     libmspub's own descent (DGG · DG* → SPGR* → SP*), including its 4-byte
 *     tail after DGG/DG containers — the segmentation quirk that makes a naive
 *     sequential walk desync (it hits the padding after the first DG).
 */

export type EscherShapeTransform = {
  /** OfficeArtFSP shape id (u32 at FSP offset 0). */
  spid: number;
  /** fFlipH — Escher flag 0x40; mirror across the vertical axis. */
  flipH: boolean;
  /** fFlipV — Escher flag 0x80; mirror across the horizontal axis. */
  flipV: boolean;
  /** OPT property id 4 (16.16 fixed-point degrees), mod 360. The box's TRUE
      rotation, independent of the mirror — usually 0 for a flipped box. */
  rotationDeg: number;
  /**
   * Client-anchor geometry in INCHES, PAGE-CENTER-RELATIVE (Publisher's native
   * anchor origin): x/y are the shape's left/top edge measured from the page
   * center, w/h are its size. To recover absolute page coordinates add half the
   * page size (x_abs = pageW/2 + x, y_abs = pageH/2 + y) — flip-correct.ts does
   * exactly this via the mapped document's `size`. Absent when the shape has no
   * decodable client anchor (e.g. a group child carrying only a child-anchor).
   */
  bbox?: { x: number; y: number; w: number; h: number };
};

export type ExtractResult =
  | { ok: true; shapes: EscherShapeTransform[] }
  | { ok: false; reason: string };

/** EMUs per inch (MS-ODRAW / MSPUBConstants EMUS_IN_INCH). */
const EMUS_IN_INCH = 914400;

// CFBF sentinels (MS-CFB §2.2).
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;
const MAXREGSECT = 0xfffffffa;

// Office Art record types (MS-ODRAW; libmspub EscherContainerType.h).
const DGG_CONTAINER = 0xf000;
const DG_CONTAINER = 0xf002;
const SPGR_CONTAINER = 0xf003;
const SP_CONTAINER = 0xf004;
const FSP = 0xf00a;
const FOPT = 0xf00b;
const CLIENT_ANCHOR = 0xf010;
// (msofbtChildAnchor 0xF00F exists on group children, but resolving it needs
// the parent group's coordinate system; those shapes come back bbox-less
// instead — see readAnchor.)

// OfficeArtFSP shape flags (libmspub ShapeFlags.h).
const SF_FLIP_H = 0x40;
const SF_FLIP_V = 0x80;

// OfficeArtFOPT property id for rotation (libmspub FIELDID_ROTATION); the low
// 14 bits of the property id are the id, the top two are complex/blip flags.
const PROP_ROTATION = 0x0004;
const PROP_ID_MASK = 0x3fff;

// Publisher's client-anchor field ids (libmspub EscherFieldIds.h). The anchor
// payload is (u16 id, u32 value) pairs after a 4-byte header, NOT the plain
// 4×int32 of a Word/Excel client anchor — determined against libmspub's
// extractEscherValues and validated against known corpus geometry.
const FIELDID_XS = 0x2001;
const FIELDID_YS = 0x2002;
const FIELDID_XE = 0x2003;
const FIELDID_YE = 0x2004;
const CLIENT_ANCHOR_HEADER = 4;

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Bail-out carrying an honest reason; caught once at the export boundary. */
class EscherError extends Error {}

/** Little-endian view; every read is bounds-checked against `buf`. */
class Reader {
  constructor(
    private readonly buf: Uint8Array,
    private readonly view: DataView,
  ) {}
  get length(): number {
    return this.buf.length;
  }
  private need(pos: number, n: number, what: string): void {
    if (pos < 0 || pos + n > this.buf.length) {
      throw new EscherError(`truncated ${what} at offset ${pos}`);
    }
  }
  u16(pos: number): number {
    this.need(pos, 2, "u16");
    return this.view.getUint16(pos, true);
  }
  u32(pos: number): number {
    this.need(pos, 4, "u32");
    return this.view.getUint32(pos, true);
  }
  i32(pos: number): number {
    this.need(pos, 4, "i32");
    return this.view.getInt32(pos, true);
  }
  slice(pos: number, n: number): Uint8Array {
    this.need(pos, n, `${n} bytes`);
    return this.buf.subarray(pos, pos + n);
  }
  /** UTF-16LE directory-entry name; `byteLen` includes the NUL terminator. */
  utf16(pos: number, byteLen: number): string {
    if (byteLen <= 0 || byteLen > 64) return "";
    this.need(pos, byteLen, "name");
    let s = "";
    for (let i = 0; i + 1 < byteLen; i += 2) {
      const c = this.view.getUint16(pos + i, true);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

interface DirEntry {
  name: string;
  type: number; // 1 storage, 2 stream, 5 root
  start: number;
  size: number;
}

/** Parsed CFBF container, exposing named-stream extraction. */
class Cfbf {
  private readonly reader: Reader;
  private readonly secSize: number;
  private readonly miniSize: number;
  private readonly miniCutoff: number;
  private readonly fat: number[];
  private readonly miniFat: number[];
  private readonly dir: DirEntry[];
  private readonly miniStream: Uint8Array;
  private readonly sectorCount: number;

  constructor(bytes: Uint8Array) {
    if (bytes.length < 512) throw new EscherError("shorter than a CFBF header");
    for (let i = 0; i < CFB_SIGNATURE.length; i++) {
      if (bytes[i] !== CFB_SIGNATURE[i]) throw new EscherError("missing CFBF signature");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.reader = new Reader(bytes, view);
    const r = this.reader;

    const secShift = r.u16(30);
    const miniShift = r.u16(32);
    if (secShift < 7 || secShift > 20 || miniShift < 4 || miniShift > secShift) {
      throw new EscherError(`implausible sector shift (${secShift}/${miniShift})`);
    }
    this.secSize = 1 << secShift;
    this.miniSize = 1 << miniShift;
    this.miniCutoff = r.u32(56);
    const dirStart = r.u32(48);
    const miniFatStart = r.u32(60);
    const difatStart = r.u32(68);

    // Total sector count bounds every sector index we chase.
    this.sectorCount = Math.floor((bytes.length - 512) / this.secSize);

    this.fat = this.buildFat(r, difatStart);
    this.dir = this.readDirectory(dirStart);

    const root = this.dir.find((e) => e.type === 5);
    if (!root) throw new EscherError("no root directory entry");
    this.miniStream = this.readRegularChain(root.start, root.size);
    this.miniFat = this.buildMiniFat(miniFatStart);
  }

  private sectorOffset(sector: number): number {
    if (sector < 0 || sector > MAXREGSECT || sector >= this.sectorCount) {
      throw new EscherError(`sector ${sector} out of range`);
    }
    return 512 + sector * this.secSize;
  }

  /** Assemble the DIFAT (109 header slots + chained DIFAT sectors), then the
      FAT itself. Chain walks are cycle-guarded. */
  private buildFat(r: Reader, difatStart: number): number[] {
    const fatSectors: number[] = [];
    for (let i = 0; i < 109; i++) {
      const v = r.u32(76 + i * 4);
      if (v <= MAXREGSECT) fatSectors.push(v);
    }
    const entriesPerSec = this.secSize / 4;
    let sec = difatStart;
    const seen = new Set<number>();
    while (sec !== ENDOFCHAIN && sec !== FREESECT) {
      if (seen.has(sec)) throw new EscherError("cycle in DIFAT chain");
      seen.add(sec);
      const base = this.sectorOffset(sec);
      for (let i = 0; i < entriesPerSec - 1; i++) {
        const v = r.u32(base + i * 4);
        if (v <= MAXREGSECT) fatSectors.push(v);
      }
      sec = r.u32(base + (entriesPerSec - 1) * 4);
    }

    const fat: number[] = [];
    for (const fs of fatSectors) {
      const base = this.sectorOffset(fs);
      for (let i = 0; i < entriesPerSec; i++) fat.push(r.u32(base + i * 4));
    }
    return fat;
  }

  private buildMiniFat(miniFatStart: number): number[] {
    const entriesPerSec = this.secSize / 4;
    const out: number[] = [];
    let sec = miniFatStart;
    const seen = new Set<number>();
    while (sec !== ENDOFCHAIN && sec !== FREESECT) {
      if (seen.has(sec)) throw new EscherError("cycle in mini-FAT chain");
      seen.add(sec);
      const base = this.sectorOffset(sec);
      for (let i = 0; i < entriesPerSec; i++) out.push(this.reader.u32(base + i * 4));
      sec = this.fat[sec] ?? ENDOFCHAIN;
    }
    return out;
  }

  /** Walk a FAT chain from `start`, concatenating sectors, truncated to `size`
      (or all sectors when size is unknown). */
  private readRegularChain(start: number, size: number): Uint8Array {
    const chain = this.walkChain(start, this.fat, "FAT");
    const out = new Uint8Array(chain.length * this.secSize);
    chain.forEach((sec, i) => out.set(this.reader.slice(this.sectorOffset(sec), this.secSize), i * this.secSize));
    return size > 0 && size <= out.length ? out.subarray(0, size) : out;
  }

  private walkChain(start: number, table: number[], label: string): number[] {
    const chain: number[] = [];
    const seen = new Set<number>();
    let sec = start;
    while (sec !== ENDOFCHAIN && sec !== FREESECT && sec !== FATSECT && sec !== DIFSECT) {
      if (sec > MAXREGSECT) throw new EscherError(`bad ${label} entry ${sec}`);
      if (seen.has(sec)) throw new EscherError(`cycle in ${label} chain`);
      seen.add(sec);
      chain.push(sec);
      if (chain.length > table.length + 1) throw new EscherError(`${label} chain overruns table`);
      sec = table[sec];
      if (sec === undefined) throw new EscherError(`${label} entry ${chain[chain.length - 1]} points off the table`);
    }
    return chain;
  }

  /** Linear scan of the directory chain — the CFBF directory is a red-black
      tree, but the 128-byte entries are laid out contiguously, so a flat scan
      finds a stream by name without needing to walk the tree. */
  private readDirectory(dirStart: number): DirEntry[] {
    const bytes = this.readRegularChain(dirStart, 0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dr = new Reader(bytes, view);
    const entries: DirEntry[] = [];
    const count = Math.floor(bytes.length / 128);
    for (let i = 0; i < count; i++) {
      const off = i * 128;
      const type = bytes[off + 66];
      if (type !== 1 && type !== 2 && type !== 5) continue; // unused/invalid
      const nameLen = dr.u16(off + 64);
      entries.push({
        name: dr.utf16(off, nameLen),
        type,
        start: dr.u32(off + 116),
        size: dr.u32(off + 120) + dr.u32(off + 124) * 0x100000000,
      });
    }
    return entries;
  }

  /** Bytes of a named stream (mini-FAT for < cutoff, regular FAT otherwise). */
  streamByName(name: string): Uint8Array | undefined {
    const entry = this.dir.find((e) => e.type === 2 && e.name === name);
    if (!entry) return undefined;
    if (entry.size < this.miniCutoff) {
      const chain = this.walkChain(entry.start, this.miniFat, "mini-FAT");
      const out = new Uint8Array(chain.length * this.miniSize);
      chain.forEach((ms, i) => {
        const base = ms * this.miniSize;
        if (base + this.miniSize > this.miniStream.length) throw new EscherError("mini sector past mini-stream");
        out.set(this.miniStream.subarray(base, base + this.miniSize), i * this.miniSize);
      });
      return entry.size <= out.length ? out.subarray(0, entry.size) : out;
    }
    return this.readRegularChain(entry.start, entry.size);
  }
}

/** An Office Art record header (8 bytes) plus where its contents start. */
interface RecordHeader {
  verInst: number;
  type: number;
  len: number;
  contentsOffset: number;
}

/** libmspub's getEscherElementTailLength: 4 padding bytes trail DGG/DG. */
function tailLength(type: number): number {
  return type === DGG_CONTAINER || type === DG_CONTAINER ? 4 : 0;
}

/**
 * Office Art record walker over one `EscherStm`. Mirrors libmspub's descent so
 * the shape set matches the reference parser byte-for-byte, and is resync-safe
 * by construction: every header read is bounds-checked, and each step advances
 * strictly forward (a zero/garbage span is skipped 8 bytes at a time rather
 * than looping or throwing), so a padded or truncated stream yields whatever
 * shapes parse cleanly instead of an error.
 */
class EscherWalker {
  private readonly r: Reader;
  readonly shapes: EscherShapeTransform[] = [];

  constructor(stream: Uint8Array) {
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    this.r = new Reader(stream, view);
  }

  /** Read a header at `pos`, or null if it doesn't fit. */
  private header(pos: number): RecordHeader | null {
    if (pos < 0 || pos + 8 > this.r.length) return null;
    return {
      verInst: this.r.u16(pos),
      type: this.r.u16(pos + 2),
      len: this.r.u32(pos + 4),
      contentsOffset: pos + 8,
    };
  }

  /** End of a record's contents (clamped to the stream). */
  private contentsEnd(h: RecordHeader): number {
    return Math.min(h.contentsOffset + h.len, this.r.length);
  }

  /** Position of the next sibling after a record (contents + tail). */
  private next(h: RecordHeader): number {
    return h.contentsOffset + h.len + tailLength(h.type);
  }

  /** First direct child of the given type within [start, end), or null. */
  private find(start: number, end: number, type: number): RecordHeader | null {
    let pos = start;
    while (pos + 8 <= end) {
      const h = this.header(pos);
      if (!h) return null;
      if (h.type === type) return h;
      const nx = this.next(h);
      if (nx <= pos) return null; // no forward progress — bail
      pos = nx;
    }
    return null;
  }

  /** Parse one SP container: flip flags, rotation, client-anchor geometry. */
  private parseShape(sp: RecordHeader): void {
    const start = sp.contentsOffset;
    const end = this.contentsEnd(sp);

    const fsp = this.find(start, end, FSP);
    if (!fsp || fsp.contentsOffset + 8 > this.r.length) return; // no shape id → skip
    const spid = this.r.u32(fsp.contentsOffset);
    const flags = this.r.u32(fsp.contentsOffset + 4);

    const shape: EscherShapeTransform = {
      spid,
      flipH: (flags & SF_FLIP_H) !== 0,
      flipV: (flags & SF_FLIP_V) !== 0,
      rotationDeg: this.readRotation(start, end),
    };
    const bbox = this.readAnchor(start, end);
    if (bbox) shape.bbox = bbox;
    this.shapes.push(shape);
  }

  /** OPT property id 4, 16.16 fixed-point degrees, normalized to [0, 360). */
  private readRotation(start: number, end: number): number {
    const fopt = this.find(start, end, FOPT);
    if (!fopt) return 0;
    const numProps = fopt.verInst >> 4; // instance = property count
    const arrayEnd = this.contentsEnd(fopt);
    let pos = fopt.contentsOffset;
    let raw: number | null = null;
    for (let i = 0; i < numProps && pos + 6 <= arrayEnd; i++) {
      const id = this.r.u16(pos) & PROP_ID_MASK;
      const val = this.r.i32(pos + 2); // signed — rotation can be negative
      if (id === PROP_ROTATION) raw = val;
      pos += 6;
    }
    if (raw === null) return 0;
    const deg = raw / 65536;
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Publisher client anchor → page-center-relative inch bbox. The payload is a
   * 4-byte header then (u16 id, u32 value) pairs; ids 0x2001..0x2004 carry
   * left/top/right/bottom as signed EMU (values default to 0 when absent, as
   * libmspub's map lookup does). Only the CLIENT_ANCHOR is decoded — a group
   * child's CHILD_ANCHOR needs the parent coordinate system to resolve and is
   * left as no-bbox (it is never a top-level correction target).
   */
  private readAnchor(start: number, end: number): EscherShapeTransform["bbox"] {
    const ca = this.find(start, end, CLIENT_ANCHOR);
    if (!ca) return undefined;
    const vals = new Map<number, number>();
    const anchorEnd = this.contentsEnd(ca);
    let pos = ca.contentsOffset + CLIENT_ANCHOR_HEADER;
    while (pos + 6 <= anchorEnd) {
      vals.set(this.r.u16(pos), this.r.i32(pos + 2));
      pos += 6;
    }
    const xs = vals.get(FIELDID_XS) ?? 0;
    const ys = vals.get(FIELDID_YS) ?? 0;
    const xe = vals.get(FIELDID_XE) ?? 0;
    const ye = vals.get(FIELDID_YE) ?? 0;
    return {
      x: xs / EMUS_IN_INCH,
      y: ys / EMUS_IN_INCH,
      w: (xe - xs) / EMUS_IN_INCH,
      h: (ye - ys) / EMUS_IN_INCH,
    };
  }

  /** Walk a shape group: SPGR children recurse, SP children become shapes.
      Depth-guarded against pathological nesting. */
  private parseGroup(start: number, end: number, depth: number): void {
    if (depth > 32) return;
    let pos = start;
    while (pos + 8 <= end) {
      const h = this.header(pos);
      if (!h) return;
      if (h.type === SPGR_CONTAINER) this.parseGroup(h.contentsOffset, this.contentsEnd(h), depth + 1);
      else if (h.type === SP_CONTAINER) this.parseShape(h);
      const nx = this.next(h);
      if (nx <= pos) return;
      pos = nx;
    }
  }

  /** Top-level descent: skip the DGG container (image store), then treat every
      DG container's contents as a shape group. Handling each DG as a group —
      rather than only its SPGR child, as libmspub does — additionally captures
      bare SP containers that sit directly under a DG (a page's stray shapes). */
  walk(): void {
    const dgg = this.find(0, this.r.length, DGG_CONTAINER);
    let pos = dgg ? this.next(dgg) : 0;
    while (pos + 8 <= this.r.length) {
      const h = this.header(pos);
      if (!h) return;
      if (h.type === DG_CONTAINER) this.parseGroup(h.contentsOffset, this.contentsEnd(h), 0);
      const nx = this.next(h);
      if (nx <= pos) return;
      pos = nx;
    }
  }
}

/**
 * Read every shape's flip flags, true rotation, and anchor geometry from a
 * `.pub`'s Escher drawing stream. Never throws: a non-CFBF input, a malformed
 * container, or a missing `EscherStm` all come back as `{ ok: false, reason }`,
 * and the caller proceeds without flip correction.
 */
export function extractShapeTransforms(bytes: Uint8Array): ExtractResult {
  try {
    const cfbf = new Cfbf(bytes);
    const stream = cfbf.streamByName("EscherStm");
    if (!stream) return { ok: false, reason: "no EscherStm stream" };
    const walker = new EscherWalker(stream);
    walker.walk();
    return { ok: true, shapes: walker.shapes };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
