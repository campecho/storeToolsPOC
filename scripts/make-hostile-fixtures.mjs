#!/usr/bin/env node
/**
 * Synthesize the Photo Editor hostile corpus (fixtures/photo-corpus/hostile/) —
 * the committed adversarial artifacts the PE10 corpus line requires (photo plan
 * §4 PE10c, §5 "hostile set"). Each file is a tiny, fully DETERMINISTIC,
 * hand-authored buffer (no `sharp`, no randomness, no third-party content), so a
 * re-run reproduces byte-identical bytes and `hostile-corpus.test.ts` can pin
 * the real caps against a stable committed file.
 *
 * What each artifact proves (all asserted in hostile-corpus.test.ts):
 *   polyglot-zip.jpg     — a ZIP wearing a .jpg name: the byte-sniff refuses it
 *                          (never the extension) → not-an-image, pre-jail.
 *   truncated.jpg        — a valid JPEG SOI + JFIF start, then nothing: the jail
 *                          decode dies → decode-failed.
 *   truncated.heic       — a valid `ftyp`/heic box with no image payload: the
 *                          HEIC capability gate / transcode refuses it.
 *   pixel-bomb.png       — 68 bytes whose IHDR declares 50000×50000 (2.5 Gpx):
 *                          libvips refuses at the header read, at the DEFAULT
 *                          pixel cap, before any allocation → too-many-pixels.
 *   svg-script.svg       — a <script> element: librsvg has no JS engine, so it
 *                          rasterizes as inert vector art (no execution).
 *   svg-external-ref.svg — external <image href> to file:// and http://: librsvg
 *                          refuses both, so the raster stays the SVG's own size
 *                          with nothing fetched or read (no SSRF / no local read).
 *   svg-xxe-entity.svg   — an external-entity XXE: libxml2 refuses to define it
 *                          → parse error → decode-failed (no local file read).
 *   svg-billion-laughs.svg — nested entity amplification: libxml2's built-in
 *                          amplification cap trips → decode-failed (no DoS).
 *
 * Run from the repo root:  node scripts/make-hostile-fixtures.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const OUT = join(process.cwd(), "fixtures", "photo-corpus", "hostile");

/* PNG CRC-32 (poly 0xEDB88320) — a valid IHDR CRC is what makes libvips read
   the (huge) declared dimensions and refuse on the pixel cap, rather than
   bailing as a corrupt-header decode-failed. */
const crc32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** A 68-byte PNG whose IHDR declares 50000×50000 = 2.5 Gpx (≫ the 80 MP cap). */
function pixelBombPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(50000, 0); // width
  ihdr.writeUInt32BE(50000, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // 10..12: compression / filter / interlace = 0
  const idat = deflateSync(Buffer.alloc(30)); // minimal valid zlib — never inflated
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A ZIP local-file-header magic (PK\x03\x04) padded — sniffs as NOT an image. */
function polyglotZip() {
  const b = Buffer.alloc(64);
  b.set([0x50, 0x4b, 0x03, 0x04], 0);
  return b;
}

/** A valid JPEG SOI + JFIF APP0 start, then truncated — dies at jail decode. */
function truncatedJpeg() {
  // FFD8 SOI · FFE0 APP0 · length 0x0010 · "JFIF\0" · v1.1 — then nothing.
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  ]);
}

/** A valid ISO-BMFF `ftyp` box, major brand `heic`, no image payload. */
function truncatedHeic() {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18, // box size 24
    0x66, 0x74, 0x79, 0x70, // "ftyp"
    0x68, 0x65, 0x69, 0x63, // major brand "heic"
    0x00, 0x00, 0x00, 0x00, // minor version
    0x6d, 0x69, 0x66, 0x31, // compatible "mif1"
    0x68, 0x65, 0x69, 0x63, // compatible "heic"
  ]);
}

const SVG_SCRIPT = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80">
  <script type="text/javascript">globalThis.__PWNED__ = 1;</script>
  <rect width="100" height="80" fill="#3366aa"/>
</svg>
`;

// Two external references at once — a local-file read and a remote fetch. The
// remote host is an RFC 5737 TEST-NET address (guaranteed unroutable), so even
// if a build did attempt the fetch the test cannot hang on a live server.
const SVG_EXTERNAL_REF = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="90">
  <image xlink:href="file:///etc/passwd" x="0" y="0" width="120" height="90"/>
  <image xlink:href="http://192.0.2.1/secret.png" x="0" y="0" width="120" height="90"/>
  <rect x="10" y="10" width="30" height="30" fill="#cc0000"/>
</svg>
`;

const SVG_XXE = `<?xml version="1.0"?>
<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/hostname"> ]>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40">
  <text x="0" y="20">&xxe;</text>
</svg>
`;

function billionLaughs() {
  let ents = '<!ENTITY a0 "boom">';
  for (let i = 1; i <= 12; i++) ents += `<!ENTITY a${i} "&a${i - 1};&a${i - 1};&a${i - 1};">`;
  return `<?xml version="1.0"?>
<!DOCTYPE svg [ ${ents} ]>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40">
  <text x="0" y="20">&a12;</text>
</svg>
`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = {
    "polyglot-zip.jpg": polyglotZip(),
    "truncated.jpg": truncatedJpeg(),
    "truncated.heic": truncatedHeic(),
    "pixel-bomb.png": pixelBombPng(),
    "svg-script.svg": Buffer.from(SVG_SCRIPT, "utf8"),
    "svg-external-ref.svg": Buffer.from(SVG_EXTERNAL_REF, "utf8"),
    "svg-xxe-entity.svg": Buffer.from(SVG_XXE, "utf8"),
    "svg-billion-laughs.svg": Buffer.from(billionLaughs(), "utf8"),
  };
  for (const [name, buf] of Object.entries(files)) {
    await writeFile(join(OUT, name), buf);
    console.log(`wrote hostile/${name} (${buf.length} B)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
