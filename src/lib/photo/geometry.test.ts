import { describe, it, expect } from "vitest";
import {
  isGeometryOp,
  effectiveDims,
  straightenScale,
  effectiveDpi,
  dpiVerdict,
  dpiChipCopy,
  printSizeLabel,
  aspectRectFor,
  clampRectToImage,
  resizeCropRect,
  moveCropRect,
  straightenLabel,
  type Dims,
  type CropHandle,
} from "./geometry";
import { CROP_PRESETS, PRINT_SIZES, cropLabel } from "./sizes";
import type { PhotoOp, PixelRect } from "@/lib/schema/photo";

/* ------------------------------------------------------------------ */
/* Op builders — schema-shaped so the fixtures stay contract-true     */
/* ------------------------------------------------------------------ */

function crop(w: number, h: number, x = 0, y = 0): PhotoOp {
  return {
    op: "crop",
    label: "Crop",
    rect: { x, y, w, h },
    ratio: null,
    shape: "rect",
  };
}
function rotate(quarterTurns: number): PhotoOp {
  return { op: "rotate", label: "Rotate", quarterTurns };
}
function flip(axis: "horizontal" | "vertical"): PhotoOp {
  return { op: "flip", label: "Flip", axis };
}
function straighten(degrees: number): PhotoOp {
  return { op: "straighten", label: straightenLabel(degrees), degrees };
}
function adjust(): PhotoOp {
  return { op: "adjust", label: "Brightness +1", param: "brightness", value: 1 };
}
// The three stored-explicit print-geometry ops (PE5) — schema-shaped so the
// fixtures stay contract-true (px on bleedExpand, rect|pad on fitToSize, targetPx
// on resize are all required/mode-matched now).
function bleedExpand(px: number): PhotoOp {
  return { op: "bleedExpand", label: "Expand bleed 0.125 in", strategy: "mirror", amount: 0.125, px };
}
function fitFill(rect: PixelRect): PhotoOp {
  return { op: "fitToSize", label: "Fit to size", mode: "fill", anchor: "center", rect };
}
function fitPad(pad: { l: number; t: number; r: number; b: number }): PhotoOp {
  return { op: "fitToSize", label: "Fit to size", mode: "fit", anchor: "center", pad };
}
function resize(w: number, h: number): PhotoOp {
  return { op: "resize", label: "Resize", mode: "px", px: { width: w, height: h }, targetPx: { width: w, height: h } };
}

const area = (r: PixelRect) => r.w * r.h;

/* ================================================================== */
/* isGeometryOp                                                        */
/* ================================================================== */

describe("isGeometryOp", () => {
  it("is true for the four interactive geometry ops", () => {
    expect(isGeometryOp(crop(10, 10))).toBe(true);
    expect(isGeometryOp(rotate(1))).toBe(true);
    expect(isGeometryOp(flip("horizontal"))).toBe(true);
    expect(isGeometryOp(straighten(2))).toBe(true);
  });
  it("is true for the three print-geometry ops (PE5): bleedExpand / fitToSize / resize", () => {
    expect(isGeometryOp(bleedExpand(84))).toBe(true);
    expect(isGeometryOp(fitFill({ x: 0, y: 0, w: 100, h: 100 }))).toBe(true);
    expect(isGeometryOp(fitPad({ l: 0, t: 0, r: 10, b: 0 }))).toBe(true);
    expect(isGeometryOp(resize(800, 600))).toBe(true);
  });
  it("is false for pixel/composite ops that don't change the raster's dims", () => {
    expect(isGeometryOp(adjust())).toBe(false);
    expect(
      isGeometryOp({ op: "autoEnhance", label: "Auto-enhance", params: {} }),
    ).toBe(false);
    expect(
      isGeometryOp({
        op: "erase",
        label: "Remove object",
        maskAssetId: "photo:mask-1",
        patch: { id: "p1", assetId: "photo:patch-1", rect: { x: 0, y: 0, w: 10, h: 10 } },
      }),
    ).toBe(false);
  });
});

/* ================================================================== */
/* effectiveDims                                                       */
/* ================================================================== */

describe("effectiveDims", () => {
  const src: Dims = { w: 4000, h: 3000 };

  it("no ops → the source dims (rounded, ≥ 1)", () => {
    expect(effectiveDims(src, [])).toEqual({ w: 4000, h: 3000 });
    expect(effectiveDims({ w: 10.4, h: 0 }, [])).toEqual({ w: 10, h: 1 });
  });

  it("crop → the rect's dimensions", () => {
    expect(effectiveDims(src, [crop(1200, 800)])).toEqual({ w: 1200, h: 800 });
  });

  it("odd quarter turns swap dims; even leave them", () => {
    expect(effectiveDims(src, [rotate(1)])).toEqual({ w: 3000, h: 4000 });
    expect(effectiveDims(src, [rotate(-1)])).toEqual({ w: 3000, h: 4000 });
    expect(effectiveDims(src, [rotate(3)])).toEqual({ w: 3000, h: 4000 });
    expect(effectiveDims(src, [rotate(2)])).toEqual({ w: 4000, h: 3000 });
    expect(effectiveDims(src, [rotate(-2)])).toEqual({ w: 4000, h: 3000 });
  });

  it("flip and straighten never change dims", () => {
    expect(effectiveDims(src, [flip("horizontal")])).toEqual({ w: 4000, h: 3000 });
    expect(effectiveDims(src, [flip("vertical")])).toEqual({ w: 4000, h: 3000 });
    expect(effectiveDims(src, [straighten(12.5)])).toEqual({ w: 4000, h: 3000 });
    expect(effectiveDims(src, [straighten(-3)])).toEqual({ w: 4000, h: 3000 });
  });

  it("ignores non-geometry ops interleaved in the recipe", () => {
    const ops = [adjust(), crop(1000, 500), adjust(), straighten(2)];
    expect(effectiveDims(src, ops)).toEqual({ w: 1000, h: 500 });
  });

  it("folds a crop → rotate → crop chain against the CURRENT effective image", () => {
    // 4000×3000 → crop 2000×1000 → rotate 1 (swap → 1000×2000) → crop 400×600
    const ops = [crop(2000, 1000), rotate(1), crop(400, 600)];
    expect(effectiveDims(src, ops)).toEqual({ w: 400, h: 600 });
  });

  it("rotate then crop: the crop rect is read in the ROTATED frame", () => {
    // 4000×3000 → rotate 1 → 3000×4000 → crop 3000×4000 stays 3000×4000
    expect(effectiveDims(src, [rotate(1), crop(3000, 4000)])).toEqual({
      w: 3000,
      h: 4000,
    });
  });

  it("clamps crop dims to integers ≥ 1", () => {
    expect(effectiveDims(src, [crop(0.2, 0.2)])).toEqual({ w: 1, h: 1 });
    expect(effectiveDims(src, [crop(99.6, 100.4)])).toEqual({ w: 100, h: 100 });
  });

  it("bleedExpand grows both axes by 2·px (stored-explicit)", () => {
    // 4000×3000 + 84px per edge → 4000+168 × 3000+168.
    expect(effectiveDims(src, [bleedExpand(84)])).toEqual({ w: 4168, h: 3168 });
  });

  it("fitToSize fill folds to the stored rect's dims", () => {
    expect(effectiveDims(src, [fitFill({ x: 100, y: 50, w: 2000, h: 1333 })])).toEqual({
      w: 2000,
      h: 1333,
    });
  });

  it("fitToSize fit folds to source + the stored pad (both axes)", () => {
    // 4000×3000 + pad {l:250,r:250,t:0,b:0} → 4500 × 3000.
    expect(effectiveDims(src, [fitPad({ l: 250, t: 0, r: 250, b: 0 })])).toEqual({
      w: 4500,
      h: 3000,
    });
    expect(effectiveDims(src, [fitPad({ l: 0, t: 100, r: 0, b: 300 })])).toEqual({
      w: 4000,
      h: 3400,
    });
  });

  it("resize folds to the stored targetPx (never re-derived)", () => {
    expect(effectiveDims(src, [resize(1200, 900)])).toEqual({ w: 1200, h: 900 });
  });

  it("folds a chained crop → bleedExpand → resize against the current effective image", () => {
    // 4000×3000 → crop 2000×1500 → bleedExpand 10px (2020×1520) → resize 800×600.
    const ops = [crop(2000, 1500), bleedExpand(10), resize(800, 600)];
    expect(effectiveDims(src, ops)).toEqual({ w: 800, h: 600 });
  });

  it("folds crop → fill → bleedExpand (fill reads the cropped frame, bleed grows it)", () => {
    // 4000×3000 → crop 3000×2000 → fill rect 1500×1000 → bleedExpand 25px → 1550×1050.
    const ops = [crop(3000, 2000), fitFill({ x: 0, y: 0, w: 1500, h: 1000 }), bleedExpand(25)];
    expect(effectiveDims(src, ops)).toEqual({ w: 1550, h: 1050 });
  });
});

/* ================================================================== */
/* straightenScale — the derived cover formula                        */
/* ================================================================== */

describe("straightenScale", () => {
  const rad = (d: number) => (d * Math.PI) / 180;

  it("s(0) = 1 for any aspect", () => {
    expect(straightenScale({ w: 3, h: 2 }, 0)).toBe(1);
    expect(straightenScale({ w: 1, h: 1 }, 0)).toBe(1);
    expect(straightenScale({ w: 4000, h: 3000 }, 0)).toBe(1);
  });

  it("is even in θ: s(θ) = s(−θ)", () => {
    for (const d of [1.2, 5, 15, 30, 44]) {
      expect(straightenScale({ w: 3, h: 2 }, d)).toBeCloseTo(
        straightenScale({ w: 3, h: 2 }, -d),
        12,
      );
    }
  });

  it("increases strictly monotonically on (0°, 45°] for a 3:2 frame", () => {
    let prev = straightenScale({ w: 3, h: 2 }, 0);
    for (let d = 0.25; d <= 45 + 1e-9; d += 0.25) {
      const s = straightenScale({ w: 3, h: 2 }, d);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it("matches the closed form |cos| + (max/min)·|sin| for |θ| ≤ 90°", () => {
    const w = 3;
    const h = 2;
    const k = Math.max(w, h) / Math.min(w, h);
    for (const d of [1.2, 5, 15, 30, 45, 60, 90]) {
      const closed = Math.abs(Math.cos(rad(d))) + k * Math.abs(Math.sin(rad(d)));
      expect(straightenScale({ w, h }, d)).toBeCloseTo(closed, 12);
    }
  });

  it("numeric cover proof: the scaled+rotated image contains the original frame (3:2 @ 1.2°/5°/15°)", () => {
    // Rotate each corner of the ORIGINAL w×h frame by −θ into the scaled image's
    // local axes; it is covered iff |xLocal| ≤ s·w/2 and |yLocal| ≤ s·h/2.
    const w = 3;
    const h = 2;
    for (const deg of [1.2, 5, 15]) {
      const s = straightenScale({ w, h }, deg);
      const a = (s * w) / 2;
      const b = (s * h) / 2;
      const c = Math.cos(rad(deg));
      const sn = Math.sin(rad(deg));
      const corners: Array<[number, number]> = [
        [w / 2, h / 2],
        [w / 2, -h / 2],
        [-w / 2, h / 2],
        [-w / 2, -h / 2],
      ];
      let maxX = 0;
      let maxY = 0;
      for (const [x, y] of corners) {
        maxX = Math.max(maxX, Math.abs(x * c + y * sn));
        maxY = Math.max(maxY, Math.abs(-x * sn + y * c));
      }
      const eps = 1e-9;
      expect(maxX).toBeLessThanOrEqual(a + eps);
      expect(maxY).toBeLessThanOrEqual(b + eps);
      // ...and the scale is MINIMAL — one axis sits exactly on the boundary.
      const tightX = Math.abs(maxX - a) < 1e-9;
      const tightY = Math.abs(maxY - b) < 1e-9;
      expect(tightX || tightY).toBe(true);
    }
  });

  it("at 90° the cover scale is the aspect ratio max/min", () => {
    expect(straightenScale({ w: 3, h: 2 }, 90)).toBeCloseTo(1.5, 12);
    expect(straightenScale({ w: 1, h: 1 }, 90)).toBeCloseTo(1, 12);
  });

  it("degenerate dims fall back to 1", () => {
    expect(straightenScale({ w: 0, h: 10 }, 5)).toBe(1);
  });
});

/* ================================================================== */
/* effectiveDpi + dpiVerdict — the pinned worked examples             */
/* ================================================================== */

describe("effectiveDpi + dpiVerdict — plan §5 worked examples", () => {
  it("4032×3024 @ 4×6 → exactly 672, green", () => {
    const dpi = effectiveDpi({ w: 4032, h: 3024 }, { w: 4, h: 6 });
    expect(dpi).toBe(672);
    expect(dpiVerdict(dpi)).toBe("green");
  });

  it("1280×960 @ 8×10 → exactly 120, amber", () => {
    const dpi = effectiveDpi({ w: 1280, h: 960 }, { w: 8, h: 10 });
    expect(dpi).toBe(120);
    expect(dpiVerdict(dpi)).toBe("amber");
  });

  it("1200×900 @ 16×20 → exactly 56, red", () => {
    const dpi = effectiveDpi({ w: 1200, h: 900 }, { w: 16, h: 20 });
    expect(dpi).toBe(56);
    expect(dpiVerdict(dpi)).toBe("red");
  });

  it("auto-flips orientation to the better fit (portrait pixels, landscape inches)", () => {
    // Same pixels, inches given either way → same DPI (best orientation wins).
    expect(effectiveDpi({ w: 3024, h: 4032 }, { w: 4, h: 6 })).toBe(672);
    expect(effectiveDpi({ w: 4032, h: 3024 }, { w: 6, h: 4 })).toBe(672);
  });

  it("verdict thresholds: 300 green, 100 amber, 99 red", () => {
    expect(dpiVerdict(300)).toBe("green");
    expect(dpiVerdict(299)).toBe("amber");
    expect(dpiVerdict(100)).toBe("amber");
    expect(dpiVerdict(99)).toBe("red");
    expect(dpiVerdict(0)).toBe("red");
  });

  it("guards zero inches", () => {
    expect(effectiveDpi({ w: 100, h: 100 }, { w: 0, h: 5 })).toBe(0);
  });
});

/* ================================================================== */
/* printSizeLabel                                                      */
/* ================================================================== */

describe("printSizeLabel", () => {
  it("drops trailing .0 on whole numbers", () => {
    expect(printSizeLabel({ w: 4, h: 6 })).toBe("4 × 6");
    expect(printSizeLabel({ w: 16, h: 20 })).toBe("16 × 20");
    expect(printSizeLabel({ w: 4.0, h: 6.0 })).toBe("4 × 6");
  });
  it("keeps real fractions", () => {
    expect(printSizeLabel({ w: 8.5, h: 11 })).toBe("8.5 × 11");
    expect(printSizeLabel({ w: 3.5, h: 2 })).toBe("3.5 × 2");
  });
  it("uses a spaced U+00D7 multiplication sign, not an ASCII x", () => {
    expect(printSizeLabel({ w: 5, h: 7 })).toBe("5 × 7");
  });
});

/* ================================================================== */
/* dpiChipCopy — the wires' size-qualified strip strings                */
/* ================================================================== */

describe("dpiChipCopy — wire-pinned strings", () => {
  it("green names the size", () => {
    expect(dpiChipCopy(672, "green", "4 × 6")).toBe("672 DPI — great at 4 × 6");
  });
  it("amber names the size", () => {
    expect(dpiChipCopy(120, "amber", "8 × 10")).toBe("120 DPI — may look soft at 8 × 10");
  });
  it("red is size-agnostic ('too low at this size')", () => {
    expect(dpiChipCopy(56, "red", "16 × 20")).toBe("56 DPI — too low at this size");
  });

  it("end-to-end: dims + print size → the exact strip string (the §5 fixtures)", () => {
    const chip = (px: Dims, inches: Dims) => {
      const dpi = effectiveDpi(px, inches);
      return dpiChipCopy(dpi, dpiVerdict(dpi), printSizeLabel(inches));
    };
    expect(chip({ w: 4032, h: 3024 }, { w: 4, h: 6 })).toBe("672 DPI — great at 4 × 6");
    expect(chip({ w: 1280, h: 960 }, { w: 8, h: 10 })).toBe("120 DPI — may look soft at 8 × 10");
    expect(chip({ w: 1200, h: 900 }, { w: 16, h: 20 })).toBe("56 DPI — too low at this size");
  });
});

/* ================================================================== */
/* aspectRectFor                                                       */
/* ================================================================== */

describe("aspectRectFor", () => {
  it("null ratio → the full image", () => {
    expect(aspectRectFor({ w: 4000, h: 3000 }, null)).toEqual({
      x: 0,
      y: 0,
      w: 4000,
      h: 3000,
    });
  });

  it("1:1 on a landscape image → a centered square using the full height", () => {
    const r = aspectRectFor({ w: 4000, h: 3000 }, 1);
    expect(r).toEqual({ x: 500, y: 0, w: 3000, h: 3000 });
  });

  it("auto-orients to the larger-area rect (4×6 preset on a landscape image)", () => {
    const image = { w: 4000, h: 3000 };
    const r = aspectRectFor(image, 6 / 4); // 1.5
    // Landscape image → landscape crop wins: full width, height = 4000/1.5.
    expect(r.w).toBeCloseTo(4000, 6);
    expect(r.h).toBeCloseTo(4000 / 1.5, 6);
    // ...strictly larger than the portrait alternative (ratio 1/1.5 on this
    // image would be a 2000×3000 crop, area 6.0M vs the chosen ~10.67M).
    expect(area(r)).toBeGreaterThan(2000 * 3000);
  });

  it("auto-orients the SAME ratio to portrait on a portrait image", () => {
    const r = aspectRectFor({ w: 3000, h: 4000 }, 6 / 4);
    // Now the taller crop fills more: full width, height = 3000/(1/1.5) = 4500 > 4000?
    // → height-limited to 4000, width = 4000*(1/1.5)... auto-orient picks larger.
    expect(r.h).toBeGreaterThan(r.w); // portrait crop
    expect(r.w / r.h).toBeCloseTo(1 / (6 / 4), 6);
  });

  it("centers the crop within the image", () => {
    const image = { w: 1000, h: 1000 };
    const r = aspectRectFor(image, 2); // 2:1 or 1:2 — equal area on a square, ratio wins tie
    expect(r.x + r.w / 2).toBeCloseTo(image.w / 2, 6);
    expect(r.y + r.h / 2).toBeCloseTo(image.h / 2, 6);
  });

  it("the produced rect fits inside the image", () => {
    const image = { w: 4000, h: 3000 };
    for (const ratio of [1, 1.5, 1.4, 1.25, 8.5 / 11, 3.5 / 2]) {
      const r = aspectRectFor(image, ratio);
      expect(r.x).toBeGreaterThanOrEqual(-1e-6);
      expect(r.y).toBeGreaterThanOrEqual(-1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(image.w + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(image.h + 1e-6);
    }
  });
});

/* ================================================================== */
/* clampRectToImage                                                    */
/* ================================================================== */

describe("clampRectToImage", () => {
  const image = { w: 1000, h: 800 };

  it("leaves an in-bounds rect untouched", () => {
    const r = { x: 100, y: 100, w: 200, h: 200 };
    expect(clampRectToImage(r, image)).toEqual(r);
  });

  it("pulls an overhanging rect back inside", () => {
    expect(clampRectToImage({ x: 900, y: 700, w: 200, h: 200 }, image)).toEqual({
      x: 800,
      y: 600,
      w: 200,
      h: 200,
    });
  });

  it("shrinks an oversize rect to the image and origins it at 0", () => {
    expect(clampRectToImage({ x: -50, y: -50, w: 5000, h: 5000 }, image)).toEqual({
      x: 0,
      y: 0,
      w: 1000,
      h: 800,
    });
  });
});

/* ================================================================== */
/* resizeCropRect                                                      */
/* ================================================================== */

describe("resizeCropRect (free)", () => {
  const image = { w: 1000, h: 1000 };
  const base: PixelRect = { x: 200, y: 200, w: 400, h: 400 };

  it("e handle: right edge grows by dx, left fixed", () => {
    const r = resizeCropRect(base, "e", 100, 0, null, image);
    expect(r).toEqual({ x: 200, y: 200, w: 500, h: 400 });
  });

  it("w handle: left edge moves, right fixed", () => {
    const r = resizeCropRect(base, "w", -50, 0, null, image);
    expect(r).toEqual({ x: 150, y: 200, w: 450, h: 400 });
  });

  it("n handle: top edge moves, bottom fixed", () => {
    const r = resizeCropRect(base, "n", 0, -60, null, image);
    expect(r).toEqual({ x: 200, y: 140, w: 400, h: 460 });
  });

  it("s handle: bottom edge grows by dy, top fixed", () => {
    const r = resizeCropRect(base, "s", 0, 80, null, image);
    expect(r).toEqual({ x: 200, y: 200, w: 400, h: 480 });
  });

  it("se corner: both right and bottom move", () => {
    const r = resizeCropRect(base, "se", 100, 50, null, image);
    expect(r).toEqual({ x: 200, y: 200, w: 500, h: 450 });
  });

  it("nw corner: both left and top move", () => {
    const r = resizeCropRect(base, "nw", -100, -100, null, image);
    expect(r).toEqual({ x: 100, y: 100, w: 500, h: 500 });
  });

  it("clamps the moving edge to the image bound", () => {
    // drag the right edge far past the image width → clamps at 1000
    const r = resizeCropRect(base, "e", 10_000, 0, null, image);
    expect(r.x + r.w).toBe(1000);
    expect(r.w).toBe(800); // 1000 − 200
  });

  it("honors the minSize floor against the fixed opposite edge", () => {
    // collapse the width via the left edge; floor at default 16
    const r = resizeCropRect(base, "w", 10_000, 0, null, image);
    expect(r.w).toBe(16);
    expect(r.x + r.w).toBe(600); // right edge stayed at 200+400
  });

  it("respects a custom minSize", () => {
    const r = resizeCropRect(base, "e", -10_000, 0, null, image, 50);
    expect(r.w).toBe(50);
    expect(r.x).toBe(200); // left fixed
  });
});

describe("resizeCropRect (ratio-locked)", () => {
  const image = { w: 2000, h: 2000 };
  const base: PixelRect = { x: 500, y: 500, w: 600, h: 400 }; // aspect 1.5

  it("a corner drag keeps the locked aspect within rounding", () => {
    const r = resizeCropRect(base, "se", 200, 0, 1.5, image);
    expect(r.w / r.h).toBeCloseTo(1.5, 6);
    // opposite corner (nw) stays pinned
    expect(r.x).toBeCloseTo(500, 6);
    expect(r.y).toBeCloseTo(500, 6);
  });

  it("a corner drag on the perpendicular axis still holds aspect", () => {
    const r = resizeCropRect(base, "se", 0, 200, 1.5, image);
    expect(r.w / r.h).toBeCloseTo(1.5, 6);
  });

  it("an edge drag derives the perpendicular axis and keeps the aspect + centre", () => {
    const r = resizeCropRect(base, "e", 300, 0, 1.5, image);
    expect(r.w / r.h).toBeCloseTo(1.5, 6);
    // vertical centre is pinned for a horizontal-edge locked drag
    expect(r.y + r.h / 2).toBeCloseTo(base.y + base.h / 2, 6);
  });

  it("holds aspect while min-clamping a collapse", () => {
    const r = resizeCropRect(base, "se", -10_000, -10_000, 1.5, image, 20);
    expect(r.w / r.h).toBeCloseTo(1.5, 6);
    expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(20 - 1e-6);
  });

  it("holds aspect while fitting to the image bound", () => {
    const r = resizeCropRect(base, "se", 100_000, 100_000, 1.5, image);
    expect(r.w / r.h).toBeCloseTo(1.5, 6);
    expect(r.x + r.w).toBeLessThanOrEqual(image.w + 1e-6);
    expect(r.y + r.h).toBeLessThanOrEqual(image.h + 1e-6);
  });
});

/* ================================================================== */
/* moveCropRect                                                        */
/* ================================================================== */

describe("moveCropRect", () => {
  const image = { w: 1000, h: 1000 };
  const base: PixelRect = { x: 100, y: 100, w: 200, h: 200 };

  it("translates by (dx, dy) when in bounds", () => {
    expect(moveCropRect(base, 50, -30, image)).toEqual({
      x: 150,
      y: 70,
      w: 200,
      h: 200,
    });
  });

  it("clamps against the far edge without resizing", () => {
    const r = moveCropRect(base, 10_000, 10_000, image);
    expect(r).toEqual({ x: 800, y: 800, w: 200, h: 200 });
  });

  it("clamps against the near edge (never negative origin)", () => {
    const r = moveCropRect(base, -10_000, -10_000, image);
    expect(r).toEqual({ x: 0, y: 0, w: 200, h: 200 });
  });
});

/* ================================================================== */
/* straightenLabel                                                     */
/* ================================================================== */

describe("straightenLabel", () => {
  it("uses a U+2212 minus for negatives, 1 decimal", () => {
    expect(straightenLabel(-1.2)).toBe("Straighten −1.2°");
    // the literal in the source must be the real Unicode minus, not ASCII '-'
    expect(straightenLabel(-1.2)).toBe("Straighten −1.2°");
    expect(straightenLabel(-1.2).includes("-")).toBe(false);
  });

  it("uses a plus prefix for positives and zero, always 1 decimal", () => {
    expect(straightenLabel(3)).toBe("Straighten +3.0°");
    expect(straightenLabel(0)).toBe("Straighten +0.0°");
    expect(straightenLabel(12.34)).toBe("Straighten +12.3°");
  });
});

/* ================================================================== */
/* sizes.ts — CROP_PRESETS / PRINT_SIZES / cropLabel                  */
/* ================================================================== */

describe("CROP_PRESETS", () => {
  it("has the exact ids and labels in Section-B order", () => {
    expect(CROP_PRESETS.map((p) => p.id)).toEqual([
      "free",
      "original",
      "1-1",
      "4x6",
      "5x7",
      "8x10",
      "letter",
      "business-card",
    ]);
    expect(CROP_PRESETS.map((p) => p.label)).toEqual([
      "Free",
      "Original",
      "1:1",
      "4 × 6",
      "5 × 7",
      "8 × 10",
      "Letter",
      "Business card",
    ]);
  });

  it("Free and Original carry a null ratio; the rest carry a positive ratio", () => {
    const byId = (id: string) => CROP_PRESETS.find((p) => p.id === id)!;
    expect(byId("free").ratio).toBeNull();
    expect(byId("original").ratio).toBeNull();
    expect(byId("1-1").ratio).toBe(1);
    expect(byId("4x6").ratio).toBeCloseTo(1.5, 12); // 6/4
    expect(byId("5x7").ratio).toBeCloseTo(7 / 5, 12);
    expect(byId("8x10").ratio).toBeCloseTo(10 / 8, 12);
    expect(byId("letter").ratio).toBeCloseTo(8.5 / 11, 12);
    expect(byId("business-card").ratio).toBeCloseTo(3.5 / 2, 12);
  });

  it("labels use the spaced multiplication sign U+00D7, not ASCII x", () => {
    expect(CROP_PRESETS.find((p) => p.id === "4x6")!.label).toBe("4 × 6");
    expect(CROP_PRESETS.find((p) => p.id === "4x6")!.label.includes("x")).toBe(false);
  });
});

describe("PRINT_SIZES", () => {
  it("covers the five print products with a 0.125 in bleed", () => {
    expect(PRINT_SIZES.map((p) => p.sku)).toEqual([
      "4x6",
      "5x7",
      "8x10",
      "letter",
      "business-card",
    ]);
    for (const p of PRINT_SIZES) {
      expect(p.bleed).toBe(0.125);
      expect(p.inches.w).toBeGreaterThan(0);
      expect(p.inches.h).toBeGreaterThan(0);
    }
  });

  it("the DPI worked examples resolve against a print preset's inches", () => {
    const fourBySix = PRINT_SIZES.find((p) => p.sku === "4x6")!;
    expect(effectiveDpi({ w: 4032, h: 3024 }, fourBySix.inches)).toBe(672);
  });
});

describe("cropLabel", () => {
  it("is the wire-pinned 'Crop to 4 × 6' for a sized preset", () => {
    const preset = CROP_PRESETS.find((p) => p.id === "4x6")!;
    expect(cropLabel(preset)).toBe("Crop to 4 × 6");
  });

  it("is plain 'Crop' for Free", () => {
    const preset = CROP_PRESETS.find((p) => p.id === "free")!;
    expect(cropLabel(preset)).toBe("Crop");
  });

  it("prefixes every non-free preset with 'Crop to '", () => {
    for (const p of CROP_PRESETS.filter((x) => x.kind !== "free")) {
      expect(cropLabel(p)).toBe(`Crop to ${p.label}`);
    }
  });
});

/* Keep the CropHandle type exercised so a rename would surface here. */
const ALL_HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
describe("resizeCropRect covers every handle", () => {
  it("returns a valid rect for each of the eight handles", () => {
    const image = { w: 1000, h: 1000 };
    const base: PixelRect = { x: 300, y: 300, w: 300, h: 300 };
    for (const h of ALL_HANDLES) {
      const r = resizeCropRect(base, h, 40, 40, null, image);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });
});
