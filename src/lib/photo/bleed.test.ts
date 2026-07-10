import { describe, it, expect } from "vitest";
import { analyzeEdges, bleedPx, EDGE_SOLID_VARIANCE } from "./bleed";
import type { Dims } from "./geometry";

/** Build a tightly-packed RGBA buffer from a per-pixel colour function. */
function makeRGBA(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = fill(x, y);
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

const isBorder = (x: number, y: number, w: number, h: number) =>
  x < 2 || x >= w - 2 || y < 2 || y >= h - 2;

/* ================================================================== */
/* analyzeEdges — auto strategy from the 2px border ring               */
/* ================================================================== */

describe("analyzeEdges", () => {
  it("a uniform white border → solid #ffffff", () => {
    const buf = makeRGBA(40, 30, () => [255, 255, 255, 255]);
    expect(analyzeEdges(buf, 40, 30)).toEqual({ strategy: "solid", color: "#ffffff" });
  });

  it("a uniform coloured border → solid with that colour's hex", () => {
    const buf = makeRGBA(40, 30, () => [42, 75, 143, 255]); // royal-blue-ish
    expect(analyzeEdges(buf, 40, 30)).toEqual({ strategy: "solid", color: "#2a4b8f" });
  });

  it("samples the RING only — a white border with a busy interior stays solid white", () => {
    const buf = makeRGBA(40, 30, (x, y) =>
      isBorder(x, y, 40, 30)
        ? [255, 255, 255, 255]
        : [(x * 37) % 256, (y * 53) % 256, (x * y) % 256, 255],
    );
    expect(analyzeEdges(buf, 40, 30)).toEqual({ strategy: "solid", color: "#ffffff" });
  });

  it("mild border noise below the variance threshold still reads solid", () => {
    // values 250..255 → variance well under EDGE_SOLID_VARIANCE.
    const buf = makeRGBA(40, 30, (x, y) => {
      const v = 250 + ((x + y) % 6);
      return [v, v, v, 255];
    });
    const r = analyzeEdges(buf, 40, 30);
    expect(r.strategy).toBe("solid");
    expect(r.color?.startsWith("#f")).toBe(true);
  });

  it("a textured, detailed edge (full-width gradient) → mirror", () => {
    const buf = makeRGBA(40, 30, (x) => {
      const v = Math.round((x / 39) * 255); // 0..255 across the top/bottom rows
      return [v, v, v, 255];
    });
    expect(analyzeEdges(buf, 40, 30)).toEqual({ strategy: "mirror" });
  });

  it("a degenerate/empty buffer falls back to mirror", () => {
    expect(analyzeEdges(new Uint8ClampedArray(0), 0, 0)).toEqual({ strategy: "mirror" });
    // too-short buffer for the claimed dims → mirror (never reads OOB)
    expect(analyzeEdges(new Uint8ClampedArray(4), 40, 30)).toEqual({ strategy: "mirror" });
  });

  it("the documented threshold is the variance line (a high-contrast border mirrors)", () => {
    // border alternating 0/255 per column → per-channel variance ~16256 ≫ threshold.
    const buf = makeRGBA(40, 30, (x) => {
      const v = x % 2 === 0 ? 0 : 255;
      return [v, v, v, 255];
    });
    expect(analyzeEdges(buf, 40, 30).strategy).toBe("mirror");
    expect(EDGE_SOLID_VARIANCE).toBe(100);
  });
});

/* ================================================================== */
/* bleedPx — px per edge to reach the bleed line                       */
/* ================================================================== */

describe("bleedPx", () => {
  const phone: Dims = { w: 4032, h: 3024 };

  it("0.125 in on 4032×3024 at 4×6 (672 DPI) → 84 px (the §5 worked example)", () => {
    expect(bleedPx(0.125, phone, { w: 4, h: 6 })).toBe(84);
  });

  it("scales with the amount at one DPI for all edges", () => {
    expect(bleedPx(0.25, phone, { w: 4, h: 6 })).toBe(168); // round(0.25 × 672)
  });

  it("floors at 1 px — a sub-pixel bleed still expands", () => {
    // 0.0005 × 672 = 0.336 → rounds to 0 → floored to 1.
    expect(bleedPx(0.0005, phone, { w: 4, h: 6 })).toBe(1);
    expect(bleedPx(0, phone, { w: 4, h: 6 })).toBe(1);
  });

  it("uses the same min-axis best-orientation DPI the strip shows", () => {
    // orientation of the inches doesn't matter (effectiveDpi auto-orients).
    expect(bleedPx(0.125, phone, { w: 6, h: 4 })).toBe(84);
  });
});
