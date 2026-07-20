#!/usr/bin/env node
/**
 * Synthesize the Photo Editor benign corpus finalizers (fixtures/photo-corpus/)
 * — the remaining named intake-robustness cases from the PE10 corpus list
 * (photo plan §4 PE10d, §5). All synthetic/authored, deterministic by
 * construction (SVG scenes of vector rects — NO fonts, NO randomness, NO
 * third-party content — rasterized once via sharp), so a re-run reproduces the
 * bytes and each file is a stable committed intake fixture.
 *
 *   phone-photo.jpg  — a phone-camera-like scene STORED 1024×768 landscape with
 *                      an EXIF Orientation=6 tag, so intake's auto-orient step
 *                      finally has a fixture that exercises it: the master comes
 *                      back 768×1024 with the "EXIF orientation applied" note.
 *   oversize.tiff    — 9100×9000 = 81.9 MP, past the 80 MP ceiling; deflate keeps
 *                      it ~260 KB on disk. The huge-TIFF case AND the oversize
 *                      route-away fixture (unit + e2e): libvips refuses it at the
 *                      header read → too-many-pixels → the route-away banner.
 *   screenshot.png   — a synthetic UI capture (title bar, sidebar, cards, text-
 *                      like bars): crisp opaque PNG, the screenshot intake case.
 *   ai-art.png       — a smooth-gradient "AI-generated art" stand-in (labeled;
 *                      the POC ships no AI detection) — the "Fix an AI file" case.
 *   scanned-doc.jpg  — an off-white page with text-like bars and a heading — the
 *                      scanned-document intake case.
 *
 * Honest gap: the multi-image Live-photo HEIC (primary-still extraction) is NOT
 * generated here — it needs `heif-enc` (libheif-examples) at generation time,
 * absent in the base dev/CI environment (present only on the Docker/live lane).
 * `iphone-still.heic` covers single-image HEIC intake today; the Live-photo case
 * is recorded as the one deferred benign fixture in the corpus README.
 *
 * Run from the repo root:  node scripts/make-benign-fixtures.mjs
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = join(process.cwd(), "fixtures", "photo-corpus");
const svg = (s) => Buffer.from(s, "utf8");

/** A phone-camera-like scene: sky gradient, sun, horizon, ground band. */
function phoneSceneSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a90d9"/><stop offset="0.7" stop-color="#bfe0f5"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="${w * 0.72}" cy="${h * 0.28}" r="${h * 0.09}" fill="#fff3c4"/>
    <rect y="${h * 0.68}" width="${w}" height="${h * 0.32}" fill="#6b8f3d"/>
    <rect y="${h * 0.68}" width="${w}" height="${h * 0.04}" fill="#5a7d31"/>
  </svg>`;
}

/** A UI screenshot: title bar, sidebar menu items, content cards + text bars. */
function screenshotSvg(w, h) {
  const bars = [];
  for (let i = 0; i < 5; i++) bars.push(`<rect x="60" y="${150 + i * 26}" width="${520 - i * 40}" height="10" rx="3" fill="#c7ccd6"/>`);
  const menu = [];
  for (let i = 0; i < 6; i++) menu.push(`<rect x="16" y="${120 + i * 44}" width="180" height="24" rx="5" fill="${i === 1 ? "#9a1818" : "#e4e7ee"}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#f4f5f8"/>
    <rect width="${w}" height="88" fill="#1f2733"/>
    <circle cx="34" cy="44" r="10" fill="#cc0000"/><circle cx="66" cy="44" r="10" fill="#e6b800"/><circle cx="98" cy="44" r="10" fill="#3aa655"/>
    <rect x="0" y="88" width="220" height="${h - 88}" fill="#232c39"/>
    ${menu.join("")}
    <rect x="252" y="120" width="${w - 300}" height="200" rx="10" fill="#ffffff"/>
    ${bars.join("")}
    <rect x="252" y="352" width="${(w - 320) / 2}" height="220" rx="10" fill="#ffffff"/>
    <rect x="${252 + (w - 320) / 2 + 16}" y="352" width="${(w - 320) / 2}" height="220" rx="10" fill="#ffffff"/>
  </svg>`;
}

/** Smooth overlapping gradients — an "AI-generated art" stand-in. */
function aiArtSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <radialGradient id="g1" cx="0.3" cy="0.3" r="0.8"><stop offset="0" stop-color="#ff7ab6"/><stop offset="1" stop-color="#6a5acd"/></radialGradient>
      <radialGradient id="g2" cx="0.75" cy="0.7" r="0.7"><stop offset="0" stop-color="#3ad1c8" stop-opacity="0.85"/><stop offset="1" stop-color="#3ad1c8" stop-opacity="0"/></radialGradient>
      <linearGradient id="g3" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffd36e" stop-opacity="0.7"/><stop offset="1" stop-color="#ff6e6e" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g1)"/>
    <rect width="${w}" height="${h}" fill="url(#g2)"/>
    <rect width="${w}" height="${h}" fill="url(#g3)"/>
    <circle cx="${w * 0.35}" cy="${h * 0.4}" r="${w * 0.22}" fill="#ffffff" opacity="0.12"/>
    <circle cx="${w * 0.68}" cy="${h * 0.62}" r="${w * 0.28}" fill="#20114a" opacity="0.14"/>
  </svg>`;
}

/** An off-white page with a heading bar and paragraph text-like bars. */
function scannedDocSvg(w, h) {
  const lines = [];
  let y = 260;
  for (let para = 0; para < 5; para++) {
    for (let i = 0; i < 6; i++) {
      const width = i === 5 ? 300 + ((para * 37) % 260) : w - 320;
      lines.push(`<rect x="160" y="${y}" width="${width}" height="14" rx="2" fill="#2a2a2a"/>`);
      y += 34;
    }
    y += 30;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#d8d4c8"/>
    <rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="#faf8f2"/>
    <rect x="160" y="150" width="${w - 640}" height="34" rx="3" fill="#111111"/>
    ${lines.join("")}
  </svg>`;
}

async function main() {
  const files = [];

  // phone-photo.jpg — stored landscape, EXIF Orientation=6 (rotate to portrait).
  const scene = await sharp(svg(phoneSceneSvg(1024, 768))).jpeg({ quality: 88 }).toBuffer();
  files.push([
    "phone-photo.jpg",
    await sharp(scene).withMetadata({ orientation: 6 }).jpeg({ quality: 88 }).toBuffer(),
  ]);

  // oversize.tiff — 81.9 MP, deflate-small, over the 80 MP ceiling.
  files.push([
    "oversize.tiff",
    await sharp({ create: { width: 9100, height: 9000, channels: 3, background: "#e8e8e8" } })
      .tiff({ compression: "deflate" })
      .toBuffer(),
  ]);

  // Screenshots and AI art are opaque — flatten the alpha the SVG raster carries
  // so they are true RGB PNGs (and open to a JPEG master, the opaque path).
  files.push(["screenshot.png", await sharp(svg(screenshotSvg(1200, 800))).flatten({ background: "#f4f5f8" }).png().toBuffer()]);
  files.push(["ai-art.png", await sharp(svg(aiArtSvg(1024, 1024))).flatten({ background: "#000000" }).png().toBuffer()]);
  files.push(["scanned-doc.jpg", await sharp(svg(scannedDocSvg(1240, 1754))).jpeg({ quality: 82 }).toBuffer()]);

  for (const [name, buf] of files) {
    await writeFile(join(OUT, name), buf);
    console.log(`wrote ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
