#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";

/**
 * Generate the print-preview lookup tables (redesign plan Phase 12, decision
 * 13) from the committed GRACoL2013_CRPC6 press profile:
 *
 *   src/lib/color/luts/cmyk-to-srgb.ts — N⁴ grid, 3 bytes per entry: what the
 *     press prints for a CMYK value, as the screen shows it.
 *   src/lib/color/luts/srgb-to-cmyk.ts — M³ grid, 4 bytes per entry: the
 *     separation the press profile assigns an sRGB value.
 *   src/lib/color/luts/samples.ts — off-grid reference samples the runtime
 *     interpolation (proof.ts) is unit-tested against.
 *
 * The transforms come from sharp's ICC pipeline — the same libvips/lcms
 * path the photo export uses, with the SAME profile — so the canvas preview
 * and the printed separation agree by construction. sharp applies the
 * PERCEPTUAL intent in both directions and exposes no other (pipeline.cc);
 * decision 13 records that as the intent of record.
 *
 * Usage: node scripts/gen-color-luts.mjs [--cmyk-steps N] [--rgb-steps M] [--report-only]
 *   --report-only prints the interpolation error for several grids and
 *   writes nothing; it's how the committed grid sizes were chosen.
 *
 * Deterministic: rerun after a profile change; `git status --porcelain
 * src/lib/color/luts` is the drift check.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICC_PATH = join(ROOT, "src", "lib", "photo", "profiles", "GRACoL2013_CRPC6.icc");
const OUT_DIR = join(ROOT, "src", "lib", "color", "luts");
const icc = readFileSync(ICC_PATH);
const iccSha = createHash("sha256").update(icc).digest("hex").slice(0, 16);

const args = process.argv.slice(2);
const argNum = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : Number(args[i + 1]);
};
// Committed grids (chosen from --report-only, 512 seeded off-grid samples):
//   cmyk→srgb  9 steps: max ΔE 2.09, mean 0.40 (19.7 KB)  — 13: 1.75/0.37 (86 KB), 17: 1.52/0.27 (251 KB)
//   srgb→cmyk 17 steps: max ΔE 3.17, mean 0.71 (19.7 KB)  —  9: 8.61/1.48,        33: 1.84/0.46 (144 KB)
// A mean under 1 ΔE is below the visible-difference threshold; the larger
// grids buy nothing a viewer can see for 10× the bundle weight.
const CMYK_STEPS = argNum("--cmyk-steps", 9);
const RGB_STEPS = argNum("--rgb-steps", 17);
const REPORT_ONLY = args.includes("--report-only");

/* ── A minimal uncompressed CMYK TIFF with the profile embedded ──
   (Photometric 5 = separated, InkSet 1 = CMYK, 0 = no ink, 255 = full ink.)
   sharp reads it and, because the profile is embedded, decodes through it. */
function cmykTiff(pixels, w, h) {
  const entries = [];
  const data = Buffer.from(pixels);
  const iccOffset = 8;
  const dataOffset = iccOffset + icc.length + (icc.length % 2);
  const ifdOffset = dataOffset + data.length + (data.length % 2);
  const bpsOffset = ifdOffset + 2 + 12 * 12 + 4;
  const add = (tag, type, count, value) => entries.push({ tag, type, count, value });
  add(256, 4, 1, w);
  add(257, 4, 1, h);
  add(258, 3, 4, bpsOffset);
  add(259, 3, 1, 1);
  add(262, 3, 1, 5);
  add(273, 4, 1, dataOffset);
  add(277, 3, 1, 4);
  add(278, 4, 1, h);
  add(279, 4, 1, data.length);
  add(284, 3, 1, 1);
  add(332, 3, 1, 1);
  add(34675, 7, icc.length, iccOffset);
  const buf = Buffer.alloc(bpsOffset + 8);
  buf.write("II", 0);
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdOffset, 4);
  icc.copy(buf, iccOffset);
  data.copy(buf, dataOffset);
  buf.writeUInt16LE(entries.length, ifdOffset);
  entries.forEach((e, i) => {
    const o = ifdOffset + 2 + i * 12;
    buf.writeUInt16LE(e.tag, o);
    buf.writeUInt16LE(e.type, o + 2);
    buf.writeUInt32LE(e.count, o + 4);
    if (e.type === 3 && e.count === 1) buf.writeUInt16LE(e.value, o + 8);
    else buf.writeUInt32LE(e.value, o + 8);
  });
  buf.writeUInt32LE(0, ifdOffset + 2 + entries.length * 12);
  for (let i = 0; i < 4; i++) buf.writeUInt16LE(8, bpsOffset + i * 2);
  return buf;
}

/** Exact press → screen for a list of CMYK (0–255 ink) quads. */
async function cmykToSrgbExact(quads) {
  const n = quads.length;
  const w = Math.min(n, 4096);
  const h = Math.ceil(n / w);
  const px = new Uint8Array(w * h * 4);
  quads.forEach((q, i) => px.set(q, i * 4));
  const { data } = await sharp(cmykTiff(px, w, h)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return quads.map((_, i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
}

/** Exact screen → press for a list of sRGB (0–255) triples. */
async function srgbToCmykExact(triples) {
  const n = triples.length;
  const w = Math.min(n, 4096);
  const h = Math.ceil(n / w);
  const px = new Uint8Array(w * h * 3);
  triples.forEach((t, i) => px.set(t, i * 3));
  const { data } = await sharp(px, { raw: { width: w, height: h, channels: 3 } })
    .toColourspace("cmyk")
    .withIccProfile(ICC_PATH)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return triples.map((_, i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]);
}

/* ── Grids ── */

function cmykGrid(steps) {
  const quads = [];
  const at = (i) => Math.round((i / (steps - 1)) * 255);
  for (let c = 0; c < steps; c++)
    for (let m = 0; m < steps; m++)
      for (let y = 0; y < steps; y++)
        for (let k = 0; k < steps; k++) quads.push([at(c), at(m), at(y), at(k)]);
  return quads;
}

function rgbGrid(steps) {
  const triples = [];
  const at = (i) => Math.round((i / (steps - 1)) * 255);
  for (let r = 0; r < steps; r++)
    for (let g = 0; g < steps; g++) for (let b = 0; b < steps; b++) triples.push([at(r), at(g), at(b)]);
  return triples;
}

/* ── The SAME interpolation proof.ts runs, in plain JS, for the error report ── */

function lerpN(table, steps, channelsOut, coords) {
  // coords: normalized 0–1 per input axis; multilinear over the grid.
  const dims = coords.length;
  const idx = [];
  const frac = [];
  for (const v of coords) {
    const x = Math.min(1, Math.max(0, v)) * (steps - 1);
    const i = Math.min(Math.floor(x), steps - 2);
    idx.push(i);
    frac.push(x - i);
  }
  const out = new Array(channelsOut).fill(0);
  const corners = 1 << dims;
  for (let corner = 0; corner < corners; corner++) {
    let weight = 1;
    let offset = 0;
    for (let d = 0; d < dims; d++) {
      const hi = (corner >> (dims - 1 - d)) & 1;
      weight *= hi ? frac[d] : 1 - frac[d];
      offset = offset * steps + idx[d] + hi;
    }
    if (weight === 0) continue;
    for (let ch = 0; ch < channelsOut; ch++) out[ch] += weight * table[offset * channelsOut + ch];
  }
  return out;
}

/* ── ΔE76 in Lab, for a human-scaled error figure ── */

function srgbToLab([r8, g8, b8]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(r8), lin(g8), lin(b8)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a, b) => {
  const la = srgbToLab(a);
  const lb = srgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};

/* ── Seeded samples (mulberry32) so the committed samples.ts is reproducible ── */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const rand = rng(20260911);
  const sampleCmyk = Array.from({ length: 512 }, () => [0, 0, 0, 0].map(() => Math.round(rand() * 255)));
  const sampleRgb = Array.from({ length: 512 }, () => [0, 0, 0].map(() => Math.round(rand() * 255)));
  const exactCmykToRgb = await cmykToSrgbExact(sampleCmyk);
  const exactRgbToCmyk = await srgbToCmykExact(sampleRgb);
  // Judge the RGB→CMYK table by the color it PRINTS: press-render both the
  // exact and the interpolated separations and compare those on screen.
  const exactRgbProof = await cmykToSrgbExact(exactRgbToCmyk);

  const report = [];
  const cmykSizes = REPORT_ONLY ? [9, 13, 17] : [CMYK_STEPS];
  const rgbSizes = REPORT_ONLY ? [9, 17, 33] : [RGB_STEPS];

  const tables = {};
  for (const steps of cmykSizes) {
    const grid = cmykGrid(steps);
    const rgb = await cmykToSrgbExact(grid);
    const table = new Uint8Array(rgb.flat());
    let max = 0;
    let sum = 0;
    sampleCmyk.forEach((q, i) => {
      const approx = lerpN(table, steps, 3, q.map((v) => v / 255)).map(Math.round);
      const d = deltaE(approx, exactCmykToRgb[i]);
      max = Math.max(max, d);
      sum += d;
    });
    report.push({ table: "cmyk→srgb", steps, bytes: table.length, maxDeltaE: +max.toFixed(2), meanDeltaE: +(sum / sampleCmyk.length).toFixed(2) });
    tables.cmyk = { steps, table };
  }
  for (const steps of rgbSizes) {
    const grid = rgbGrid(steps);
    const cmyk = await srgbToCmykExact(grid);
    const table = new Uint8Array(cmyk.flat());
    const approxSeps = sampleRgb.map((t) => lerpN(table, steps, 4, t.map((v) => v / 255)).map(Math.round));
    const approxProof = await cmykToSrgbExact(approxSeps);
    let max = 0;
    let sum = 0;
    approxProof.forEach((p, i) => {
      const d = deltaE(p, exactRgbProof[i]);
      max = Math.max(max, d);
      sum += d;
    });
    report.push({ table: "srgb→cmyk", steps, bytes: table.length, maxDeltaE: +max.toFixed(2), meanDeltaE: +(sum / sampleRgb.length).toFixed(2) });
    tables.rgb = { steps, table };
  }
  console.table(report);
  if (REPORT_ONLY) return;

  mkdirSync(OUT_DIR, { recursive: true });
  const header = (name, steps, channels, bytes) =>
    `/* GENERATED by scripts/gen-color-luts.mjs — do not edit.
 * ${name}: ${steps} steps per input channel, ${channels} bytes per entry (${bytes} bytes).
 * Profile: GRACoL2013_CRPC6.icc (sha256 ${iccSha}…), sharp ${sharp.versions.vips} (libvips), perceptual intent.
 * Rerun the script after a profile change; the committed bytes are the drift check. */
`;
  const module = (name, constName, steps, channels, table) =>
    header(name, steps, channels, table.length) +
    `export const ${constName}_STEPS = ${steps};\n` +
    `export const ${constName}_CHANNELS = ${channels};\n` +
    `export const ${constName}_B64 =\n  "${Buffer.from(table).toString("base64")}";\n`;
  writeFileSync(join(OUT_DIR, "cmyk-to-srgb.ts"), module("cmyk→srgb", "CMYK_TO_SRGB", tables.cmyk.steps, 3, tables.cmyk.table));
  writeFileSync(join(OUT_DIR, "srgb-to-cmyk.ts"), module("srgb→cmyk", "SRGB_TO_CMYK", tables.rgb.steps, 4, tables.rgb.table));

  // Off-grid reference samples for proof.test.ts: 48 of each direction, plus
  // the named colors the tests assert by eye (paper, the four process inks,
  // rich black, mid grey, brand red as CMYK and as sRGB).
  const named = {
    cmyk: [[0, 0, 0, 0], [255, 0, 0, 0], [0, 255, 0, 0], [0, 0, 255, 0], [0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 128], [0, 255, 255, 51]],
    rgb: [[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 128, 128], [204, 0, 0], [255, 128, 0]],
  };
  const namedCmykRgb = await cmykToSrgbExact(named.cmyk);
  const namedRgbCmyk = await srgbToCmykExact(named.rgb);
  const samples = {
    cmykToSrgb: [...named.cmyk.map((q, i) => ({ cmyk: q, srgb: namedCmykRgb[i] })), ...sampleCmyk.slice(0, 48).map((q, i) => ({ cmyk: q, srgb: exactCmykToRgb[i] }))],
    srgbToCmyk: [...named.rgb.map((t, i) => ({ srgb: t, cmyk: namedRgbCmyk[i] })), ...sampleRgb.slice(0, 48).map((t, i) => ({ srgb: t, cmyk: exactRgbToCmyk[i] }))],
  };
  writeFileSync(
    join(OUT_DIR, "samples.ts"),
    `/* GENERATED by scripts/gen-color-luts.mjs — do not edit. Exact profile
 * transforms (sharp, GRACoL2013_CRPC6 sha256 ${iccSha}…, perceptual) at points
 * OFF the committed grids, in 0–255 units: proof.test.ts bounds the runtime
 * interpolation against these. */
export const PROOF_SAMPLES = ${JSON.stringify(samples)} as const;
`,
  );
  console.log(`wrote ${OUT_DIR}: cmyk-to-srgb (${tables.cmyk.steps}^4), srgb-to-cmyk (${tables.rgb.steps}^3), samples`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
