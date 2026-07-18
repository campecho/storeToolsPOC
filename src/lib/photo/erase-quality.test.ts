import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { ErasePayload, PhotoOp, RenderPayload } from "@/lib/schema/photo";
import { eraseFill, renderImage } from "./render-host";

/**
 * The PE9 Clean-up DONE-WHEN acceptance suite (photo plan §4 PE9) — the honest
 * proof that the real classical fill removes an object and returns a plausible,
 * deterministic patch on the committed corpus cases. Like render-host.test.ts
 * this is server-side test code, so `sharp` decodes the outputs directly (no
 * fixture-free mode — the fill is ALWAYS live: every case spawns the real
 * photo-worker.mjs through eraseFill).
 *
 * Four per-case assertions drive eraseFill on each corpus case, mirroring the
 * fill's own contract (photo-worker.mjs classicalFill):
 *   (a) INK GONE       — no pixel in the SOLID-mask region survives near the
 *                        target ink colour (the reconstruct-from-surround base).
 *   (b) SURROUND KEPT  — mask-luminance-0 pixels are byte-identical to the source
 *                        window (the a=0 keep guarantee, the mask contract).
 *   (c) PLAUSIBLE FILL — the filled region's mean RGB tracks the surrounding
 *                        keep-band's mean (the fill diffuses FROM the surround,
 *                        not from anywhere else).
 *   (d) DETERMINISM    — two runs → byte-identical patch (the stored-explicit
 *                        contract's teeth; a repo invariant).
 * Plus one INTEGRATION assertion: a full renderImage that composites the
 * eraseFill patch INLINE and then applies a terminal adjust — proving tone lands
 * OVER the patch (the inline-before-terminal-adjust contract, compileRenderPlan).
 *
 * The corpus fixtures (date-stamp.jpg / phone-number.jpg + masks/) are committed
 * and visually verified (scripts/make-cleanup-fixtures.mjs; corpus README). Both
 * sources are 1200×900; an empty recipe means the effective image IS the master.
 */

const CORPUS_DIR = join(process.cwd(), "fixtures", "photo-corpus");
const SOLID = 200; // mask luminance ≥ SOLID ⇒ a fully-reconstructed core pixel

interface EraseCase {
  name: string;
  src: string;
  mask: string;
  /** Fill rect in effective (= master) px, enclosing the mask with a keep margin. */
  rect: { x: number; y: number; w: number; h: number };
  /** The burned-in ink to prove GONE (target-image colour, RGB). */
  ink: [number, number, number];
}

// The date-stamp rect ({780,740,420,150}) is the plan's verified case (~300ms).
// The phone rect ({240,614,730,174}) is its analogue: it encloses the number
// (~x 310..890, y 640..722) and the solid mask core (≈ x 282..918, y 630..726)
// with a margin, its top edge sitting in the clean paper gap BELOW "call us
// today" (baseline y 600) so the keep-band stays background, not heading text —
// the "SUMMER SALE" heading and the border sit far outside the rect and survive.
const CASES: EraseCase[] = [
  { name: "date-stamp", src: "date-stamp.jpg", mask: "masks/date-stamp.png", rect: { x: 780, y: 740, w: 420, h: 150 }, ink: [255, 157, 46] },
  { name: "phone-number", src: "phone-number.jpg", mask: "masks/phone-number.png", rect: { x: 240, y: 614, w: 730, h: 174 }, ink: [138, 48, 51] },
];

/** Decode a buffer to raw RGBA (alpha ensured) + its dims. */
async function rawRGBA(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The mask window EXACTLY as the worker reads it (photo-worker.mjs erase): resize
 * to the effective dims, flatten any alpha onto BLACK, take one greyscale channel
 * (luminance is the fill factor per the ErasePayloadSchema mask contract), then
 * crop the rect. So the SOLID/keep classification here is the same signal
 * classicalFill saw — the assertions read the fill's own inputs, not a guess.
 */
async function maskWindow(maskBuf: Buffer, effW: number, effH: number, rect: EraseCase["rect"]): Promise<Buffer> {
  return sharp(maskBuf)
    .resize(effW, effH, { fit: "fill" })
    .flatten({ background: "#000000" })
    .greyscale()
    .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
    .raw()
    .toBuffer();
}

/** The rect window of the SOURCE effective image (empty recipe → the master),
    raw RGBA — the ground truth for the a=0 keep guarantee. */
async function sourceWindow(master: Buffer, rect: EraseCase["rect"]): Promise<Buffer> {
  return sharp(master)
    .ensureAlpha()
    .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
    .raw()
    .toBuffer();
}

/** Euclidean RGB distance — the "near the ink" metric for the INK GONE gate. */
function colourDist(px: Buffer, o: number, c: [number, number, number]): number {
  return Math.sqrt((px[o] - c[0]) ** 2 + (px[o + 1] - c[1]) ** 2 + (px[o + 2] - c[2]) ** 2);
}

const emptyPayload = (rect: EraseCase["rect"]): ErasePayload => ({
  recipe: [],
  mask: { width: 1200, height: 900, rect },
});

for (const c of CASES) {
  describe(`eraseFill acceptance — ${c.name}`, () => {
    let patch: { data: Buffer; width: number; height: number };
    let mwin: Buffer; // mask window (single-channel luminance), the worker's read
    let swin: Buffer; // source window, raw RGBA

    beforeAll(async () => {
      const master = readFileSync(join(CORPUS_DIR, c.src));
      const mask = readFileSync(join(CORPUS_DIR, c.mask));
      const meta = await sharp(master).metadata();
      const effW = meta.width ?? 0;
      const effH = meta.height ?? 0;
      const out = await eraseFill(master, emptyPayload(c.rect), mask);
      expect(out.ok).toBe(true);
      if (!out.ok) throw new Error(`eraseFill failed: ${out.code} ${out.message}`);
      expect([out.width, out.height]).toEqual([c.rect.w, c.rect.h]);
      patch = await rawRGBA(out.bytes);
      mwin = await maskWindow(mask, effW, effH, c.rect);
      swin = await sourceWindow(master, c.rect);
    }, 30_000);

    it("(a) INK GONE — no solid-mask pixel survives near the target ink", () => {
      // The reconstruct-from-surround base overwrites every mask≥HARD pixel; in
      // the SOLID core (a ≈ 1) the ink cannot bleed through. `< 60` is comfortably
      // inside the tens-of-units the fill leaves between the surround and the ink.
      let survivors = 0;
      for (let i = 0; i < mwin.length; i++) {
        if (mwin[i] >= SOLID && colourDist(patch.data, i * 4, c.ink) < 60) survivors++;
      }
      expect(survivors).toBe(0);
    });

    it("(b) SURROUND PRESERVED — mask-0 pixels are byte-identical to the source", () => {
      // The soft-mask blend leaves a=0 pixels untouched (out = orig·1 + fill·0),
      // so the keep band of the patch is the source window byte-for-byte — the
      // fill only ever repaints inside the brush.
      let mismatches = 0;
      for (let i = 0; i < mwin.length; i++) {
        if (mwin[i] !== 0) continue;
        const o = i * 4;
        if (
          patch.data[o] !== swin[o] ||
          patch.data[o + 1] !== swin[o + 1] ||
          patch.data[o + 2] !== swin[o + 2] ||
          patch.data[o + 3] !== swin[o + 3]
        ) {
          mismatches++;
        }
      }
      expect(mismatches).toBe(0);
    });

    it("(c) PLAUSIBLE FILL — the filled region's mean tracks the keep-band's mean", () => {
      // The onion-peel diffusion pulls the fill FROM the rect's known (keep-band)
      // pixels, so the reconstructed core's mean colour must sit next to the
      // surround's — proof the fill samples the neighbourhood, not the ink or a
      // constant. Per-channel |Δ| ≤ 25.
      const fill = [0, 0, 0];
      let fillN = 0;
      const keep = [0, 0, 0];
      let keepN = 0;
      for (let i = 0; i < mwin.length; i++) {
        const o = i * 4;
        if (mwin[i] >= SOLID) {
          fill[0] += patch.data[o];
          fill[1] += patch.data[o + 1];
          fill[2] += patch.data[o + 2];
          fillN++;
        } else if (mwin[i] === 0) {
          keep[0] += patch.data[o];
          keep[1] += patch.data[o + 1];
          keep[2] += patch.data[o + 2];
          keepN++;
        }
      }
      expect(fillN).toBeGreaterThan(0);
      expect(keepN).toBeGreaterThan(0);
      for (let ch = 0; ch < 3; ch++) {
        expect(Math.abs(fill[ch] / fillN - keep[ch] / keepN)).toBeLessThanOrEqual(25);
      }
    });

    it(
      "(d) DETERMINISM — two eraseFill runs are byte-identical",
      async () => {
        const master = readFileSync(join(CORPUS_DIR, c.src));
        const mask = readFileSync(join(CORPUS_DIR, c.mask));
        const a = await eraseFill(master, emptyPayload(c.rect), mask);
        const b = await eraseFill(master, emptyPayload(c.rect), mask);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(a.bytes.equals(b.bytes)).toBe(true);
      },
      45_000,
    );
  });
}

/* ========================================================================== */
/* Integration — the fill patch composites INLINE, under the terminal adjust   */
/* ========================================================================== */

/** A stored-explicit erase op (PE9): compile emits an inline composite of
    `erase-<id>.png` at the op's recipe position, before the terminal adjust. */
const eraseOp = (id: string, rect: EraseCase["rect"]): PhotoOp => ({
  op: "erase",
  label: "Remove object",
  maskAssetId: `corpus:${id}-mask`,
  patch: { id, assetId: `corpus:${id}-patch`, rect },
});
const brightness = (value: number): PhotoOp => ({ op: "adjust", label: `Brightness ${value}`, param: "brightness", value });

describe("erase integration — patch composites inline, tone applies over it (PE9)", () => {
  it(
    "renders date-stamp with [erase + adjust]: the stamp is no longer orange, and the tone shifts the patch",
    async () => {
      const master = readFileSync(join(CORPUS_DIR, "date-stamp.jpg"));
      const mask = readFileSync(join(CORPUS_DIR, "masks", "date-stamp.png"));
      const rect = { x: 780, y: 740, w: 420, h: 150 };
      const ink: [number, number, number] = [255, 157, 46];

      // Generate the stored-explicit patch ONCE via the real fill, then feed it
      // to renderImage as the op's attachment (the route's flow, §3.6).
      const filled = await eraseFill(master, emptyPayload(rect), mask);
      expect(filled.ok).toBe(true);
      if (!filled.ok) return;
      const attachments = { "erase-date-stamp.png": filled.bytes };

      // PNG (lossless) so the sampled pixel is an exact, argument-free assertion.
      const base: Omit<RenderPayload, "recipe"> = { format: "png", quality: 90, intent: "srgb" };
      const withAdjust = await renderImage(
        master,
        { ...base, recipe: [eraseOp("date-stamp", rect), brightness(20)] },
        attachments,
      );
      const noAdjust = await renderImage(master, { ...base, recipe: [eraseOp("date-stamp", rect)] }, attachments);
      expect(withAdjust.ok && noAdjust.ok).toBe(true);
      if (!withAdjust.ok || !noAdjust.ok) return;

      // Sample the heart of the old stamp (a digit centre, well inside the rect).
      const sx = 1000;
      const sy = 820;
      const decodeAt = async (buf: Buffer): Promise<[number, number, number]> => {
        const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const o = (sy * info.width + sx) * 4;
        return [data[o], data[o + 1], data[o + 2]];
      };
      const withPx = await decodeAt(withAdjust.bytes);
      const noPx = await decodeAt(noAdjust.bytes);

      // The patch removed the ink: the stamp region is no longer near orange.
      expect(colourDist(Buffer.from(withPx), 0, ink)).toBeGreaterThan(60);
      // The patch composited BEFORE the terminal adjust, so brightness +20 reached
      // its pixels — the with-adjust render DIFFERS from the un-adjusted one at the
      // very pixels the fill painted (tone over the patch, unlike an overlay).
      expect(withPx).not.toEqual(noPx);
      expect(withPx[0]).toBeGreaterThan(noPx[0]); // +brightness lifts the channel
    },
    45_000,
  );
});
