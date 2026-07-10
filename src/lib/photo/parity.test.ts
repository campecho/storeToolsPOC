import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PhotoOp } from "@/lib/schema/photo";
import { collectAdjustState, compileAdjust } from "./adjust-math";
import { applyAdjust } from "./ops";
import { renderImage } from "./render-host";

/**
 * BYTE-EXACT tone/colour parity (plan §5 — "parity covered by tolerance
 * goldens", made byte-exact where the two paths are canvas-free integer
 * pipelines). The whole PE4 promise is WYSIWYG-by-shared-code (§1.3): the server
 * worker copies ops.ts `applyAdjust` verbatim, so a full-resolution export must
 * reproduce the isomorphic core EXACTLY — not within a tolerance.
 *
 * This test closes the loop the golden harness only checks against committed
 * bytes:
 *
 *   PATH A — the real server pipeline. renderImage(source, {recipe, png}) runs
 *            the jailed worker: decode → (geometry) → the terminal `adjust` step
 *            (the copied applyAdjust loop) → PNG encode. We then decode the
 *            result to raw RGBA.
 *   PATH B — the reference. Decode the SAME source to raw RGBA and run ops.ts
 *            applyAdjust(compileAdjust(collectAdjustState(recipe))) directly.
 *
 * Both are integer pipelines and PNG is lossless, so the two raw RGBA buffers
 * must be byte-identical. If they ever diverge the worker's copy has drifted
 * from ops.ts — a red test here, exactly the guard the worker comment promises.
 */

const W = 320;
const H = 240;

/** Paint a solid RGB block into a raw RGB buffer (in-bounds, no clipping math). */
function block(
  raw: Buffer,
  w: number,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
  [r, g, b]: [number, number, number],
): void {
  for (let y = y0; y < y0 + bh; y++) {
    for (let x = x0; x < x0 + bw; x++) {
      const i = (y * w + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
}

/**
 * A deterministic 320×240 RGB PNG: a tri-axis gradient (so nearly every LUT
 * entry is exercised) overpainted with saturated primaries, near-black,
 * near-white and a mid grey (so the saturation matrix and the 0/255 clamps both
 * bite). Synthesized in-process — no committed binary.
 */
function makeSourcePng(): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[i] = Math.round((x / (W - 1)) * 255); // R ramps across
      raw[i + 1] = Math.round((y / (H - 1)) * 255); // G ramps down
      raw[i + 2] = Math.round(((x + y) / (W + H - 2)) * 255); // B on the diagonal
    }
  }
  block(raw, W, 10, 10, 40, 40, [255, 0, 0]); // saturated red → saturation + temp gain
  block(raw, W, 60, 10, 40, 40, [0, 255, 0]); // saturated green
  block(raw, W, 110, 10, 40, 40, [0, 0, 255]); // saturated blue
  block(raw, W, 160, 10, 40, 40, [250, 250, 250]); // near-white → upper clamp
  block(raw, W, 210, 10, 40, 40, [4, 4, 4]); // near-black → lower clamp
  block(raw, W, 260, 10, 40, 40, [128, 128, 128]); // mid grey → contrast pivot
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

/** Decode any encoded image to a raw RGBA buffer (alpha forced present). */
async function toRawRgba(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

describe("PE4 tone/colour — server render is BYTE-EXACT to the ops.ts core", () => {
  // Non-identity, exercises the LUT (brightness/contrast/temperature) AND the
  // saturation matrix — the full applyAdjust path, both legs.
  const recipe: PhotoOp[] = [
    { op: "adjust", label: "Brightness +25", param: "brightness", value: 25 },
    { op: "adjust", label: "Contrast −15", param: "contrast", value: -15 },
    { op: "adjust", label: "Saturation +40", param: "saturation", value: 40 },
    { op: "adjust", label: "Warmth +30", param: "temperature", value: 30 },
  ];

  it(
    "renderImage output decodes to the same raw RGBA as applyAdjust on the source",
    async () => {
      const source = await makeSourcePng();

      // PATH A — the real jailed server pipeline.
      const rendered = await renderImage(source, { recipe, format: "png", quality: 90 });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;
      const a = await toRawRgba(rendered.bytes);

      // PATH B — the isomorphic reference, run directly in-test.
      const b = await toRawRgba(source);
      applyAdjust(b.data, compileAdjust(collectAdjustState(recipe)));

      expect([a.width, a.height]).toEqual([W, H]); // pointwise → dims unchanged
      expect([b.width, b.height]).toEqual([W, H]);
      // The teeth: BYTE-IDENTICAL, not within a tolerance.
      expect(a.data.equals(b.data)).toBe(true);
    },
    45_000,
  );

  it(
    "holds byte-exact for the tone-only (identity-matrix) path too",
    async () => {
      // No saturation → identityMatrix, the three-LUT-lookup fast path in both
      // the worker and ops.ts. Byte-exactness must hold there as well.
      const toneOnly: PhotoOp[] = [
        { op: "adjust", label: "Brightness +18", param: "brightness", value: 18 },
        { op: "adjust", label: "Warmth −20", param: "temperature", value: -20 },
      ];
      const source = await makeSourcePng();

      const rendered = await renderImage(source, { recipe: toneOnly, format: "png", quality: 90 });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;
      const a = await toRawRgba(rendered.bytes);

      const b = await toRawRgba(source);
      applyAdjust(b.data, compileAdjust(collectAdjustState(toneOnly)));

      expect(a.data.equals(b.data)).toBe(true);
    },
    45_000,
  );
});
