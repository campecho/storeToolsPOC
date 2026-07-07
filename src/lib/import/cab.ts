import { inflateRawSync } from "node:zlib";
import { MAX_PUB_BYTES } from "./limits";
import { sniffPub } from "./sniff";

/**
 * Pure-TypeScript Microsoft Cabinet (MSCF) reader for `.puz` pack-and-go
 * (plan §10.2, P4). A `.puz` is a CAB archive wrapping the real `.pub` that
 * Publisher's "Pack and Go" produces for the print shop; sniff.ts recognizes
 * the `MSCF` magic, this file unpacks the inner file so the route can feed it
 * through the identical conversion path.
 *
 * WHY pure-TS: the pipeline's posture is no native dependency for dev/CI (same
 * as pub2raw's fixture mode) — cabextract isn't installed anywhere, so we parse
 * the container ourselves. We honestly support the two compressions we can
 * invert with the platform's own inflate — STORED (none) and MSZIP — and
 * reject Quantum/LZX rather than pretend (those want a bespoke decoder).
 *
 * SERVER-ONLY: uses Node `zlib`. Like pub2raw.ts it must never be pulled into
 * client code. It is defensive by construction: every offset is bounds-checked,
 * total decompressed output is capped at MAX_PUB_BYTES (zip-bomb guard), and no
 * structural surprise escapes the export — a malformed archive is a `corrupt`
 * result, never a thrown 500.
 *
 * Format reference: MS-CAB. All multi-byte fields are little-endian. Layout is
 * CFHEADER · cFolders×CFFOLDER · cFiles×CFFILE · CFDATA blocks.
 */

export type ExtractResult =
  | { ok: true; pub: Uint8Array; name: string }
  | { ok: false; error: "not-cab" | "unsupported-compression" | "empty" | "corrupt"; detail: string };

// CFHEADER.flags bits (MS-CAB §2.1).
const FLAG_PREV_CABINET = 0x0001;
const FLAG_NEXT_CABINET = 0x0002;
const FLAG_RESERVE_PRESENT = 0x0004;

// CFFOLDER.typeCompress — the method lives in the low nibble; the high bits
// carry window/level info we don't need since we only decode NONE and MSZIP.
const COMPRESS_MASK = 0x000f;
const COMPRESS_NONE = 0;
const COMPRESS_MSZIP = 1;
const COMPRESS_QUANTUM = 2;
const COMPRESS_LZX = 3;

// An MSZIP CFDATA payload is the 2-byte "CK" signature then a raw DEFLATE
// stream; the LZ77 window (32 KB) carries across blocks within a folder.
const MSZIP_SIG_C = 0x43;
const MSZIP_SIG_K = 0x4b;
const DICT_WINDOW = 32 * 1024;

/**
 * Internal bail-out carrying the honest error code. Thrown by the parser and
 * caught once at the export boundary so callers only ever see an ExtractResult.
 */
class CabError extends Error {
  constructor(
    readonly code: "not-cab" | "unsupported-compression" | "empty" | "corrupt",
    detail: string
  ) {
    super(detail);
  }
}

/** Little-endian cursor over the cabinet bytes; every read is bounds-checked. */
class Cursor {
  pos: number;
  constructor(
    private readonly buf: Uint8Array,
    private readonly view: DataView,
    pos = 0
  ) {
    this.pos = pos;
  }
  private need(n: number, what: string): void {
    if (this.pos < 0 || this.pos + n > this.buf.length) {
      throw new CabError("corrupt", `truncated ${what} at offset ${this.pos}`);
    }
  }
  u8(): number {
    this.need(1, "u8");
    return this.buf[this.pos++];
  }
  u16(): number {
    this.need(2, "u16");
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4, "u32");
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  take(n: number): Uint8Array {
    this.need(n, `${n} bytes`);
    const s = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  /** NUL-terminated file name; CAB names cap at 255 bytes, so does the scan. */
  cstr(): string {
    const start = this.pos;
    let end = start;
    const limit = Math.min(this.buf.length, start + 256);
    while (end < limit && this.buf[end] !== 0) end++;
    if (end >= this.buf.length || this.buf[end] !== 0) {
      throw new CabError("corrupt", `unterminated name at offset ${start}`);
    }
    this.pos = end + 1; // step over the NUL
    // Names are decorative here — we identify the inner file by its bytes, not
    // this string — so a lenient UTF-8 decode is plenty.
    return new TextDecoder("utf-8", { fatal: false }).decode(this.buf.subarray(start, end));
  }
  seek(pos: number): void {
    this.pos = pos;
  }
}

function isMscf(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x4d && b[1] === 0x53 && b[2] === 0x43 && b[3] === 0x46; // "MSCF"
}

/** Concatenate chunks into one buffer of known total length. */
function concatChunks(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Last up-to-DICT_WINDOW bytes of the folder's output so far — the MSZIP dictionary. */
function nextWindow(prev: Uint8Array, out: Uint8Array): Uint8Array {
  if (out.length >= DICT_WINDOW) return out.subarray(out.length - DICT_WINDOW);
  if (prev.length === 0) return out;
  const combined = concatChunks([prev, out], prev.length + out.length);
  return combined.length > DICT_WINDOW ? combined.subarray(combined.length - DICT_WINDOW) : combined;
}

/**
 * Inflate one MSZIP CFDATA payload. The prior blocks' output tail (≤32 KB) is
 * handed to zlib as a preset dictionary, which reproduces the CAB rule that the
 * sliding window is preserved across blocks in a folder (MS-CAB §3.3): a block
 * can back-reference bytes decompressed by earlier blocks.
 */
function inflateMszip(block: Uint8Array, dictionary: Uint8Array, expected: number): Uint8Array {
  if (block.length < 2 || block[0] !== MSZIP_SIG_C || block[1] !== MSZIP_SIG_K) {
    throw new CabError("corrupt", "MSZIP block missing the 'CK' signature");
  }
  const raw = block.subarray(2);
  // A wrong dictionary or damaged stream makes zlib throw Z_DATA_ERROR; the
  // export's catch turns that into a `corrupt` result.
  const out: Uint8Array = inflateRawSync(raw, dictionary.length ? { dictionary } : {});
  if (expected !== 0 && out.length !== expected) {
    throw new CabError("corrupt", `MSZIP block yielded ${out.length} bytes, header declared ${expected}`);
  }
  return out;
}

interface Folder {
  coffCabStart: number;
  cCFData: number;
  typeCompress: number;
}

/** Decompress a folder's CFDATA chain into its full uncompressed byte stream. */
function decompressFolder(
  buf: Uint8Array,
  view: DataView,
  folder: Folder,
  cbCFDataReserve: number
): Uint8Array {
  const method = folder.typeCompress & COMPRESS_MASK;
  if (method === COMPRESS_QUANTUM) throw new CabError("unsupported-compression", "Quantum");
  if (method === COMPRESS_LZX) throw new CabError("unsupported-compression", "LZX");
  if (method !== COMPRESS_NONE && method !== COMPRESS_MSZIP) {
    throw new CabError("unsupported-compression", `type 0x${method.toString(16)}`);
  }

  const cur = new Cursor(buf, view, folder.coffCabStart);
  const parts: Uint8Array[] = [];
  let total = 0;
  let history: Uint8Array = new Uint8Array(0); // rolling MSZIP dictionary

  for (let i = 0; i < folder.cCFData; i++) {
    cur.u32(); // csum — not validated; DEFLATE integrity + our bounds cover it
    const cbData = cur.u16(); // compressed byte count in this block
    const cbUncomp = cur.u16(); // bytes this block yields once inflated
    if (cbCFDataReserve) cur.take(cbCFDataReserve); // per-block abReserve
    const comp = cur.take(cbData);

    let out: Uint8Array;
    if (method === COMPRESS_NONE) {
      out = comp; // stored: the block data IS the uncompressed data
    } else {
      out = inflateMszip(comp, history, cbUncomp);
      history = nextWindow(history, out);
    }

    parts.push(out);
    total += out.length;
    if (total > MAX_PUB_BYTES) {
      throw new CabError("corrupt", `folder decompresses past the ${MAX_PUB_BYTES}-byte cap`);
    }
  }
  return concatChunks(parts, total);
}

interface CabFile {
  cbFile: number;
  uoffFolderStart: number;
  iFolder: number;
  name: string;
}

function parseCab(input: Uint8Array): ExtractResult {
  if (!isMscf(input)) throw new CabError("not-cab", "missing MSCF signature");

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const cur = new Cursor(input, view, 0);

  // --- CFHEADER (MS-CAB §2.1) ---
  cur.take(4); // signature "MSCF" (already checked)
  cur.u32(); // reserved1
  cur.u32(); // cbCabinet — declared total; we trust our own bounds instead
  cur.u32(); // reserved2
  const coffFiles = cur.u32(); // absolute offset of the first CFFILE
  cur.u32(); // reserved3
  cur.u8(); // versionMinor
  cur.u8(); // versionMajor
  const cFolders = cur.u16();
  const cFiles = cur.u16();
  const flags = cur.u16();
  cur.u16(); // setID
  cur.u16(); // iCabinet

  let cbCFFolderReserve = 0; // abReserve trailing each CFFOLDER
  let cbCFDataReserve = 0; // abReserve trailing each CFDATA header
  if (flags & FLAG_RESERVE_PRESENT) {
    const cbCFHeader = cur.u16();
    cbCFFolderReserve = cur.u8();
    cbCFDataReserve = cur.u8();
    cur.take(cbCFHeader); // skip the header's own abReserve
  }
  // A spanned set (prev/next cabinet) can't be fully unpacked from one file,
  // but the szCabinet*/szDisk* names still have to be skipped to reach the
  // folder table; a genuinely continued file is caught later when its bytes
  // run past the local folder stream.
  if (flags & FLAG_PREV_CABINET) {
    cur.cstr();
    cur.cstr();
  }
  if (flags & FLAG_NEXT_CABINET) {
    cur.cstr();
    cur.cstr();
  }

  if (cFolders === 0 || cFiles === 0) {
    throw new CabError("empty", "cabinet declares no folders or files");
  }

  // --- CFFOLDER table ---
  const folders: Folder[] = [];
  for (let i = 0; i < cFolders; i++) {
    const coffCabStart = cur.u32();
    const cCFData = cur.u16();
    const typeCompress = cur.u16();
    if (cbCFFolderReserve) cur.take(cbCFFolderReserve);
    folders.push({ coffCabStart, cCFData, typeCompress });
  }

  // --- CFFILE table (absolute offset coffFiles) ---
  cur.seek(coffFiles);
  const files: CabFile[] = [];
  for (let i = 0; i < cFiles; i++) {
    const cbFile = cur.u32();
    const uoffFolderStart = cur.u32();
    const iFolder = cur.u16();
    cur.u16(); // date
    cur.u16(); // time
    cur.u16(); // attribs
    const name = cur.cstr();
    files.push({ cbFile, uoffFolderStart, iFolder, name });
  }

  // Decompress folders lazily, once each — most `.puz` files are a single
  // folder holding a single file.
  const folderCache = new Map<number, Uint8Array>();
  const streamFor = (idx: number): Uint8Array => {
    const cached = folderCache.get(idx);
    if (cached) return cached;
    const folder = folders[idx];
    if (!folder) throw new CabError("corrupt", `file references folder ${idx} of ${folders.length}`);
    const stream = decompressFolder(input, view, folder, cbCFDataReserve);
    folderCache.set(idx, stream);
    return stream;
  };

  const resolveFolder = (iFolder: number): number => {
    if (iFolder < cFolders) return iFolder;
    // Continued-file sentinels for spanned sets: first folder for a file
    // continued FROM a previous cabinet, last folder for one continued TO the
    // next. We only hold this one cabinet, so point at the local folder and let
    // the slice bounds decide whether the bytes are actually present.
    if (iFolder === 0xfffd || iFolder === 0xffff) return 0;
    if (iFolder === 0xfffe) return cFolders - 1;
    throw new CabError("corrupt", `file references folder ${iFolder} of ${cFolders}`);
  };

  const bytesOf = (file: CabFile): Uint8Array => {
    const stream = streamFor(resolveFolder(file.iFolder));
    const start = file.uoffFolderStart;
    const end = start + file.cbFile;
    if (start < 0 || end < start || end > stream.length) {
      throw new CabError("corrupt", `file "${file.name}" spans ${start}..${end} of a ${stream.length}-byte folder`);
    }
    return stream.subarray(start, end);
  };

  // Return the first file whose EXTRACTED bytes sniff as a real `.pub` — the
  // archived name is never trusted (same posture as the outer sniff). If none
  // sniff as pub, a lone file is almost certainly the pub anyway (pack-and-go
  // wraps exactly one); with several and none a pub we have nothing to import.
  let firstBytes: Uint8Array | undefined;
  let firstName = "";
  for (const file of files) {
    const b = bytesOf(file);
    if (firstBytes === undefined) {
      firstBytes = b;
      firstName = file.name;
    }
    const kind = sniffPub(b).kind;
    if (kind === "pub" || kind === "pub-v1") {
      return { ok: true, pub: b, name: file.name };
    }
  }
  if (files.length === 1 && firstBytes !== undefined) {
    return { ok: true, pub: firstBytes, name: firstName };
  }
  throw new CabError("empty", `${files.length} file(s), none sniff as a .pub`);
}

/**
 * Extract the inner `.pub` from a `.puz` (CAB) archive. Supports STORED and
 * MSZIP folders (with cross-block dictionary continuation); Quantum and LZX are
 * reported honestly as `unsupported-compression`. Never throws: any malformed
 * structure or inflate failure comes back as `corrupt`.
 */
export function extractFirstPub(bytes: Uint8Array): ExtractResult {
  try {
    return parseCab(bytes);
  } catch (err) {
    if (err instanceof CabError) return { ok: false, error: err.code, detail: err.message };
    // Anything unanticipated (a zlib throw, an out-of-range read) is still a
    // damaged archive, not a server crash.
    return { ok: false, error: "corrupt", detail: err instanceof Error ? err.message : String(err) };
  }
}
