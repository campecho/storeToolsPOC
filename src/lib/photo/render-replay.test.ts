import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { AdjustParam, PhotoOp } from "@/lib/schema/photo";
import { collectAdjustState, compileAdjust } from "./adjust-math";
import { effectiveDims, straightenScale } from "./geometry";
import { applyAdjust } from "./ops";
import { compileRenderPlan, renderImage, UnsupportedRenderOp } from "./render-host";

/**
 * Live proof for the export spine (plan §4 PE3, the tranche that PROVES the
 * architecture). Two layers:
 *
 *  1. compileRenderPlan — the pure host-side compiler. Its folded dims must
 *     equal geometry.effectiveDims for the same recipe (parity by shared code),
 *     non-geometry ops must throw, and the straighten step must carry the
 *     shared straightenScale + pre-op dims.
 *  2. renderImage — the real jail replay. `sharp` ships with npm, so there is
 *     NO fixture mode: every case spawns the real photo-worker.mjs on a real
 *     image synthesized in-process, and asserts output dims + sampled pixels.
 *
 * The PE3 done-when is DETERMINISM: the same recipe + bytes renders
 * byte-identical twice (jpeg and png).
 */

const SRC = { w: 400, h: 300 };

/* -- op builders (every op carries a history label, schema §3.4) ----------- */
const crop = (
  rect: { x: number; y: number; w: number; h: number },
  shape: "rect" | "rounded" | "circle" = "rect",
): PhotoOp => ({ op: "crop", label: "Crop", rect, ratio: null, shape });
const rotate = (quarterTurns: number): PhotoOp => ({ op: "rotate", label: "Rotate", quarterTurns });
const flip = (axis: "horizontal" | "vertical"): PhotoOp => ({ op: "flip", label: "Flip", axis });
const straighten = (degrees: number): PhotoOp => ({ op: "straighten", label: "Straighten", degrees });
const adjust = (param: AdjustParam, value: number): PhotoOp => ({
  op: "adjust",
  label: `${param} ${value}`,
  param,
  value,
});
/** A still-unsupported op (renders from PE5) — the op-screen negative case. */
const resize = (): PhotoOp => ({ op: "resize", label: "Resize", mode: "percent", percent: 50, targetPx: { width: 100, height: 75 } });

/**
 * The expected RGBA for a source pixel under a recipe's TERMINAL adjust pass —
 * run through the SAME isomorphic core the worker copies (collectAdjustState →
 * compileAdjust → applyAdjust). Sampling a rendered pixel against this is a
 * per-pixel parity check; parity.test.ts covers the whole-image byte-exactness.
 */
function expectedPixel(
  src: [number, number, number, number],
  recipe: PhotoOp[],
): [number, number, number, number] {
  const buf = Uint8Array.from(src);
  applyAdjust(buf, compileAdjust(collectAdjustState(recipe)));
  return [buf[0], buf[1], buf[2], buf[3]];
}

/**
 * A 400×300 four-quadrant marker: TL red, TR green, BL blue, BR yellow — so a
 * crop/rotate/flip is verified by WHERE a known colour lands, not just by dims.
 */
function quadPng(w = SRC.w, h = SRC.h): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  const tl = [220, 30, 30];
  const tr = [30, 200, 30];
  const bl = [30, 30, 220];
  const br = [220, 200, 30];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 ? (y < h / 2 ? tl : bl) : y < h / 2 ? tr : br;
      const i = (y * w + x) * 3;
      raw[i] = c[0];
      raw[i + 1] = c[1];
      raw[i + 2] = c[2];
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** Decode a render output and sample one RGBA pixel + report its dims. */
async function sample(
  buf: Buffer,
  x: number,
  y: number,
): Promise<{ rgba: [number, number, number, number]; width: number; height: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { rgba: [data[i], data[i + 1], data[i + 2], data[i + 3]], width: info.width, height: info.height };
}

/** Dominant primary channel (r/g/b) at a pixel — robust to encoder jitter. */
function dominant([r, g, b]: [number, number, number, number]): "r" | "g" | "b" {
  if (r >= g && r >= b) return "r";
  if (g >= r && g >= b) return "g";
  return "b";
}

/* ========================================================================== */
/* compileRenderPlan — the pure compiler                                       */
/* ========================================================================== */

describe("compileRenderPlan — folded dims equal geometry.effectiveDims", () => {
  // Property-style across recipes; every crop rect is in-bounds of the running
  // effective image (the client clamps via clampRectToImage), so compile's
  // clamped extract dims coincide with effectiveDims' intDim fold.
  const recipes: { name: string; ops: PhotoOp[] }[] = [
    { name: "identity", ops: [] },
    { name: "rotate ×1 (swap)", ops: [rotate(1)] },
    { name: "rotate ×2 (no swap)", ops: [rotate(2)] },
    { name: "rotate ×1 twice (back to square)", ops: [rotate(1), rotate(1)] },
    { name: "rotate −1 (swap)", ops: [rotate(-1)] },
    { name: "rotate ×4 (identity, no step)", ops: [rotate(4)] },
    { name: "flip only", ops: [flip("horizontal")] },
    { name: "straighten only", ops: [straighten(3.2)] },
    { name: "crop", ops: [crop({ x: 50, y: 20, w: 200, h: 150 })] },
    { name: "crop then rotate", ops: [crop({ x: 50, y: 20, w: 200, h: 150 }), rotate(1)] },
    {
      name: "crop, straighten, flip",
      ops: [crop({ x: 10, y: 10, w: 300, h: 200 }), straighten(2), flip("vertical")],
    },
    { name: "rotate then crop (new frame)", ops: [rotate(1), crop({ x: 0, y: 0, w: 100, h: 120 })] },
  ];

  for (const { name, ops } of recipes) {
    it(`matches for: ${name}`, () => {
      const { out } = compileRenderPlan(ops, SRC);
      expect(out).toEqual(effectiveDims(SRC, ops));
    });
  }
});

describe("compileRenderPlan — op screening + step shape", () => {
  it("throws UnsupportedRenderOp on the first un-renderable op (not geometry, not tone), naming it", () => {
    try {
      compileRenderPlan([crop({ x: 0, y: 0, w: 100, h: 100 }), resize()], SRC);
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedRenderOp);
      expect((err as UnsupportedRenderOp).op).toBe("resize");
    }
  });

  it("does NOT throw on adjust/autoEnhance — they compile to a terminal pass", () => {
    expect(() =>
      compileRenderPlan([crop({ x: 0, y: 0, w: 100, h: 100 }), adjust("brightness", 12)], SRC),
    ).not.toThrow();
  });

  it("appends ONE terminal adjust step after geometry; dims unchanged by it", () => {
    const { steps, out } = compileRenderPlan(
      [crop({ x: 0, y: 0, w: 200, h: 150 }), adjust("brightness", 20), adjust("saturation", 40)],
      SRC,
    );
    // extract first, adjust last.
    expect(steps.map((s) => s.kind)).toEqual(["extract", "adjust"]);
    const last = steps[steps.length - 1];
    expect(last.kind).toBe("adjust");
    if (last.kind === "adjust") {
      expect(last.lutR).toHaveLength(256);
      expect(last.lutG).toHaveLength(256);
      expect(last.lutB).toHaveLength(256);
      expect(last.matrix).toHaveLength(9);
      expect(last.identityMatrix).toBe(false); // saturation ≠ 0 → real matrix
    }
    // adjust never moves the frame — out equals the crop's dims.
    expect(out).toEqual({ w: 200, h: 150 });
    expect(out).toEqual(effectiveDims(SRC, [crop({ x: 0, y: 0, w: 200, h: 150 })]));
  });

  it("emits NO adjust step when the adjust ops fold to identity (value 0)", () => {
    const { steps } = compileRenderPlan([crop({ x: 0, y: 0, w: 100, h: 100 }), adjust("brightness", 0)], SRC);
    expect(steps.map((s) => s.kind)).toEqual(["extract"]);
  });

  it("folds adjust ops last-wins, independent of position relative to geometry (pointwise commutes)", () => {
    // adjust BEFORE the crop and adjust AFTER the crop compile to the same
    // terminal step — a pointwise op commutes with the geometry around it.
    const before = compileRenderPlan([adjust("brightness", 15), crop({ x: 0, y: 0, w: 100, h: 100 })], SRC);
    const after = compileRenderPlan([crop({ x: 0, y: 0, w: 100, h: 100 }), adjust("brightness", 15)], SRC);
    const bAdj = before.steps.find((s) => s.kind === "adjust");
    const aAdj = after.steps.find((s) => s.kind === "adjust");
    expect(bAdj).toEqual(aAdj);
  });

  it("carries scale=straightenScale and the pre-op dims on the straighten step", () => {
    const { steps } = compileRenderPlan([straighten(4.2)], SRC);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      kind: "straighten",
      degrees: 4.2,
      scale: straightenScale(SRC, 4.2),
      width: 400,
      height: 300,
    });
  });

  it("computes the straighten scale against the CURRENT effective dims (post-crop)", () => {
    const { steps } = compileRenderPlan([crop({ x: 0, y: 0, w: 200, h: 100 }), straighten(3)], SRC);
    const st = steps.find((s) => s.kind === "straighten");
    expect(st).toBeDefined();
    if (st && st.kind === "straighten") {
      expect(st.width).toBe(200);
      expect(st.height).toBe(100);
      expect(st.scale).toBe(straightenScale({ w: 200, h: 100 }, 3));
    }
  });

  it("normalizes rotate turns (mod 4) and drops a 0-turn step", () => {
    expect(compileRenderPlan([rotate(4)], SRC).steps).toEqual([]);
    expect(compileRenderPlan([rotate(-1)], SRC).steps).toEqual([{ kind: "rotate", turns: 3 }]);
    expect(compileRenderPlan([rotate(7)], SRC).steps).toEqual([{ kind: "rotate", turns: 3 }]);
  });

  it("emits a shape only for rounded/circle crops", () => {
    const rect = compileRenderPlan([crop({ x: 0, y: 0, w: 100, h: 100 }, "rect")], SRC).steps[0];
    const circ = compileRenderPlan([crop({ x: 0, y: 0, w: 100, h: 100 }, "circle")], SRC).steps[0];
    expect(rect).toEqual({ kind: "extract", left: 0, top: 0, width: 100, height: 100 });
    expect(circ).toMatchObject({ kind: "extract", shape: "circle" });
  });
});

/* ========================================================================== */
/* renderImage — live jail replay                                              */
/* ========================================================================== */

describe("renderImage — geometry replays at full resolution", () => {
  it(
    "crops the top-right quadrant: dims 200×150 and the centre is green",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [crop({ x: 200, y: 0, w: 200, h: 150 })],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.mime).toBe("image/png");
      const s = await sample(out.bytes, 100, 75);
      expect([s.width, s.height]).toEqual([200, 150]);
      expect(dominant(s.rgba)).toBe("g"); // TR quadrant
    },
    30_000,
  );

  it(
    "rotate right swaps dims (300×400) and moves the TL quadrant to the top-right",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [rotate(1)],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const corner = await sample(out.bytes, 295, 5);
      expect([corner.width, corner.height]).toEqual([300, 400]);
      expect(dominant(corner.rgba)).toBe("r"); // original TL, now top-right
    },
    30_000,
  );

  it(
    "flip horizontal mirrors: the TR (green) quadrant lands top-left",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [flip("horizontal")],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const tl = await sample(out.bytes, 5, 5);
      expect([tl.width, tl.height]).toEqual([400, 300]);
      expect(dominant(tl.rgba)).toBe("g"); // was TR before the mirror
    },
    30_000,
  );

  it(
    "straighten a small angle leaves the dimensions unchanged (a quality cost, not a size cost)",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [straighten(2.5)],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const meta = await sharp(out.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([400, 300]);
    },
    30_000,
  );

  it(
    "circle-shape crop to PNG: the corner is transparent (alpha 0), the centre opaque",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [crop({ x: 100, y: 50, w: 200, h: 200 }, "circle")],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.mime).toBe("image/png");
      const corner = await sample(out.bytes, 0, 0);
      const centre = await sample(out.bytes, 100, 100);
      expect([corner.width, corner.height]).toEqual([200, 200]);
      expect(corner.rgba[3]).toBe(0); // outside the ellipse
      expect(centre.rgba[3]).toBe(255); // inside the ellipse
    },
    30_000,
  );

  it(
    "jpeg of a shaped crop flattens the alpha away (3 channels, no transparency)",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [crop({ x: 100, y: 50, w: 200, h: 200 }, "circle")],
        format: "jpeg",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.mime).toBe("image/jpeg");
      const meta = await sharp(out.bytes).metadata();
      expect(meta.channels).toBe(3);
      expect(Boolean(meta.hasAlpha)).toBe(false);
    },
    30_000,
  );

  it(
    "reports unsupported-op (never renders) when an un-renderable op sneaks into the recipe",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [resize()],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("unsupported-op");
      expect(out.message).toContain("resize");
    },
    30_000,
  );

  it(
    "fails decode-failed on an unreadable master rather than throwing",
    async () => {
      const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
      const out = await renderImage(garbage, { recipe: [rotate(1)], format: "png", quality: 90, intent: "srgb" });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("decode-failed");
    },
    30_000,
  );
});

/* ========================================================================== */
/* renderImage — the terminal tone/colour pass (PE4)                           */
/* ========================================================================== */

describe("renderImage — adjust replays as one terminal pointwise pass", () => {
  // A recipe that exercises BOTH the LUT (brightness) and the matrix
  // (saturation) legs of applyAdjust, so the sampled pixel proves the full path.
  const tone: PhotoOp[] = [adjust("brightness", 30), adjust("saturation", 50)];

  it(
    "adjust-only recipe: dims unchanged, sampled pixel matches the shared-core expectation",
    async () => {
      const out = await renderImage(await quadPng(), { recipe: tone, format: "png", quality: 90, intent: "srgb" });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const s = await sample(out.bytes, 100, 75); // deep inside the solid TL (red) quadrant
      expect([s.width, s.height]).toEqual([400, 300]); // pointwise → dims untouched
      // The TL quadrant is a solid [220,30,30]; PNG→PNG is lossless, so the
      // rendered pixel equals the isomorphic core's output byte-for-byte.
      expect(s.rgba).toEqual(expectedPixel([220, 30, 30, 255], tone));
    },
    30_000,
  );

  it(
    "crop THEN adjust: geometry first (frame moves), then the terminal tone pass on the cropped pixels",
    async () => {
      const recipe: PhotoOp[] = [crop({ x: 200, y: 0, w: 200, h: 150 }), ...tone]; // crop to TR (green)
      const out = await renderImage(await quadPng(), { recipe, format: "png", quality: 90, intent: "srgb" });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const s = await sample(out.bytes, 100, 75); // centre of the 200×150 cropped frame
      expect([s.width, s.height]).toEqual([200, 150]);
      // collectAdjustState ignores the crop, so the expectation is the tone pass
      // on the cropped (green) pixel.
      expect(s.rgba).toEqual(expectedPixel([30, 200, 30, 255], recipe));
    },
    30_000,
  );

  it(
    "adjust BEFORE a crop still applies terminally — identical to crop-then-adjust (pointwise commutes)",
    async () => {
      // A pointwise op commutes with the geometry around it, and compileRenderPlan
      // ALWAYS appends the folded adjust after all geometry, so recipe order
      // between the adjust and the crop cannot change the pixels. We prove it by
      // rendering both orders and asserting the shared sampled pixel agrees.
      const adjustFirst: PhotoOp[] = [...tone, crop({ x: 200, y: 0, w: 200, h: 150 })];
      const cropFirst: PhotoOp[] = [crop({ x: 200, y: 0, w: 200, h: 150 }), ...tone];
      const a = await renderImage(await quadPng(), { recipe: adjustFirst, format: "png", quality: 90, intent: "srgb" });
      const b = await renderImage(await quadPng(), { recipe: cropFirst, format: "png", quality: 90, intent: "srgb" });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      const sa = await sample(a.bytes, 100, 75);
      const sb = await sample(b.bytes, 100, 75);
      expect([sa.width, sa.height]).toEqual([200, 150]);
      expect(sa.rgba).toEqual(sb.rgba);
      expect(sa.rgba).toEqual(expectedPixel([30, 200, 30, 255], adjustFirst));
    },
    30_000,
  );
});

/* ========================================================================== */
/* Determinism — the PE3 done-when                                             */
/* ========================================================================== */

describe("renderImage — determinism (same recipe + bytes → byte-identical)", () => {
  const recipe: PhotoOp[] = [
    crop({ x: 20, y: 15, w: 300, h: 240 }),
    rotate(1),
    straighten(1.8),
    flip("vertical"),
  ];

  it(
    "produces byte-identical JPEG across two independent renders",
    async () => {
      const master = await quadPng();
      const a = await renderImage(master, { recipe, format: "jpeg", quality: 88, intent: "srgb" });
      const b = await renderImage(master, { recipe, format: "jpeg", quality: 88, intent: "srgb" });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.bytes.equals(b.bytes)).toBe(true);
    },
    45_000,
  );

  it(
    "produces byte-identical PNG across two independent renders",
    async () => {
      const master = await quadPng();
      const a = await renderImage(master, { recipe, format: "png", quality: 90, intent: "srgb" });
      const b = await renderImage(master, { recipe, format: "png", quality: 90, intent: "srgb" });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.bytes.equals(b.bytes)).toBe(true);
    },
    45_000,
  );
});
