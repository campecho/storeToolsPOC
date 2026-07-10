import { deflateSync } from "node:zlib";

/**
 * Pure-TypeScript single-image PDF writer for print-correct export (plan §3.2
 * `pdf-wrap.ts`, §4 PE5). This is the repo's first pure-TS binary *writer* — the
 * counterpart to `src/lib/import/cab.ts`'s pure-TS *reader* — and it keeps the
 * same house discipline: no native PDF dependency, every length written is the
 * length actually emitted, the xref offsets are byte-exact by construction, and
 * the byte layout is documented against the format spec.
 *
 * WHAT it emits: a minimal, well-formed PDF 1.6 with a single page holding one
 * image XObject. The JPEG bytes pass straight through as a `/DCTDecode` stream
 * (the render worker always hands us JPEG for PDF export — no re-encode here),
 * so the writer never touches pixels; it only frames them with the print
 * geometry the shop needs:
 *
 *   • /MediaBox = /BleedBox = trim + 2·bleed, /TrimBox inset by the bleed and
 *     centered — the boxes a RIP reads to place trim and bleed marks (§4 PE5).
 *   • an /OutputIntents entry carrying the committed GRACoL press profile as a
 *     Flate-compressed /DestOutputProfile stream, so a preflight tool can read
 *     the intended print condition back out of the file (plan dev #6).
 *
 * WHAT it does NOT claim: this is not a conformant PDF/X file. It borrows the
 * PDF/X `/GTS_PDFX` output-intent subtype because that is the dictionary shape
 * preflight tools look for, but it ships none of the rest of PDF/X's contract
 * (XMP metadata, the document-info requirements, font embedding rules, trapping
 * keys, a conformance-declaring /GTS_PDFXVersion). The done-when the plan asks
 * for is narrow and honest: "the OutputIntent parses back out of the bytes" and
 * the boxes measure correctly in an external viewer (plan §4 PE5, §5) — not a
 * PDF/X pass.
 *
 * DETERMINISM (plan §4 PE5, §5 — "same recipe … same bytes"): the output is a
 * pure function of the inputs. There is no `/ID`, no `CreationDate`, no
 * `ModDate`, no producer timestamp — nothing that varies run to run — and
 * `zlib.deflateSync` is deterministic in-process, so two calls with equal
 * arguments return byte-identical buffers. `/ID` is optional in a PDF that is
 * not encrypted and not incrementally updated (PDF 32000-1:2008 §14.4), so
 * omitting it costs nothing but keeps the bytes stable.
 *
 * Format references cited inline: PDF 32000-1:2008 (the ISO redraft of PDF 1.7,
 * a superset of 1.6) — §7.5 file structure, §7.5.4 cross-reference table, §7.5.5
 * trailer, §8.9.5 image XObjects, §14.11.5 output intents; ICC.1:2010 §7.2 for
 * the profile header; ITU-T T.81 / the JFIF & Adobe APP14 conventions for the
 * JPEG marker scan below.
 */

/** The result of the bounds-checked JPEG marker scan (`scanJpeg`). */
export interface JpegScan {
  /** Pixel width from the SOF marker (0 if no SOF was reached). */
  width: number;
  /** Pixel height from the SOF marker (0 if no SOF was reached). */
  height: number;
  /** Component count from the SOF marker: 1 gray, 3 RGB/YCbCr, 4 CMYK/YCCK. */
  components: number;
  /** Whether an APP14 "Adobe" marker is present — the inverted-CMYK signal. */
  adobeApp14: boolean;
}

export interface PdfWrapOptions {
  /** The image, ALWAYS JPEG bytes — passed through untouched as a DCTDecode
      stream (the render worker encodes JPEG for PDF export regardless of the
      panel format). */
  jpeg: Buffer;
  /** Image pixel dimensions. Drive the XObject /Width /Height and, for an
      `image`-kind page, the page size. */
  width: number;
  height: number;
  /** The image's colour space — selects /DeviceRGB vs /DeviceCMYK. */
  colorSpace: "rgb" | "cmyk";
  page:
    | {
        /** Product-targeted print page. MediaBox = BleedBox = trim + 2·bleed;
            TrimBox inset by `bleed` on every edge (centered). Inches. */
        kind: "print";
        trimW: number;
        trimH: number;
        bleed: number;
      }
    | {
        /** No print target: the page is the image's own size, `image px / dpi`
            inches, and all three boxes are equal. */
        kind: "image";
        dpi: number;
      };
  /** The output-intent profile — GRACoL for the CMYK print default (plan dev
      #6). Omit for an sRGB export; a print-grade sRGB PDF could carry an sRGB
      intent here later (the writer is colour-space agnostic — /N is derived
      from the profile header, §iccComponents). */
  outputIntent?: { iccBytes: Buffer; identifier: string; info?: string };
}

// ── JPEG marker scanner (cab.ts discipline: never trust a length, clamp every
// read, stop rather than overrun) ───────────────────────────────────────────

// JPEG marker codes (ITU-T T.81 Table B.1). Every marker is 0xFF then a code.
const M_SOI = 0xd8; // start of image
const M_EOI = 0xd9; // end of image
const M_SOS = 0xda; // start of scan (entropy data follows)
const M_TEM = 0x01; // temporary (standalone)
const M_APP14 = 0xee; // application segment 14 — the "Adobe" marker lives here
// SOF (start of frame) markers span 0xC0..0xCF but three codes in that range
// are NOT frame headers: DHT (C4), JPG (C8), DAC (CC).
const M_DHT = 0xc4;
const M_JPG = 0xc8;
const M_DAC = 0xcc;

function isSof(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== M_DHT &&
    marker !== M_JPG &&
    marker !== M_DAC
  );
}

/**
 * Walk a JPEG's marker segments and report the SOF dimensions/component count
 * and whether an APP14 "Adobe" marker is present. Bounds-checked throughout in
 * the cab.ts spirit: a declared segment length that would run off the end stops
 * the walk (best-effort return) rather than reading past the buffer, and the
 * only hard failure is a buffer that is not a JPEG at all (missing SOI). The
 * caller passes real JPEG bytes (the render worker's output), but the scanner
 * still treats them as untrusted.
 *
 * WHY the Adobe flag matters (used by `wrapImagePdf`): Adobe-authored CMYK JPEGs
 * store their four components INVERTED (0 = full ink). The APP14 marker is the
 * conventional signal for it, and every PDF consumer keys the inversion off the
 * marker's presence on a 4-component image — see the `/Decode` note in
 * `wrapImagePdf`. `scanJpeg` reports only the presence boolean; the inversion
 * decision (marker present AND 4 components) is made at the call site.
 */
export function scanJpeg(buffer: Buffer): JpegScan {
  const len = buffer.length;
  if (len < 2 || buffer[0] !== 0xff || buffer[1] !== M_SOI) {
    throw new Error("scanJpeg: not a JPEG (missing SOI 0xFFD8)");
  }

  let width = 0;
  let height = 0;
  let components = 0;
  let adobeApp14 = false;

  let pos = 2; // just past SOI
  while (pos + 1 < len) {
    // A marker is introduced by 0xFF; if we are not on one, resync defensively.
    if (buffer[pos] !== 0xff) {
      pos++;
      continue;
    }
    // Collapse a run of fill bytes (0xFF …); the marker code is the first non-FF.
    let mpos = pos + 1;
    while (mpos < len && buffer[mpos] === 0xff) mpos++;
    if (mpos >= len) break;
    const marker = buffer[mpos];
    pos = mpos + 1; // now at the byte after the marker code

    // Standalone markers carry no length field: EOI, TEM, and the RSTn set.
    if (marker === M_EOI) break;
    if (marker === M_TEM || (marker >= 0xd0 && marker <= 0xd7)) continue;

    // Every other marker is a segment: a 2-byte big-endian length that INCLUDES
    // the two length bytes themselves (T.81 §B.1.1.4).
    if (pos + 1 >= len) break; // truncated length — keep what we have
    const segLen = (buffer[pos] << 8) | buffer[pos + 1];
    if (segLen < 2) break; // impossible length — malformed
    const segStart = pos + 2;
    const segEnd = pos + segLen;
    if (segEnd > len) break; // segment overruns the buffer — never read past it

    // APP14 "Adobe": payload starts with the 5 ASCII bytes "Adobe" (0x41 64 6F
    // 62 65). Presence is the inverted-CMYK signal; the transform byte that
    // follows distinguishes CMYK vs YCCK but does not change the inversion, so
    // we record only presence.
    if (
      marker === M_APP14 &&
      segLen >= 2 + 5 &&
      buffer[segStart] === 0x41 &&
      buffer[segStart + 1] === 0x64 &&
      buffer[segStart + 2] === 0x6f &&
      buffer[segStart + 3] === 0x62 &&
      buffer[segStart + 4] === 0x65
    ) {
      adobeApp14 = true;
    }

    // SOF: precision(1) · height(2) · width(2) · numComponents(1) — need 6 bytes.
    if (isSof(marker) && segLen >= 2 + 6) {
      height = (buffer[segStart + 1] << 8) | buffer[segStart + 2];
      width = (buffer[segStart + 3] << 8) | buffer[segStart + 4];
      components = buffer[segStart + 5];
    }

    // SOS begins the entropy-coded scan — no more length-delimited markers we
    // need; stop before the raw data (which is not length-prefixed).
    if (marker === M_SOS) break;

    pos = segEnd;
  }

  return { width, height, components, adobeApp14 };
}

// ── PDF serialization helpers ────────────────────────────────────────────────

/** PDF byte strings are Latin-1: one code unit → one byte, no UTF-8 widening,
    so dict text and the binary streams concatenate cleanly. */
function enc(s: string): Buffer {
  return Buffer.from(s, "latin1");
}

/**
 * Format a number for a PDF box/matrix with up to 2 decimals (plan §3.2:
 * "numbers with up to 2 decimals"): round to the hundredth, drop trailing
 * zeros and any bare decimal point, and normalize −0 to 0. E.g. 270 → "270",
 * 158.4 → "158.4", 9 → "9", 0 → "0".
 */
function fmtNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const v = Object.is(rounded, -0) ? 0 : rounded;
  const s = v.toFixed(2).replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
}

/** A 4-number box as a PDF array literal, e.g. "[0 0 270 162]". */
function boxLiteral(box: readonly [number, number, number, number]): string {
  return `[${box.map(fmtNum).join(" ")}]`;
}

/** Escape a PDF literal string body: backslash and the two parens (PDF §7.3.4.2). */
function pdfString(s: string): string {
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  return `(${escaped})`;
}

/**
 * Number of colour components for a `/DestOutputProfile` `/N`, read from the
 * ICC header's data-colour-space signature (4 bytes at offset 16 — ICC.1:2010
 * §7.2.6). CMYK → 4, RGB → 3, GRAY → 1, Lab/XYZ → 3. If the buffer is too short
 * or the signature is unrecognized (e.g. a synthetic test profile), fall back to
 * the caller's colour-space-derived count — honest degradation over a wrong /N.
 */
function iccComponents(icc: Buffer, fallback: number): number {
  if (icc.length >= 20) {
    switch (icc.toString("latin1", 16, 20)) {
      case "CMYK":
        return 4;
      case "RGB ":
        return 3;
      case "GRAY":
        return 1;
      case "Lab ":
      case "XYZ ":
        return 3;
      default:
        break;
    }
  }
  return fallback;
}

/** The three page boxes in PDF points (72/inch), per the print-geometry rules. */
function pageBoxes(opts: PdfWrapOptions): {
  media: [number, number, number, number];
  trim: [number, number, number, number];
  bleed: [number, number, number, number];
} {
  if (opts.page.kind === "print") {
    const { trimW, trimH, bleed } = opts.page;
    const b = bleed * 72;
    const mw = (trimW + 2 * bleed) * 72;
    const mh = (trimH + 2 * bleed) * 72;
    const media: [number, number, number, number] = [0, 0, mw, mh];
    // MediaBox and BleedBox are the full sheet; TrimBox is inset by the bleed on
    // every edge — centered, since the bleed is uniform.
    return { media, bleed: [...media], trim: [b, b, mw - b, mh - b] };
  }
  // image kind: the page is the image's own size at its dpi; all boxes equal.
  const { dpi } = opts.page;
  const mw = (opts.width / dpi) * 72;
  const mh = (opts.height / dpi) * 72;
  const media: [number, number, number, number] = [0, 0, mw, mh];
  return { media, trim: [...media], bleed: [...media] };
}

/**
 * Wrap a single JPEG as a print-correct PDF 1.6 (plan §4 PE5). See the file
 * header for the guarantees (deterministic, byte-exact xref, honest non-PDF/X
 * output intent). Throws on malformed inputs — these come from our own render
 * host, so a bad call is a programmer error, not untrusted data (the cab.ts
 * result-type discipline is for the untrusted read side; this write side fails
 * loud).
 */
export function wrapImagePdf(opts: PdfWrapOptions): Buffer {
  const { jpeg } = opts;
  if (!Buffer.isBuffer(jpeg) || jpeg.length === 0) {
    throw new Error("wrapImagePdf: jpeg must be a non-empty Buffer");
  }
  if (!Number.isFinite(opts.width) || !Number.isFinite(opts.height) || opts.width <= 0 || opts.height <= 0) {
    throw new Error("wrapImagePdf: width and height must be positive");
  }
  if (opts.page.kind === "print") {
    if (opts.page.trimW <= 0 || opts.page.trimH <= 0 || opts.page.bleed < 0) {
      throw new Error("wrapImagePdf: print page needs positive trim and non-negative bleed");
    }
  } else if (opts.page.dpi <= 0) {
    throw new Error("wrapImagePdf: image page needs a positive dpi");
  }

  const scan = scanJpeg(jpeg);
  const W = Math.round(opts.width);
  const H = Math.round(opts.height);
  const { media, trim, bleed } = pageBoxes(opts);
  const mw = media[2];
  const mh = media[3];

  // Object numbering is fixed so the xref is trivially correct: 1 catalog,
  // 2 pages, 3 page, 4 image, 5 content, and (when an output intent is given)
  // 6 output-intent dict, 7 the ICC profile stream.
  const hasOI = opts.outputIntent !== undefined;
  const objCount = hasOI ? 7 : 5;

  // Adobe-authored CMYK JPEGs store inverted components; emit /Decode to flip
  // them back at draw time. Gate on BOTH the APP14 marker and a 4-component
  // frame — a 3-component Adobe JPEG (YCbCr) is not inverted (plan §3.2).
  const invertCmyk = scan.adobeApp14 && scan.components === 4;
  const csName = opts.colorSpace === "cmyk" ? "DeviceCMYK" : "DeviceRGB";
  const decode = invertCmyk ? " /Decode [1 0 1 0 1 0 1 0]" : "";

  // --- object bodies ---------------------------------------------------------

  const catalogBody = enc(
    `<< /Type /Catalog /Pages 2 0 R${hasOI ? " /OutputIntents [6 0 R]" : ""} >>`,
  );

  const pagesBody = enc(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);

  const pageBody = enc(
    `<< /Type /Page /Parent 2 0 R ` +
      `/MediaBox ${boxLiteral(media)} ` +
      `/TrimBox ${boxLiteral(trim)} ` +
      `/BleedBox ${boxLiteral(bleed)} ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> ` +
      `/Contents 5 0 R >>`,
  );

  // Image XObject: JPEG passthrough via /DCTDecode (PDF §7.4.8), so /Length is
  // exactly the JPEG byte count and the encoded bytes go in verbatim.
  const imageBody = Buffer.concat([
    enc(
      `<< /Type /XObject /Subtype /Image ` +
        `/Width ${W} /Height ${H} /BitsPerComponent 8 ` +
        `/ColorSpace /${csName} /Filter /DCTDecode${decode} ` +
        `/Length ${jpeg.length} >>\nstream\n`,
    ),
    jpeg,
    enc("\nendstream"),
  ]);

  // Content: scale the unit image square to fill the MediaBox exactly. Image
  // XObjects draw into [0,1]×[0,1] (PDF §8.9.5.2), so the CTM is [mw 0 0 mh 0 0].
  const content = enc(`q\n${fmtNum(mw)} 0 0 ${fmtNum(mh)} 0 0 cm\n/Im0 Do\nQ\n`);
  const contentBody = Buffer.concat([
    enc(`<< /Length ${content.length} >>\nstream\n`),
    content,
    enc("\nendstream"),
  ]);

  let oiBody: Buffer | undefined;
  let profileBody: Buffer | undefined;
  if (opts.outputIntent) {
    const { iccBytes, identifier, info } = opts.outputIntent;
    if (!Buffer.isBuffer(iccBytes) || iccBytes.length === 0) {
      throw new Error("wrapImagePdf: outputIntent.iccBytes must be a non-empty Buffer");
    }
    // Borrow the PDF/X subtype for tool recognition; see the header on why this
    // is NOT a PDF/X conformance claim.
    oiBody = enc(
      `<< /Type /OutputIntent /S /GTS_PDFX ` +
        `/OutputConditionIdentifier ${pdfString(identifier)}` +
        (info !== undefined ? ` /Info ${pdfString(info)}` : "") +
        ` /DestOutputProfile 7 0 R >>`,
    );
    const n = iccComponents(iccBytes, opts.colorSpace === "cmyk" ? 4 : 3);
    const deflated = deflateSync(iccBytes); // zlib (RFC 1950) == PDF /FlateDecode
    profileBody = Buffer.concat([
      enc(`<< /N ${n} /Length ${deflated.length} /Filter /FlateDecode >>\nstream\n`),
      deflated,
      enc("\nendstream"),
    ]);
  }

  // --- serialize with byte-exact offset tracking -----------------------------

  const chunks: Buffer[] = [];
  let length = 0;
  const offsets: number[] = new Array(objCount + 1).fill(0);
  const push = (b: Buffer): void => {
    chunks.push(b);
    length += b.length;
  };
  const pushStr = (s: string): void => push(enc(s));
  const writeObject = (num: number, body: Buffer): void => {
    offsets[num] = length;
    pushStr(`${num} 0 obj\n`);
    push(body);
    pushStr("\nendobj\n");
  };

  // Header: the version line plus a comment of four high-bit bytes marking the
  // file as binary (PDF §7.5.2 recommendation).
  pushStr("%PDF-1.6\n");
  pushStr("%\xe2\xe3\xcf\xd3\n");

  writeObject(1, catalogBody);
  writeObject(2, pagesBody);
  writeObject(3, pageBody);
  writeObject(4, imageBody);
  writeObject(5, contentBody);
  if (oiBody && profileBody) {
    writeObject(6, oiBody);
    writeObject(7, profileBody);
  }

  // Cross-reference table (PDF §7.5.4). Every entry is EXACTLY 20 bytes:
  // 10-digit offset · SP · 5-digit generation · SP · type · SP · LF. The free
  // list has one head entry (object 0, generation 65535, free).
  const xrefOffset = length;
  pushStr("xref\n");
  pushStr(`0 ${objCount + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let i = 1; i <= objCount; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }

  // Trailer + startxref (PDF §7.5.5). No /ID — the file is neither encrypted nor
  // incrementally updated, so /ID is optional (§14.4) and omitting it keeps the
  // output deterministic.
  pushStr("trailer\n");
  pushStr(`<< /Size ${objCount + 1} /Root 1 0 R >>\n`);
  pushStr("startxref\n");
  pushStr(`${xrefOffset}\n`);
  pushStr("%%EOF\n");

  return Buffer.concat(chunks, length);
}
