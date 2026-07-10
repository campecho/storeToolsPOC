import { describe, it, expect } from "vitest";
import { solveFit, type FitPad } from "./fit";
import type { Dims } from "./geometry";
import type { FitAnchor, PixelRect } from "@/lib/schema/photo";

const ANCHORS: FitAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

function fillRect(image: Dims, aspect: number, anchor: FitAnchor): PixelRect {
  const r = solveFit(image, aspect, "fill", anchor);
  if (r.kind !== "crop") throw new Error("fill must return a crop");
  return r.rect;
}
function fitPad(image: Dims, aspect: number, anchor: FitAnchor): FitPad {
  const r = solveFit(image, aspect, "fit", anchor);
  if (r.kind !== "pad") throw new Error("fit must return pad");
  return r.pad;
}

/* ================================================================== */
/* fill — the anchored crop of the largest target-aspect rect          */
/* ================================================================== */

describe("solveFit · fill — anchor matrix", () => {
  // 1000×1000 with a 2:1 target → a 1000×500 rect: x is pinned (no h-slack),
  // y moves through top / middle / bottom per the anchor's vertical band.
  const square: Dims = { w: 1000, h: 1000 };

  it("every fill rect has the exact target aspect and full width here", () => {
    for (const a of ANCHORS) {
      const r = fillRect(square, 2, a);
      expect(r.w).toBe(1000);
      expect(r.h).toBe(500);
    }
  });

  it("vertical anchor picks which horizontal band survives (wide target)", () => {
    const yOf = (a: FitAnchor) => fillRect(square, 2, a).y;
    // top row keeps the TOP band → y = 0
    expect(yOf("top-left")).toBe(0);
    expect(yOf("top")).toBe(0);
    expect(yOf("top-right")).toBe(0);
    // middle row → centred, y = (1000-500)/2
    expect(yOf("left")).toBe(250);
    expect(yOf("center")).toBe(250);
    expect(yOf("right")).toBe(250);
    // bottom row keeps the BOTTOM band → y = 500
    expect(yOf("bottom-left")).toBe(500);
    expect(yOf("bottom")).toBe(500);
    expect(yOf("bottom-right")).toBe(500);
    // x is pinned at 0 for all (rect spans the full width)
    for (const a of ANCHORS) expect(fillRect(square, 2, a).x).toBe(0);
  });

  it("horizontal anchor picks which vertical band survives (tall target)", () => {
    // 1:2 target on the square → 500×1000 rect; x moves, y pinned at 0.
    const xOf = (a: FitAnchor) => fillRect(square, 0.5, a).x;
    expect(xOf("top-left")).toBe(0);
    expect(xOf("left")).toBe(0);
    expect(xOf("bottom-left")).toBe(0);
    expect(xOf("top")).toBe(250);
    expect(xOf("center")).toBe(250);
    expect(xOf("bottom")).toBe(250);
    expect(xOf("top-right")).toBe(500);
    expect(xOf("right")).toBe(500);
    expect(xOf("bottom-right")).toBe(500);
    for (const a of ANCHORS) {
      const r = fillRect(square, 0.5, a);
      expect(r.w).toBe(500);
      expect(r.h).toBe(1000);
      expect(r.y).toBe(0);
    }
  });

  it("does NOT auto-orient — targetAspect is used as-is (caller orients)", () => {
    // 1.5 on a PORTRAIT image stays 1.5 (landscape-ish crop), never flips to 1/1.5.
    const r = fillRect({ w: 600, h: 800 }, 1.5, "center");
    expect(r.w).toBe(600); // width-limited by 800*1.5 > 600
    expect(r.h).toBe(400); // 600 / 1.5
    // an auto-orienting solver would have produced 533×800 instead
    expect(r.h).not.toBe(800);
  });

  it("degenerate same-aspect → the full-image rect", () => {
    const r = fillRect({ w: 1000, h: 500 }, 2, "center");
    expect(r).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });

  it("rounding never pushes the rect outside the image (matrix over aspects × anchors)", () => {
    const img: Dims = { w: 1333, h: 887 }; // deliberately awkward, forces rounding
    for (const aspect of [0.3, 0.5, 0.75, 1, 1.3333, 1.5, 1.9, 3]) {
      for (const a of ANCHORS) {
        const r = fillRect(img, aspect, a);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.w).toBeGreaterThanOrEqual(1);
        expect(r.h).toBeGreaterThanOrEqual(1);
        expect(r.x + r.w).toBeLessThanOrEqual(img.w);
        expect(r.y + r.h).toBeLessThanOrEqual(img.h);
        expect(Number.isInteger(r.x)).toBe(true);
        expect(Number.isInteger(r.y)).toBe(true);
        expect(Number.isInteger(r.w)).toBe(true);
        expect(Number.isInteger(r.h)).toBe(true);
      }
    }
  });
});

/* ================================================================== */
/* fit — anchored white padding to reach the target aspect             */
/* ================================================================== */

describe("solveFit · fit — anchor matrix", () => {
  const square: Dims = { w: 1000, h: 1000 };

  it("pads the SHORT axis only — width when the image is too narrow", () => {
    // 2:1 target on a square → pad width to 2000; height untouched.
    for (const a of ANCHORS) {
      const p = fitPad(square, 2, a);
      expect(p.t).toBe(0);
      expect(p.b).toBe(0);
      expect(p.l + p.r).toBe(1000); // 2000 - 1000
    }
  });

  it("horizontal anchor distributes the width pad (content pushed to its edge)", () => {
    const p = (a: FitAnchor) => fitPad(square, 2, a);
    // left-anchored content → all pad on the RIGHT
    expect(p("left")).toEqual({ l: 0, t: 0, r: 1000, b: 0 });
    // right-anchored content → all pad on the LEFT
    expect(p("right")).toEqual({ l: 1000, t: 0, r: 0, b: 0 });
    // centred → even split
    expect(p("center")).toEqual({ l: 500, t: 0, r: 500, b: 0 });
    // corners follow their horizontal projection
    expect(p("top-left")).toEqual({ l: 0, t: 0, r: 1000, b: 0 });
    expect(p("bottom-right")).toEqual({ l: 1000, t: 0, r: 0, b: 0 });
    // pure-vertical anchors (top/bottom) are horizontally centred → even split
    expect(p("top")).toEqual({ l: 500, t: 0, r: 500, b: 0 });
    expect(p("bottom")).toEqual({ l: 500, t: 0, r: 500, b: 0 });
  });

  it("pads HEIGHT when the image is too wide, distributed by the vertical anchor", () => {
    // 1:2 target on the square → pad height to 2000.
    const p = (a: FitAnchor) => fitPad(square, 0.5, a);
    expect(p("top")).toEqual({ l: 0, t: 0, r: 0, b: 1000 }); // "top → all pad at bottom"
    expect(p("bottom")).toEqual({ l: 0, t: 1000, r: 0, b: 0 });
    expect(p("center")).toEqual({ l: 0, t: 500, r: 0, b: 500 });
    for (const a of ANCHORS) {
      const pad = fitPad(square, 0.5, a);
      expect(pad.l).toBe(0);
      expect(pad.r).toBe(0);
      expect(pad.t + pad.b).toBe(1000);
    }
  });

  it("odd padding splits with the remainder going after (centred)", () => {
    // aspect 1.999 → targetW round(1999) = 1999, extra = 999 (odd).
    const p = fitPad(square, 1.999, "center");
    expect(p.l).toBe(499);
    expect(p.r).toBe(500);
    expect(p.l + p.r).toBe(999);
  });

  it("degenerate same-aspect → zero pad", () => {
    expect(fitPad({ w: 1000, h: 500 }, 2, "center")).toEqual({ l: 0, t: 0, r: 0, b: 0 });
  });

  it("all pad values are integers ≥ 0 across the matrix", () => {
    const img: Dims = { w: 1333, h: 887 };
    for (const aspect of [0.3, 0.5, 1, 1.3333, 1.5, 3]) {
      for (const a of ANCHORS) {
        const p = fitPad(img, aspect, a);
        for (const v of [p.l, p.t, p.r, p.b]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

/* ================================================================== */
/* degenerate inputs                                                   */
/* ================================================================== */

describe("solveFit · guards", () => {
  it("zero/negative image or aspect → safe empties", () => {
    expect(solveFit({ w: 0, h: 100 }, 1.5, "fill", "center")).toEqual({
      kind: "crop",
      rect: { x: 0, y: 0, w: 0, h: 100 },
    });
    expect(solveFit({ w: 100, h: 100 }, 0, "fit", "center")).toEqual({
      kind: "pad",
      pad: { l: 0, t: 0, r: 0, b: 0 },
    });
  });
});
