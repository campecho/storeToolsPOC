#!/usr/bin/env node
/**
 * Synthesize the PE9 Clean-up corpus cases (fixtures/photo-corpus):
 *
 *   date-stamp.jpg    — a photo-like synthetic scene (sky gradient, sun glow,
 *                       textured ground) with a seven-segment orange film-camera
 *                       date stamp ("05·14·26") burned into the bottom-right —
 *                       the corpus's "remove the date stamp" case.
 *   phone-number.jpg  — a poster-like synthetic (textured paper, heading that
 *                       must SURVIVE the fill) with a large phone number
 *                       ("555-0142") burned in — the "remove the old phone
 *                       number" case.
 *   masks/*.png       — the matching brushed masks, in the erase mask contract:
 *                       GRAYSCALE-ON-BLACK, opaque; luminance 0 = keep,
 *                       255 = remove, soft edges = the blend feather. Built as
 *                       overlapping soft round dabs along the target, the same
 *                       shape the brush overlay produces.
 *
 * Deterministic by construction: the ground/paper texture is a seeded LCG (no
 * Math.random), the stamp digits are vector seven-segment rects (no font
 * dependency), and the poster text uses DejaVu Sans (present on the CI/Docker
 * images) — but these are one-shot COMMITTED fixtures (provenance in the corpus
 * README), so cross-environment font drift cannot move any golden.
 *
 * Run from the repo root:  node scripts/make-cleanup-fixtures.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = join(process.cwd(), "fixtures", "photo-corpus");
const W = 1200;
const H = 900;

/* Seeded LCG (numerical recipes constants) — the corpus's no-Math.random rule. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Raw RGB noise plate: per-pixel luminance jitter around 0 (±amp). */
function noisePlate(w, h, amp, seed) {
  const rnd = lcg(seed);
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(128 + (rnd() * 2 - 1) * amp);
    buf[i * 3] = v;
    buf[i * 3 + 1] = v;
    buf[i * 3 + 2] = v;
  }
  return buf;
}

/* ---------------- seven-segment date stamp (vector, font-free) ------------- */

//  segments: a=top b=top-right c=bottom-right d=bottom e=bottom-left f=top-left g=middle
const SEG = {
  0: "abcdef",
  1: "bc",
  2: "abged",
  3: "abgcd",
  4: "fgbc",
  5: "afgcd",
  6: "afgedc",
  7: "abc",
  8: "abcdefg",
  9: "abfgcd",
};

/** SVG rects for one seven-segment digit at (x,y), digit height `dh`. */
function segDigit(d, x, y, dh, color) {
  const t = dh * 0.14; // segment thickness
  const w = dh * 0.52; // digit width
  const on = SEG[d];
  const seg = {
    a: [x + t * 0.6, y, w - t * 1.2, t],
    g: [x + t * 0.6, y + dh / 2 - t / 2, w - t * 1.2, t],
    d: [x + t * 0.6, y + dh - t, w - t * 1.2, t],
    f: [x, y + t * 0.6, t, dh / 2 - t],
    b: [x + w - t, y + t * 0.6, t, dh / 2 - t],
    e: [x, y + dh / 2 + t * 0.4, t, dh / 2 - t],
    c: [x + w - t, y + dh / 2 + t * 0.4, t, dh / 2 - t],
  };
  let out = "";
  for (const k of on) {
    const [rx, ry, rw, rh] = seg[k];
    out += `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="${(t / 3).toFixed(1)}" fill="${color}"/>`;
  }
  return out;
}

/** "05·14·26" as seven-segment groups with dot separators, right-aligned. */
function dateStampSvg(right, baselineY, dh, color) {
  const w = dh * 0.52;
  const gap = dh * 0.18;
  const dotGap = dh * 0.42;
  const groups = [
    [0, 5],
    [1, 4],
    [2, 6],
  ];
  // total width: 6 digits + 4 intra gaps + 2 dot separators
  const total = 6 * w + 4 * gap + 2 * dotGap;
  let x = right - total;
  let svg = "";
  const y = baselineY - dh;
  for (let gi = 0; gi < groups.length; gi++) {
    for (const d of groups[gi]) {
      svg += segDigit(d, x, y, dh, color);
      x += w + gap;
    }
    if (gi < 2) {
      x -= gap;
      svg += `<circle cx="${(x + dotGap / 2).toFixed(1)}" cy="${(y + dh * 0.72).toFixed(1)}" r="${(dh * 0.07).toFixed(1)}" fill="${color}"/>`;
      x += dotGap;
    }
  }
  return svg;
}

/* ------------------------------- scenes ----------------------------------- */

async function makeDateStamp() {
  const stamp = dateStampSvg(W - 60, H - 52, 56, "#ff9d2e");
  const glow = dateStampSvg(W - 60, H - 52, 56, "#ff9d2e");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6ea8e0"/><stop offset="1" stop-color="#dcedfb"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fa15a"/><stop offset="1" stop-color="#54703c"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.22" cy="0.18" r="0.3">
      <stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#fff6d8" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="${W}" height="${H * 0.58}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>
  <ellipse cx="${W * 0.7}" cy="${H * 0.6}" rx="${W * 0.65}" ry="${H * 0.12}" fill="#8fae68"/>
  <rect y="${H * 0.58}" width="${W}" height="${H * 0.42}" fill="url(#ground)"/>
  <ellipse cx="${W * 0.25}" cy="${H * 0.78}" rx="${W * 0.3}" ry="${H * 0.07}" fill="#4c6836" opacity="0.55"/>
  <ellipse cx="${W * 0.85}" cy="${H * 0.9}" rx="${W * 0.25}" ry="${H * 0.06}" fill="#61804a" opacity="0.6"/>
  <g filter="url(#blur6)" opacity="0.55">${glow}</g>
  ${stamp}
</svg>`;

  const noise = await sharp(noisePlate(W / 2, H / 2, 14, 20260712), {
    raw: { width: W / 2, height: H / 2, channels: 3 },
  })
    .resize(W, H, { kernel: "cubic" })
    .png()
    .toBuffer();

  const jpg = await sharp(Buffer.from(svg))
    .composite([{ input: noise, blend: "overlay" }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await writeFile(join(OUT, "date-stamp.jpg"), jpg);

  // Brushed mask: soft dabs along the stamp's box. The digits span x 878..1140,
  // y 792..848 (right-aligned at (W-60, H-52), digit height 56); r=52 dabs keep
  // the SOLID mask core over the whole stamp with a few px margin, feather beyond.
  await writeMask("date-stamp.png", dabsAlong(860, H - 80, W - 40, H - 80, 52, 10), 1);
}

async function makePhoneNumber() {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6efdd"/><stop offset="1" stop-color="#eadfc4"/>
    </linearGradient>
    <radialGradient id="vin" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.18"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#paper)"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="#8a3033" stroke-width="10"/>
  <text x="${W / 2}" y="230" font-family="DejaVu Sans" font-weight="bold" font-size="120" fill="#2b3a55" text-anchor="middle">SUMMER SALE</text>
  <text x="${W / 2}" y="360" font-family="DejaVu Sans" font-size="54" fill="#5a4a33" text-anchor="middle">everything must go</text>
  <text x="${W / 2}" y="600" font-family="DejaVu Sans" font-size="46" fill="#5a4a33" text-anchor="middle">call us today</text>
  <text x="${W / 2}" y="720" font-family="DejaVu Sans" font-weight="bold" font-size="110" fill="#8a3033" text-anchor="middle">555-0142</text>
  <rect width="${W}" height="${H}" fill="url(#vin)"/>
</svg>`;

  const noise = await sharp(noisePlate(W / 2, H / 2, 10, 555_0142), {
    raw: { width: W / 2, height: H / 2, channels: 3 },
  })
    .resize(W, H, { kernel: "cubic" })
    .png()
    .toBuffer();

  const jpg = await sharp(Buffer.from(svg))
    .composite([{ input: noise, blend: "overlay" }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await writeFile(join(OUT, "phone-number.jpg"), jpg);

  // Brushed mask over the number line (digits span ~x 310..890, y 640..722);
  // r=78 keeps the solid core over the full glyph height.
  await writeMask("phone-number.png", dabsAlong(330, 678, 870, 678, 78, 10), 2);
}

/* ------------------------------- masks ------------------------------------ */

/** Overlapping soft dab centres along a line — the brush overlay's stroke shape. */
function dabsAlong(x0, y0, x1, y1, r, n) {
  const dabs = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    dabs.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, r });
  }
  return dabs;
}

/** Grayscale-on-black opaque PNG per the erase mask contract (white = remove,
    soft radial edges = the blend feather). */
async function writeMask(name, dabs, _seed) {
  const stops = dabs
    .map(
      (d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r}" fill="url(#soft)"/>`,
    )
    .join("");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="soft" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.62" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#000"/>
  ${stops}
</svg>`;
  // Flatten-on-black + greyscale mirrors the worker's read side exactly.
  const png = await sharp(Buffer.from(svg))
    .flatten({ background: "#000" })
    .greyscale()
    .png()
    .toBuffer();
  await writeFile(join(OUT, "masks", name), png);
}

await mkdir(join(OUT, "masks"), { recursive: true });
await makeDateStamp();
await makePhoneNumber();
console.log("wrote date-stamp.jpg, phone-number.jpg, masks/{date-stamp,phone-number}.png");
