/**
 * Image byte utilities for P3 extraction (plan §10.3) — pure and isomorphic
 * (no Node-only imports at module top; Buffer is feature-detected) so the
 * mapper runs unchanged on the server and in the browser. Same posture as
 * sniff.ts: identify images by their bytes, never by the declared MIME —
 * libmspub's `librevenge:mime-type` is a hint the container recorded, not a
 * guarantee of what the payload actually is.
 */

/** Decode base64 → bytes. Buffer where present (Node), atob otherwise. */
export function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Does `bytes` start with `sig` (numbers, or null = wildcard) at `offset`? */
function matchAt(bytes: Uint8Array, offset: number, sig: (number | null)[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    const b = sig[i];
    if (b !== null && bytes[offset + i] !== b) return false;
  }
  return true;
}

/** ISO-BMFF `ftyp` brands that mean a HEIF still we treat as HEIC (v1.4 —
    the photo intake gates these behind the heif-convert probe, §3.5). AVIF's
    "avif"/"avis" brands are deliberately absent: they aren't in this set. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heif", "mif1", "msf1"]);

/** The 4-byte ASCII brand at `offset`, or "" if it runs off the end. */
function brandAt(bytes: Uint8Array, offset: number): string {
  if (bytes.length < offset + 4) return "";
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/**
 * SVG probe (v1.4): a text vector, so there is no binary magic — skip a UTF-8
 * BOM and leading ASCII whitespace, then require `<?xml` or `<svg` within a
 * bounded prefix. A cheap heuristic, never a parse: a generic `<?xml` doc is
 * admitted here and rejected later when the jailed rasterizer can't decode it
 * (UTF-16-encoded SVG is out of this probe's scope — vanishingly rare here).
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  let i = matchAt(bytes, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0; // UTF-8 BOM
  const limit = Math.min(bytes.length, i + 256);
  const isWs = (b: number) =>
    b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0c || b === 0x0b;
  while (i < limit && isWs(bytes[i])) i++;
  return (
    matchAt(bytes, i, [0x3c, 0x3f, 0x78, 0x6d, 0x6c]) || // "<?xml"
    matchAt(bytes, i, [0x3c, 0x73, 0x76, 0x67]) // "<svg"
  );
}

/**
 * Magic-number sniff → a `image/*` MIME, or undefined when nothing matches.
 * Covers what the real corpus and Publisher's clipboard formats ship: raster
 * (png/jpeg/gif/bmp/webp/tiff) plus the two Windows metafile vectors
 * (emf/wmf) that arrive embedded but can't render in a browser <img>. The
 * HEIC and SVG cases are new (v1.4) — the photo intake needs them, and both
 * stay isomorphic (no node imports) so the browser can pre-reject too.
 */
export function sniffImageMime(bytes: Uint8Array): string | undefined {
  if (matchAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matchAt(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchAt(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // "GIF8"
  if (matchAt(bytes, 0, [0x42, 0x4d])) return "image/bmp"; // "BM"
  if (matchAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matchAt(bytes, 8, [0x57, 0x45, 0x42, 0x50]))
    return "image/webp"; // "RIFF"…"WEBP"
  if (matchAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || matchAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a]))
    return "image/tiff"; // little / big endian
  // HEIC/HEIF: an ISO-BMFF `ftyp` box (size u32 · "ftyp" · major brand · minor
  // version · compatible-brand list). A HEIC brand in the major-brand slot (8)
  // OR the compatible list (16+) wins — iPhone stills ship "heic"/"mif1". The
  // declared box size bounds the scan, clamped so a hostile size can't run us
  // off the end or walk megabytes.
  if (matchAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const declared =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const end = Math.min(declared || bytes.length, bytes.length, 64);
    if (HEIC_BRANDS.has(brandAt(bytes, 8))) return "image/heic";
    for (let o = 16; o + 4 <= end; o += 4) {
      if (HEIC_BRANDS.has(brandAt(bytes, o))) return "image/heic";
    }
  }
  // EMF: an ENHMETAHEADER (record type 01 00 00 00) with the " EMF" signature
  // at byte 40 — the type prefix alone collides with WMF, so require the sig.
  if (matchAt(bytes, 0, [0x01, 0x00, 0x00, 0x00]) && matchAt(bytes, 40, [0x20, 0x45, 0x4d, 0x46]))
    return "image/emf";
  // WMF: placeable header (Aldous magic) or a bare standard header.
  if (matchAt(bytes, 0, [0xd7, 0xcd, 0xc6, 0x9a]) || matchAt(bytes, 0, [0x01, 0x00, 0x09, 0x00]))
    return "image/wmf";
  // SVG: text-probe last, after every binary signature has had its say.
  if (looksLikeSvg(bytes)) return "image/svg+xml";
  return undefined;
}

/**
 * Natural pixel dimensions for the formats whose headers are cheap to read
 * (png/jpeg/gif) — the ones the corpus actually ships. Returns undefined when
 * unparseable so the asset entry simply omits width/height (both optional in
 * the schema).
 */
export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | undefined {
  const be16 = (o: number) => (bytes[o] << 8) | bytes[o + 1];
  const be32 = (o: number) => bytes[o] * 0x1000000 + (bytes[o + 1] << 16) + (bytes[o + 2] << 8) + bytes[o + 3];
  const le16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
  if (mime === "image/png") {
    // IHDR is the first chunk; width/height are its first two big-endian u32.
    if (bytes.length >= 24) return { width: be32(16), height: be32(20) };
    return undefined;
  }
  if (mime === "image/jpeg") {
    // Walk the marker segments to the first Start-Of-Frame (SOF0/1/2).
    let i = 2;
    while (i + 1 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // standalone markers carry no length
        continue;
      }
      if (i + 3 >= bytes.length) break;
      const len = be16(i + 2);
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        // SOF payload: precision(1), height(2), width(2)
        if (i + 8 >= bytes.length) break;
        return { width: be16(i + 7), height: be16(i + 5) };
      }
      i += 2 + len;
    }
    return undefined;
  }
  if (mime === "image/gif") {
    // Logical Screen Descriptor: width/height are little-endian u16 at 6/8.
    if (bytes.length >= 10) return { width: le16(6), height: le16(8) };
    return undefined;
  }
  return undefined;
}

/**
 * Does this MIME render in a browser <img>? png/jpeg/gif/bmp/webp do; the
 * Windows metafiles (wmf/emf) and tiff don't — those degrade to a placeholder
 * with a note (rasterization is backlog), never a broken image.
 */
export function isRenderableImage(mime: string): boolean {
  switch (mime) {
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/bmp":
    case "image/webp":
      return true;
    default:
      return false;
  }
}

/**
 * Deterministic content id for dedupe — a 32-bit FNV-1a hash of the base64
 * string, plus its length as a cheap collision guard. Identical payloads (the
 * corpus ships one bitmap 16× across sibling label frames) collapse to one
 * asset because the id is a pure function of the bytes.
 */
export function assetIdFor(dataB64: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < dataB64.length; i++) {
    h ^= dataB64.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `imp-a-${hex}-${dataB64.length}`;
}
