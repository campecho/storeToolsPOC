import { describe, expect, it } from "vitest";
import {
  WHEEL_ZOOM_FACTOR,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  docToScreen,
  fitZoom,
  inToPx,
  pageOriginPx,
  pxToIn,
  screenToDoc,
  visibleDocRect,
  wheelZoom,
  zoomAtPoint,
  zoomInStep,
  zoomOutStep,
  type ScreenPoint,
  type Size,
  type Viewport,
} from "./viewport";

/**
 * Viewport geometry invariants: every conversion is pure math off one scale
 * factor (px = inches × 96 × zoom), pan is a px offset of the page center
 * from the viewport center, and zoom gestures keep the anchored document
 * point fixed on screen.
 */

const vpSize: Size = { w: 1000, h: 800 };
const pageSize: Size = { w: 8.5, h: 11 };

describe("wheelZoom", () => {
  it("steps by the full factor for one 100px notch, in and out", () => {
    expect(Math.abs(wheelZoom(1, -100) - WHEEL_ZOOM_FACTOR)).toBeLessThan(1e-12);
    expect(Math.abs(wheelZoom(1, 100) - 1 / WHEEL_ZOOM_FACTOR)).toBeLessThan(1e-12);
  });

  it("scales proportionally with wheel travel", () => {
    // Two half-notches accumulate exactly one notch.
    const half = wheelZoom(1, -50);
    expect(Math.abs(wheelZoom(half, -50) - WHEEL_ZOOM_FACTOR)).toBeLessThan(1e-12);
    // Twenty micro-events of 5px equal one notch — the smooth-scroll case.
    let zoom = 1;
    for (let i = 0; i < 20; i++) zoom = wheelZoom(zoom, -5);
    expect(Math.abs(zoom - WHEEL_ZOOM_FACTOR)).toBeLessThan(1e-12);
  });

  it("leaves zoom unchanged for zero delta", () => {
    expect(wheelZoom(2, 0)).toBe(2);
  });
});

describe("clampZoom", () => {
  it("passes through values inside the working range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.1)).toBe(0.1);
    expect(clampZoom(4)).toBe(4);
    expect(clampZoom(2.37)).toBe(2.37);
  });

  it("clamps values below the range up to 0.1", () => {
    expect(clampZoom(0.001)).toBe(0.1);
    expect(clampZoom(0)).toBe(0.1);
    expect(clampZoom(-5)).toBe(0.1);
  });

  it("clamps values above the range down to 4", () => {
    expect(clampZoom(4.01)).toBe(4);
    expect(clampZoom(99)).toBe(4);
  });
});

describe("zoomInStep", () => {
  it("steps from a mid-ladder stop to the next stop", () => {
    expect(zoomInStep(1)).toBe(1.25);
    expect(zoomInStep(0.5)).toBe(0.75);
    expect(zoomInStep(2)).toBe(3);
  });

  it("stays at 4 when already at the top of the ladder", () => {
    expect(zoomInStep(4)).toBe(4);
    expect(zoomInStep(5)).toBe(4);
  });

  it("snaps a between-stops value up to the next stop", () => {
    expect(zoomInStep(1.1)).toBe(1.25);
    expect(zoomInStep(0.63)).toBe(0.75);
    expect(zoomInStep(3.5)).toBe(4);
  });
});

describe("zoomOutStep", () => {
  it("steps from a mid-ladder stop to the previous stop", () => {
    expect(zoomOutStep(1)).toBe(0.75);
    expect(zoomOutStep(0.75)).toBe(0.5);
    expect(zoomOutStep(3)).toBe(2);
  });

  it("stays at 0.1 when already at the bottom of the ladder", () => {
    expect(zoomOutStep(0.1)).toBe(0.1);
    expect(zoomOutStep(0.05)).toBe(0.1);
  });

  it("snaps a between-stops value down to the previous stop", () => {
    expect(zoomOutStep(1.1)).toBe(1);
    expect(zoomOutStep(0.63)).toBe(0.5);
    expect(zoomOutStep(3.5)).toBe(3);
  });
});

describe("fitZoom", () => {
  it("falls back to 100% for an unmeasured viewport", () => {
    expect(fitZoom(8.5, 11, 0.125, 0, 0)).toBe(1);
    expect(fitZoom(8.5, 11, 0.125, 0, 800)).toBe(1);
    expect(fitZoom(8.5, 11, 0.125, 1000, 0)).toBe(1);
  });

  it("fits a US Letter page + bleed into a 1000×800 viewport at ~85%, snapped to whole percents", () => {
    const boxWPx = (8.5 + 2 * 0.125) * 96;
    const boxHPx = (11 + 2 * 0.125) * 96;
    const expected = Math.round(0.85 * Math.min(1000 / boxWPx, 800 / boxHPx) * 100) / 100;
    expect(fitZoom(8.5, 11, 0.125, 1000, 800)).toBe(expected);
    expect(fitZoom(8.5, 11, 0.125, 1000, 800)).toBe(0.63);
  });

  it("never leaves the working zoom range", () => {
    expect(fitZoom(8.5, 11, 0.125, 10, 10)).toBe(ZOOM_MIN);
    expect(fitZoom(8.5, 11, 0.125, 100000, 100000)).toBe(ZOOM_MAX);
    const mid = fitZoom(8.5, 11, 0.125, 1000, 800);
    expect(mid).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(mid).toBeLessThanOrEqual(ZOOM_MAX);
  });
});

describe("inToPx", () => {
  it("scales inches by 96 × zoom", () => {
    expect(inToPx(1, 1)).toBe(96);
    expect(inToPx(8.5, 2)).toBe(1632);
    expect(inToPx(0.5, 0.5)).toBe(24);
  });

  it("round-trips through pxToIn at several zooms", () => {
    for (const zoom of [0.1, 0.63, 1, 2.5, 4]) {
      for (const inches of [-3.25, 0, 0.125, 8.5, 11]) {
        expect(Math.abs(pxToIn(inToPx(inches, zoom), zoom) - inches)).toBeLessThan(1e-9);
      }
    }
  });
});

describe("pxToIn", () => {
  it("round-trips through inToPx at several zooms", () => {
    for (const zoom of [0.1, 0.75, 1, 3]) {
      for (const px of [-500, 0, 12, 96, 1234.5]) {
        expect(Math.abs(inToPx(pxToIn(px, zoom), zoom) - px)).toBeLessThan(1e-9);
      }
    }
  });
});

describe("pageOriginPx", () => {
  it("centers the page at pan {0,0} at zoom 1", () => {
    const origin = pageOriginPx({ zoom: 1, pan: { x: 0, y: 0 } }, vpSize, pageSize);
    expect(origin).toEqual({ x: 500 - 408, y: 400 - 528 });
    expect(origin).toEqual({ x: 92, y: -128 });
  });

  it("centers the page at pan {0,0} at any zoom", () => {
    const origin = pageOriginPx({ zoom: 2, pan: { x: 0, y: 0 } }, vpSize, pageSize);
    expect(origin).toEqual({ x: 500 - 816, y: 400 - 1056 });
  });

  it("shifts the origin 1:1 with pan", () => {
    const origin = pageOriginPx({ zoom: 1, pan: { x: 30, y: -20 } }, vpSize, pageSize);
    expect(origin).toEqual({ x: 92 + 30, y: -128 - 20 });
  });
});

describe("screenToDoc", () => {
  it("maps the page origin px to document {0,0}", () => {
    const vp: Viewport = { zoom: 1.25, pan: { x: 40, y: -15 } };
    const origin = pageOriginPx(vp, vpSize, pageSize);
    const doc = screenToDoc(origin, vp, vpSize, pageSize);
    expect(Math.abs(doc.x)).toBeLessThan(1e-9);
    expect(Math.abs(doc.y)).toBeLessThan(1e-9);
  });

  it("round-trips through docToScreen across points, zooms, and pans", () => {
    const cases: Array<{ vp: Viewport; pt: ScreenPoint }> = [
      { vp: { zoom: 1, pan: { x: 0, y: 0 } }, pt: { x: 0, y: 0 } },
      { vp: { zoom: 0.5, pan: { x: 120, y: -60 } }, pt: { x: 333, y: 41 } },
      { vp: { zoom: 4, pan: { x: -7.5, y: 12.25 } }, pt: { x: 999.5, y: 0.25 } },
      { vp: { zoom: 1.25, pan: { x: 3, y: 4 } }, pt: { x: 500, y: 400 } },
      { vp: { zoom: 0.1, pan: { x: 250, y: 250 } }, pt: { x: 17, y: 793 } },
    ];
    for (const { vp, pt } of cases) {
      const back = docToScreen(screenToDoc(pt, vp, vpSize, pageSize), vp, vpSize, pageSize);
      expect(Math.abs(back.x - pt.x)).toBeLessThan(1e-9);
      expect(Math.abs(back.y - pt.y)).toBeLessThan(1e-9);
    }
  });
});

describe("docToScreen", () => {
  it("round-trips through screenToDoc across points, zooms, and pans", () => {
    const cases: Array<{ vp: Viewport; pt: { x: number; y: number } }> = [
      { vp: { zoom: 1, pan: { x: 0, y: 0 } }, pt: { x: 0, y: 0 } },
      { vp: { zoom: 2, pan: { x: -80, y: 35 } }, pt: { x: 8.5, y: 11 } },
      { vp: { zoom: 0.25, pan: { x: 5, y: 5 } }, pt: { x: -0.125, y: 4.25 } },
    ];
    for (const { vp, pt } of cases) {
      const back = screenToDoc(docToScreen(pt, vp, vpSize, pageSize), vp, vpSize, pageSize);
      expect(Math.abs(back.x - pt.x)).toBeLessThan(1e-9);
      expect(Math.abs(back.y - pt.y)).toBeLessThan(1e-9);
    }
  });
});

describe("zoomAtPoint", () => {
  it("keeps the document point under the anchor fixed across the zoom change", () => {
    const cases: Array<{ vp: Viewport; anchor: ScreenPoint; nextZoom: number }> = [
      { vp: { zoom: 1, pan: { x: 0, y: 0 } }, anchor: { x: 500, y: 400 }, nextZoom: 2 },
      { vp: { zoom: 1, pan: { x: 0, y: 0 } }, anchor: { x: 0, y: 0 }, nextZoom: 1.25 },
      { vp: { zoom: 0.5, pan: { x: 50, y: -25 } }, anchor: { x: 987, y: 123 }, nextZoom: 0.25 },
      { vp: { zoom: 2, pan: { x: -100, y: 60 } }, anchor: { x: 12.5, y: 700 }, nextZoom: 1.1 },
      { vp: { zoom: 3, pan: { x: 8, y: 8 } }, anchor: { x: 250, y: 650 }, nextZoom: 4 },
    ];
    for (const { vp, anchor, nextZoom } of cases) {
      const before = screenToDoc(anchor, vp, vpSize, pageSize);
      const next = zoomAtPoint(vp, vpSize, pageSize, anchor, nextZoom);
      const after = screenToDoc(anchor, next, vpSize, pageSize);
      expect(next.zoom).toBe(nextZoom);
      expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9);
      expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9);
    }
  });

  it("clamps the requested zoom to the working range, still holding the anchor", () => {
    const vp: Viewport = { zoom: 1, pan: { x: 20, y: -30 } };
    const anchor: ScreenPoint = { x: 100, y: 100 };
    const before = screenToDoc(anchor, vp, vpSize, pageSize);

    const zoomedIn = zoomAtPoint(vp, vpSize, pageSize, anchor, 99);
    expect(zoomedIn.zoom).toBe(4);
    const afterIn = screenToDoc(anchor, zoomedIn, vpSize, pageSize);
    expect(Math.abs(afterIn.x - before.x)).toBeLessThan(1e-9);
    expect(Math.abs(afterIn.y - before.y)).toBeLessThan(1e-9);

    const zoomedOut = zoomAtPoint(vp, vpSize, pageSize, anchor, 0.001);
    expect(zoomedOut.zoom).toBe(0.1);
    const afterOut = screenToDoc(anchor, zoomedOut, vpSize, pageSize);
    expect(Math.abs(afterOut.x - before.x)).toBeLessThan(1e-9);
    expect(Math.abs(afterOut.y - before.y)).toBeLessThan(1e-9);
  });
});

describe("visibleDocRect", () => {
  it("spans the viewport size over 96 inches at zoom 1", () => {
    const rect = visibleDocRect({ zoom: 1, pan: { x: 0, y: 0 } }, vpSize, pageSize);
    expect(rect.w).toBe(1000 / 96);
    expect(rect.h).toBe(800 / 96);
  });

  it("has an origin that maps back to screen {0,0}", () => {
    const vp: Viewport = { zoom: 1.5, pan: { x: -42, y: 17 } };
    const rect = visibleDocRect(vp, vpSize, pageSize);
    const screen = docToScreen({ x: rect.x, y: rect.y }, vp, vpSize, pageSize);
    expect(Math.abs(screen.x)).toBeLessThan(1e-9);
    expect(Math.abs(screen.y)).toBeLessThan(1e-9);
  });
});
