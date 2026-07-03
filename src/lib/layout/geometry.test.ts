import { describe, it, expect } from "vitest";
import {
  clampPageDim,
  clampZoom,
  columnGuides,
  COLUMN_GUTTER_IN,
  fitZoom,
  inToPx,
  MAX_PAGE_IN,
  MIN_PAGE_IN,
  pxToIn,
  rulerTicks,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomInStep,
  zoomOutStep,
} from "./geometry";

describe("in↔px conversion", () => {
  it("scales inches by 96 dpi × zoom", () => {
    expect(inToPx(8.5, 1)).toBe(816);
    expect(inToPx(1, 0.5)).toBe(48);
    expect(inToPx(2, 2)).toBe(384);
  });

  it("round-trips", () => {
    expect(pxToIn(inToPx(3.25, 0.63), 0.63)).toBeCloseTo(3.25, 10);
  });
});

describe("zoom clamps & steps", () => {
  it("clamps to the 10–400% range", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it("steps up and down through the step table", () => {
    expect(zoomInStep(1)).toBe(1.25);
    expect(zoomOutStep(1)).toBe(0.75);
    // from between steps, snaps to the neighbor
    expect(zoomInStep(0.63)).toBe(0.75);
    expect(zoomOutStep(0.63)).toBe(0.5);
  });

  it("stays put at the bounds", () => {
    expect(zoomInStep(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOutStep(ZOOM_MIN)).toBe(ZOOM_MIN);
  });
});

describe("fitZoom", () => {
  it("fits the page + bleed box at ~85% of the viewport, snapped to whole %", () => {
    // Letter portrait + 0.125 bleed: box 8.75 × 11.25 in = 840 × 1080 px.
    // 1000×800 viewport → 0.85 × min(1000/840, 800/1080) = 0.6296… → 0.63.
    expect(fitZoom(8.5, 11, 0.125, 1000, 800)).toBe(0.63);
  });

  it("clamps into the zoom range", () => {
    expect(fitZoom(8.5, 11, 0.125, 20000, 20000)).toBe(ZOOM_MAX);
    expect(fitZoom(240, 240, 0, 100, 100)).toBe(ZOOM_MIN);
  });

  it("falls back to 100% for an unmeasured viewport", () => {
    expect(fitZoom(8.5, 11, 0.125, 0, 0)).toBe(1);
  });
});

describe("page-dimension clamp", () => {
  it("bounds custom sizes to the large-format range", () => {
    expect(clampPageDim(0.2)).toBe(MIN_PAGE_IN);
    expect(clampPageDim(999)).toBe(MAX_PAGE_IN);
    expect(clampPageDim(36)).toBe(36);
  });
});

describe("columnGuides", () => {
  const letter = { size: { w: 8.5, h: 11 }, margin: 0.5 };

  it("is empty for a single column", () => {
    expect(columnGuides({ ...letter, columns: 1 })).toEqual([]);
  });

  it("splits the content area with the fixed gutter, symmetric about center", () => {
    const [gutter] = columnGuides({ ...letter, columns: 2 });
    // content 7.5 in, colW = (7.5 − 0.2)/2 = 3.65 → gutter at [4.15, 4.35]
    expect(gutter[0]).toBeCloseTo(4.15, 10);
    expect(gutter[1]).toBeCloseTo(4.35, 10);
    expect((gutter[0] + gutter[1]) / 2).toBeCloseTo(8.5 / 2, 10);
    expect(gutter[1] - gutter[0]).toBeCloseTo(COLUMN_GUTTER_IN, 10);
  });

  it("produces N−1 gutters", () => {
    expect(columnGuides({ ...letter, columns: 4 })).toHaveLength(3);
  });

  it("gives up when the columns can't fit", () => {
    expect(columnGuides({ size: { w: 1.2, h: 11 }, margin: 0.5, columns: 6 })).toEqual([]);
  });
});

describe("rulerTicks", () => {
  it("at 100% inches: 1/8-in minors, numbered majors every 1/2 in, mids between", () => {
    const ticks = rulerTicks(0, 96, 1);
    // 0..96px at 12px steps → 9 ticks
    expect(ticks).toHaveLength(9);
    expect(ticks[0]).toMatchObject({ px: 0, level: "major", label: "0" });
    expect(ticks[4]).toMatchObject({ px: 48, level: "major", label: "0.5" });
    expect(ticks[8]).toMatchObject({ px: 96, level: "major", label: "1" });
    expect(ticks[2]).toMatchObject({ px: 24, level: "mid" });
    expect(ticks[1]).toMatchObject({ px: 12, level: "minor" });
  });

  it("coarsens as zoom drops so ticks stay apart", () => {
    // 10%: inch = 9.6px → whole-inch minors, numbered every 5 in
    const ticks = rulerTicks(0, 96, 0.1);
    expect(ticks[1].px - ticks[0].px).toBeGreaterThanOrEqual(6); // minors stay readable
    const labeled = ticks.filter((t) => t.label !== undefined);
    expect(labeled.map((t) => t.label)).toEqual(["0", "5", "10"]);
  });

  it("covers the pasteboard left of the origin with mirrored numbers", () => {
    const ticks = rulerTicks(96, 192, 1);
    const majors = ticks.filter((t) => t.level === "major");
    expect(majors.map((t) => t.label)).toEqual(["1", "0.5", "0", "0.5", "1"]);
    expect(majors.map((t) => t.px)).toEqual([0, 48, 96, 144, 192]);
  });

  it("relabels in the active unit (mm) with nice increments", () => {
    // at 100%, 1mm = 96/25.4 ≈ 3.78px → 2mm minors (~7.6px), numbered every 20mm
    const ticks = rulerTicks(0, 96 * 2, 1, "mm");
    const labeled = ticks.filter((t) => t.label !== undefined).map((t) => t.label);
    expect(labeled).toEqual(["0", "20", "40"]); // 0..~48mm across 192px
    expect(ticks.every((t) => t.px >= 0)).toBe(true);
  });

  it("relabels in points with half-inch (36-pt) majors", () => {
    // 1pt = 96/72 ≈ 1.333px at 100% → 6pt minors, numbered every 36pt (½ in)
    const ticks = rulerTicks(0, 96 * 2, 1, "pt");
    const labeled = ticks.filter((t) => t.label !== undefined).map((t) => t.label);
    expect(labeled.slice(0, 3)).toEqual(["0", "36", "72"]);
  });

  it("returns nothing for an unmeasured ruler", () => {
    expect(rulerTicks(0, 0, 1)).toEqual([]);
  });
});
