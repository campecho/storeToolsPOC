import { readFileSync } from "node:fs";
import { join } from "node:path";
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
/* -- PE5 print-geometry op builders (stored-explicit, schema §3.4) ---------- */
const resizeOp = (width: number, height: number): PhotoOp => ({
  op: "resize",
  label: "Resize",
  mode: "px",
  px: { width, height },
  targetPx: { width, height },
});
const bleed = (
  px: number,
  strategy: "mirror" | "smear" | "solid" = "mirror",
  color?: string,
): PhotoOp => ({
  op: "bleedExpand",
  label: "Expand bleed 0.125 in",
  strategy,
  amount: 0.125,
  px,
  ...(color ? { color } : {}),
});
const fitFill = (rect: { x: number; y: number; w: number; h: number }): PhotoOp => ({
  op: "fitToSize",
  label: "Fit (fill)",
  mode: "fill",
  anchor: "center",
  rect,
});
const fitPad = (pad: { l: number; t: number; r: number; b: number }): PhotoOp => ({
  op: "fitToSize",
  label: "Fit (pad)",
  mode: "fit",
  anchor: "center",
  pad,
});
/** A stored-explicit erase op (PE9): its patch rides an `erase-<id>.png`
    attachment, and compile emits an inline composite at the op's recipe position. */
const eraseOp = (
  id: string,
  rect: { x: number; y: number; w: number; h: number },
): PhotoOp => ({
  op: "erase",
  label: "Remove object",
  maskAssetId: `photo:mask-${id}`,
  patch: { id, assetId: `photo:patch-${id}`, rect },
});
/* -- PE6 overlay op builders (the client's HISTORY representation; compile skips
      them — the pixels ride the payload.overlays sidecar as PNG rasters) -------- */
const textOverlayOp = (id: string): PhotoOp => ({
  op: "textOverlay",
  label: "Add text",
  id,
  text: "hi",
  font: { family: "Arimo", size: 24, bold: false, italic: false },
  color: "#000000",
  align: "left",
  box: { x: 0, y: 0, w: 50, h: 20 },
  rotation: 0,
});
const logoOverlayOp = (id: string): PhotoOp => ({
  op: "logoOverlay",
  label: "Add image",
  id,
  assetId: "asset-1",
  box: { x: 0, y: 0, w: 40, h: 40 },
  rotation: 0,
});

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
    // PE5 print-geometry ops (resize / bleedExpand / fitToSize) fold here too.
    { name: "resize", ops: [resizeOp(120, 90)] },
    { name: "bleed mirror", ops: [bleed(20, "mirror")] },
    { name: "bleed solid", ops: [bleed(15, "solid", "#ffffff")] },
    { name: "crop then bleed", ops: [crop({ x: 10, y: 10, w: 200, h: 150 }), bleed(12)] },
    { name: "fit fill (crop to aspect)", ops: [fitFill({ x: 20, y: 0, w: 300, h: 300 })] },
    { name: "fit pad (white padding)", ops: [fitPad({ l: 10, t: 0, r: 10, b: 0 })] },
    { name: "resize then bleed", ops: [resizeOp(200, 200), bleed(10, "smear")] },
  ];

  for (const { name, ops } of recipes) {
    it(`matches for: ${name}`, () => {
      const { out } = compileRenderPlan(ops, SRC);
      expect(out).toEqual(effectiveDims(SRC, ops));
    });
  }
});

describe("compileRenderPlan — op screening + step shape", () => {
  it("compiles an erase op to an inline composite at its recipe position — before the terminal adjust and any overlays", () => {
    // The erase patch is photo content placed back at the op's position: its
    // composite lands INSIDE the loop (before the folded terminal adjust) so tone
    // applies over it, and before the overlay composites (which sit above).
    const { steps } = compileRenderPlan(
      [
        crop({ x: 0, y: 0, w: 200, h: 150 }),
        eraseOp("e1", { x: 20, y: 10, w: 60, h: 40 }),
        adjust("brightness", 15),
      ],
      SRC,
      [{ id: "ov", left: 0, top: 0, width: 20, height: 20 }],
    );
    // extract (crop) → erase composite (inline) → terminal adjust → overlay composite.
    expect(steps.map((s) => s.kind)).toEqual(["extract", "composite", "adjust", "composite"]);
    expect(steps[1]).toEqual({ kind: "composite", file: "erase-e1.png", left: 20, top: 10, width: 60, height: 40 });
    expect(steps[3]).toEqual({ kind: "composite", file: "overlay-ov.png", left: 0, top: 0, width: 20, height: 20 });
  });

  it("clamps an erase rect that overflows the current effective image (the crop-extract clamp)", () => {
    // After a crop to 200×150, an erase rect anchored past the edge is clamped so
    // the composite never addresses a pixel outside the frame; dims unchanged.
    const { steps, out } = compileRenderPlan(
      [crop({ x: 0, y: 0, w: 200, h: 150 }), eraseOp("e2", { x: 180, y: 130, w: 60, h: 60 })],
      SRC,
    );
    expect(steps).toEqual([
      { kind: "extract", left: 0, top: 0, width: 200, height: 150 },
      { kind: "composite", file: "erase-e2.png", left: 140, top: 90, width: 60, height: 60 },
    ]);
    expect(out).toEqual({ w: 200, h: 150 }); // an erase never moves the frame
  });

  it("still throws UnsupportedRenderOp on a genuinely unknown op tag (the guard behind the op-screen)", () => {
    // Every real PhotoOp tag now compiles; the throw is defence in depth for a tag
    // the union might grow without a compile case. Force one past the types.
    const bogus = { op: "teleport", label: "Teleport" } as unknown as PhotoOp;
    expect(() => compileRenderPlan([bogus], SRC)).toThrow(UnsupportedRenderOp);
  });

  it("compiles the PE5 print-geometry ops (resize / bleedExpand / fitToSize) into steps", () => {
    // bleedExpand → an extend step on all four edges (mirror carries no colour).
    expect(compileRenderPlan([bleed(20, "mirror")], SRC).steps).toEqual([
      { kind: "extend", left: 20, top: 20, right: 20, bottom: 20, strategy: "mirror" },
    ]);
    // a solid bleed carries its fill colour.
    expect(compileRenderPlan([bleed(15, "solid", "#abcdef")], SRC).steps).toEqual([
      { kind: "extend", left: 15, top: 15, right: 15, bottom: 15, strategy: "solid", color: "#abcdef" },
    ]);
    // fitToSize fill → an extract step (REUSING the crop step kind, no shape).
    expect(compileRenderPlan([fitFill({ x: 20, y: 0, w: 300, h: 300 })], SRC).steps).toEqual([
      { kind: "extract", left: 20, top: 0, width: 300, height: 300 },
    ]);
    // fitToSize fit → a solid-white extend step per the pad.
    expect(compileRenderPlan([fitPad({ l: 10, t: 5, r: 10, b: 5 })], SRC).steps).toEqual([
      { kind: "extend", left: 10, top: 5, right: 10, bottom: 5, strategy: "solid", color: "#ffffff" },
    ]);
    // resize → a resize step with the resolved dims.
    expect(compileRenderPlan([resizeOp(120, 90)], SRC).steps).toEqual([
      { kind: "resize", width: 120, height: 90 },
    ]);
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

  it("SKIPS textOverlay/logoOverlay recipe ops (no throw, no step) — pixels ride the sidecar", () => {
    // The overlay ops are the client's history representation; the server never
    // draws from them (fonts live client-side, §3.3), so they compile to nothing.
    const { steps, out } = compileRenderPlan(
      [crop({ x: 0, y: 0, w: 100, h: 100 }), textOverlayOp("t1"), logoOverlayOp("l1")],
      SRC,
    );
    expect(steps.map((s) => s.kind)).toEqual(["extract"]);
    expect(out).toEqual({ w: 100, h: 100 }); // overlay ops never move the frame
  });

  it("appends composite steps AFTER the terminal adjust, in overlay (array) order", () => {
    const overlays = [
      { id: "banner", left: 10, top: 20, width: 30, height: 40 },
      { id: "logo", left: 50, top: 60, width: 12, height: 12 },
    ];
    const { steps } = compileRenderPlan(
      [crop({ x: 0, y: 0, w: 200, h: 150 }), adjust("brightness", 20)],
      SRC,
      overlays,
    );
    // extract → terminal adjust → composites, in order.
    expect(steps.map((s) => s.kind)).toEqual(["extract", "adjust", "composite", "composite"]);
    expect(steps.filter((s) => s.kind === "composite")).toEqual([
      { kind: "composite", file: "overlay-banner.png", left: 10, top: 20, width: 30, height: 40 },
      { kind: "composite", file: "overlay-logo.png", left: 50, top: 60, width: 12, height: 12 },
    ]);
  });

  it("emits composite steps directly after geometry when there is no adjust", () => {
    const { steps, out } = compileRenderPlan([crop({ x: 0, y: 0, w: 120, h: 90 })], SRC, [
      { id: "mark", left: 5, top: 5, width: 20, height: 20 },
    ]);
    expect(steps).toEqual([
      { kind: "extract", left: 0, top: 0, width: 120, height: 90 },
      { kind: "composite", file: "overlay-mark.png", left: 5, top: 5, width: 20, height: 20 },
    ]);
    expect(out).toEqual({ w: 120, h: 90 }); // overlays never change the effective dims
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
/* renderImage — the PE5 print-geometry ops replay live                        */
/* ========================================================================== */

describe("renderImage — print-geometry ops (resize / bleedExpand / fitToSize)", () => {
  it(
    "bleedExpand mirror grows the canvas by 2·px on each axis",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [bleed(20, "mirror")],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const meta = await sharp(out.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([440, 340]);
    },
    30_000,
  );

  it(
    "resize renders the exact target dims (fill)",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [resizeOp(120, 90)],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const meta = await sharp(out.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([120, 90]);
    },
    30_000,
  );

  it(
    "fitToSize fit pads with white to the target dims (the far pad column is white)",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [fitPad({ l: 0, t: 0, r: 100, b: 0 })],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const s = await sample(out.bytes, 495, 150); // deep in the right white pad
      expect([s.width, s.height]).toEqual([500, 300]);
      expect(s.rgba[0]).toBeGreaterThan(240);
      expect(s.rgba[1]).toBeGreaterThan(240);
      expect(s.rgba[2]).toBeGreaterThan(240);
    },
    30_000,
  );

  it(
    "fitToSize fill crops to the anchored rect (dims = rect)",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [fitFill({ x: 100, y: 0, w: 200, h: 300 })],
        format: "png",
        quality: 90,
        intent: "srgb",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const meta = await sharp(out.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([200, 300]);
    },
    30_000,
  );
});

/* ========================================================================== */
/* renderImage — overlay composite (PE6)                                       */
/* ========================================================================== */

/** An opaque magenta overlay raster with an alpha channel (the client's
    pre-rendered PNG art; the worker decodes+resizes+composites it as the
    sanitize/re-encode). Magenta is distinct from every quadrant marker colour. */
function overlayPng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe("renderImage — overlay composite (PE6)", () => {
  it(
    "composites the overlay raster at its placement; off-placement pixels are untouched",
    async () => {
      // Overlay placed inside the BL (blue) quadrant so its magenta is unmistakable.
      const mark = await overlayPng(40, 20);
      const withOv = await renderImage(
        await quadPng(),
        {
          recipe: [],
          format: "png",
          quality: 90,
          intent: "srgb",
          overlays: [{ id: "mark", left: 50, top: 200, width: 40, height: 20 }],
        },
        { "overlay-mark.png": mark },
      );
      const without = await renderImage(await quadPng(), { recipe: [], format: "png", quality: 90, intent: "srgb" });
      expect(withOv.ok && without.ok).toBe(true);
      if (!withOv.ok || !without.ok) return;

      // ON the overlay (70,210): magenta over what was blue — the pixel changed.
      const on = await sample(withOv.bytes, 70, 210);
      const onBase = await sample(without.bytes, 70, 210);
      expect(on.rgba).not.toEqual(onBase.rgba);
      expect(on.rgba[0]).toBeGreaterThan(200); // magenta R
      expect(on.rgba[2]).toBeGreaterThan(200); // magenta B
      expect(on.rgba[1]).toBeLessThan(60); // magenta G low

      // OFF the overlay (300,50), the TR green quadrant: byte-for-byte unchanged.
      const off = await sample(withOv.bytes, 300, 50);
      const offBase = await sample(without.bytes, 300, 50);
      expect(off.rgba).toEqual(offBase.rgba);
    },
    30_000,
  );

  it(
    "composites AFTER the terminal adjust — the tone pass never touches overlay pixels",
    async () => {
      // A heavy tone pass would shift a photo pixel; the overlay is placed on top
      // afterward, so its magenta arrives intact regardless of the adjust.
      const mark = await overlayPng(40, 20);
      const out = await renderImage(
        await quadPng(),
        {
          recipe: [adjust("brightness", -80), adjust("saturation", -100)],
          format: "png",
          quality: 90,
          intent: "srgb",
          overlays: [{ id: "mark", left: 50, top: 200, width: 40, height: 20 }],
        },
        { "overlay-mark.png": mark },
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const on = await sample(out.bytes, 70, 210);
      // Desaturate+darken would grey/black a photo pixel; the overlay stays magenta.
      expect(on.rgba[0]).toBeGreaterThan(200);
      expect(on.rgba[2]).toBeGreaterThan(200);
      expect(on.rgba[1]).toBeLessThan(60);
    },
    30_000,
  );

  it(
    "is deterministic with attachments (byte-identical JPEG across two renders)",
    async () => {
      const master = await quadPng();
      const mark = await overlayPng(40, 20);
      const payload = {
        recipe: [crop({ x: 20, y: 15, w: 300, h: 240 })],
        format: "jpeg" as const,
        quality: 88,
        intent: "srgb" as const,
        overlays: [{ id: "mark", left: 10, top: 10, width: 40, height: 20 }],
      };
      const a = await renderImage(master, payload, { "overlay-mark.png": mark });
      const b = await renderImage(master, payload, { "overlay-mark.png": mark });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.bytes.equals(b.bytes)).toBe(true);
    },
    45_000,
  );

  it(
    "flattens overlay alpha into JPEG (3 channels, no transparency)",
    async () => {
      // A semi-transparent overlay over the photo: JPEG can't carry alpha, so the
      // final encode flattens it — the overlay blends into the image naturally.
      const semi = await sharp({
        create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 0.5 } },
      })
        .png()
        .toBuffer();
      const out = await renderImage(
        await quadPng(),
        {
          recipe: [],
          format: "jpeg",
          quality: 90,
          intent: "srgb",
          overlays: [{ id: "mark", left: 50, top: 200, width: 40, height: 20 }],
        },
        { "overlay-mark.png": semi },
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const meta = await sharp(out.bytes).metadata();
      expect(meta.channels).toBe(3);
      expect(Boolean(meta.hasAlpha)).toBe(false);
    },
    30_000,
  );
});

/* ========================================================================== */
/* renderImage — the stored-explicit erase patch composites (PE9)              */
/* ========================================================================== */

describe("renderImage — erase patch composite (PE9)", () => {
  it(
    "composites the stored patch at the op's rect; off-rect pixels are untouched",
    async () => {
      // A solid magenta patch stands in for the classical fill's output; render
      // composites it at the op's rect as photo content, leaving the rest intact.
      const rect = { x: 50, y: 200, w: 40, h: 20 }; // inside the BL (blue) quadrant
      const patch = await overlayPng(rect.w, rect.h); // magenta w×h
      const withErase = await renderImage(
        await quadPng(),
        { recipe: [eraseOp("e1", rect)], format: "png", quality: 90, intent: "srgb" },
        { "erase-e1.png": patch },
      );
      const without = await renderImage(await quadPng(), { recipe: [], format: "png", quality: 90, intent: "srgb" });
      expect(withErase.ok && without.ok).toBe(true);
      if (!withErase.ok || !without.ok) return;

      // INSIDE the patch (70,210): magenta over what was blue — the pixel changed.
      const on = await sample(withErase.bytes, 70, 210);
      expect(on.rgba[0]).toBeGreaterThan(200); // magenta R
      expect(on.rgba[2]).toBeGreaterThan(200); // magenta B
      expect(on.rgba[1]).toBeLessThan(60); // magenta G low

      // OFF the patch (300,50), the TR green quadrant: byte-for-byte unchanged.
      const off = await sample(withErase.bytes, 300, 50);
      const offBase = await sample(without.bytes, 300, 50);
      expect(off.rgba).toEqual(offBase.rgba);
    },
    30_000,
  );

  it(
    "composites the erase patch BEFORE the terminal adjust — tone applies OVER the patch (unlike an overlay)",
    async () => {
      // The erase patch folds in before the terminal tone pass, so a darken shifts
      // its pixels too (photo content). An overlay would arrive intact after tone.
      const rect = { x: 50, y: 200, w: 40, h: 20 };
      const patch = await overlayPng(rect.w, rect.h); // bright magenta (R,B = 255)
      const darkened = await renderImage(
        await quadPng(),
        { recipe: [eraseOp("e1", rect), adjust("brightness", -80)], format: "png", quality: 90, intent: "srgb" },
        { "erase-e1.png": patch },
      );
      const plain = await renderImage(
        await quadPng(),
        { recipe: [eraseOp("e1", rect)], format: "png", quality: 90, intent: "srgb" },
        { "erase-e1.png": patch },
      );
      expect(darkened.ok && plain.ok).toBe(true);
      if (!darkened.ok || !plain.ok) return;
      const dim = await sample(darkened.bytes, 70, 210);
      const full = await sample(plain.bytes, 70, 210);
      // brightness −80 darkens the patch's red channel — the tone pass reached it.
      expect(dim.rgba[0]).toBeLessThan(full.rgba[0]);
    },
    30_000,
  );

  it(
    "is deterministic for an erase render (byte-identical PNG across two runs)",
    async () => {
      const rect = { x: 30, y: 40, w: 50, h: 30 };
      const master = await quadPng();
      const patch = await overlayPng(rect.w, rect.h);
      const payload = {
        recipe: [eraseOp("e1", rect)],
        format: "png" as const,
        quality: 90,
        intent: "srgb" as const,
      };
      const a = await renderImage(master, payload, { "erase-e1.png": patch });
      const b = await renderImage(master, payload, { "erase-e1.png": patch });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.bytes.equals(b.bytes)).toBe(true);
    },
    45_000,
  );
});

/* ========================================================================== */
/* renderImage — the terminal CMYK colour pass (PE5)                           */
/* ========================================================================== */

describe("renderImage — CMYK separates through the GRACoL profile", () => {
  const GRACOL = join(process.cwd(), "src", "lib", "photo", "profiles", "GRACoL2013_CRPC6.icc");

  it(
    "intent cmyk + tiff → a 4-channel CMYK TIFF with the committed GRACoL profile embedded byte-identical",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [crop({ x: 0, y: 0, w: 200, h: 150 })],
        format: "tiff",
        quality: 90,
        intent: "cmyk",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.mime).toBe("image/tiff");
      const meta = await sharp(out.bytes).metadata();
      expect(meta.space).toBe("cmyk");
      expect(meta.channels).toBe(4);
      expect(meta.icc).toBeDefined();
      expect(meta.icc!.equals(readFileSync(GRACOL))).toBe(true);
    },
    30_000,
  );

  it(
    "intent cmyk + png → downgraded to sRGB (PNG has no CMYK), never 4-channel",
    async () => {
      const out = await renderImage(await quadPng(), {
        recipe: [],
        format: "png",
        quality: 90,
        intent: "cmyk",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.mime).toBe("image/png");
      const meta = await sharp(out.bytes).metadata();
      expect(meta.space).not.toBe("cmyk");
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
