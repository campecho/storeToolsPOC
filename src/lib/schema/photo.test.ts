import { describe, it, expect } from "vitest";
import {
  PhotoOpSchema,
  RenderFormatSchema,
  RenderPayloadSchema,
  PhotoDiagnosticsSchema,
  PhotoSourceSchema,
  type PhotoOp,
} from "./photo";

/* ================================================================== */
/* The three print-geometry ops going live at PE5 (stored-explicit)    */
/* ================================================================== */

describe("BleedExpandOpSchema — px is required (pre-release v1)", () => {
  const base = { op: "bleedExpand", label: "Expand bleed 0.125 in", strategy: "mirror", amount: 0.125 };

  it("parses with an integer px ≥ 1", () => {
    expect(PhotoOpSchema.safeParse({ ...base, px: 84 }).success).toBe(true);
  });
  it("rejects a bare bleedExpand with no px", () => {
    expect(PhotoOpSchema.safeParse(base).success).toBe(false);
  });
  it("rejects px < 1 or non-integer", () => {
    expect(PhotoOpSchema.safeParse({ ...base, px: 0 }).success).toBe(false);
    expect(PhotoOpSchema.safeParse({ ...base, px: 2.5 }).success).toBe(false);
  });
});

describe("ResizeOpSchema — targetPx is required", () => {
  const base = { op: "resize", label: "Resize", mode: "percent", percent: 50 };

  it("parses with targetPx (the resolved output dims)", () => {
    expect(
      PhotoOpSchema.safeParse({ ...base, targetPx: { width: 800, height: 600 } }).success,
    ).toBe(true);
  });
  it("rejects a resize with no targetPx", () => {
    expect(PhotoOpSchema.safeParse(base).success).toBe(false);
  });
  it("rejects a targetPx with a zero/non-integer dimension", () => {
    expect(
      PhotoOpSchema.safeParse({ ...base, targetPx: { width: 0, height: 600 } }).success,
    ).toBe(false);
    expect(
      PhotoOpSchema.safeParse({ ...base, targetPx: { width: 800.5, height: 600 } }).success,
    ).toBe(false);
  });
});

describe("FitToSizeOpSchema — the rect/pad mode invariant (refine)", () => {
  const rect = { x: 0, y: 0, w: 1000, h: 500 };
  const pad = { l: 0, t: 0, r: 500, b: 0 };
  const fill = (extra: object) => ({ op: "fitToSize", label: "Fit to size", mode: "fill", anchor: "center", ...extra });
  const fit = (extra: object) => ({ op: "fitToSize", label: "Fit to size", mode: "fit", anchor: "center", ...extra });

  it("fill with exactly rect parses", () => {
    expect(PhotoOpSchema.safeParse(fill({ rect })).success).toBe(true);
  });
  it("fit with exactly pad parses", () => {
    expect(PhotoOpSchema.safeParse(fit({ pad })).success).toBe(true);
  });
  it("fill with pad (wrong payload for the mode) is rejected", () => {
    expect(PhotoOpSchema.safeParse(fill({ pad })).success).toBe(false);
  });
  it("fit with rect (wrong payload for the mode) is rejected", () => {
    expect(PhotoOpSchema.safeParse(fit({ rect })).success).toBe(false);
  });
  it("both present is rejected (fill)", () => {
    expect(PhotoOpSchema.safeParse(fill({ rect, pad })).success).toBe(false);
  });
  it("neither present is rejected (both modes)", () => {
    expect(PhotoOpSchema.safeParse(fill({})).success).toBe(false);
    expect(PhotoOpSchema.safeParse(fit({})).success).toBe(false);
  });
  it("the refine carries a clear message naming the invariant", () => {
    const r = PhotoOpSchema.safeParse(fill({ pad }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /mode 'fill' requires exactly `rect`/.test(i.message))).toBe(true);
    }
  });

  it("the refine leaves every other op untouched (a crop still parses)", () => {
    const crop: PhotoOp = {
      op: "crop",
      label: "Crop",
      rect: { x: 0, y: 0, w: 100, h: 100 },
      ratio: null,
      shape: "rect",
    };
    expect(PhotoOpSchema.safeParse(crop).success).toBe(true);
  });
});

/* ================================================================== */
/* Render contract additions                                           */
/* ================================================================== */

describe("RenderFormatSchema — the print pair is added", () => {
  it("accepts jpeg / png / tiff / pdf", () => {
    for (const f of ["jpeg", "png", "tiff", "pdf"]) {
      expect(RenderFormatSchema.safeParse(f).success).toBe(true);
    }
  });
  it("rejects an unknown format", () => {
    expect(RenderFormatSchema.safeParse("webp").success).toBe(false);
  });
});

describe("RenderPayloadSchema — intent + printTarget", () => {
  it("defaults intent to srgb when absent (a pre-PE5 payload renders unchanged)", () => {
    const r = RenderPayloadSchema.safeParse({ recipe: [], format: "png", quality: 90 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.intent).toBe("srgb");
  });
  it("accepts an explicit cmyk intent and a print target (inches)", () => {
    const r = RenderPayloadSchema.safeParse({
      recipe: [],
      format: "pdf",
      quality: 90,
      intent: "cmyk",
      printTarget: { w: 4, h: 6, bleed: 0.125 },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.intent).toBe("cmyk");
      expect(r.data.printTarget).toEqual({ w: 4, h: 6, bleed: 0.125 });
    }
  });
  it("printTarget stays optional (omitted on screen output)", () => {
    const r = RenderPayloadSchema.safeParse({ recipe: [], format: "jpeg", quality: 80 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.printTarget).toBeUndefined();
  });
});

/* ================================================================== */
/* Diagnostics + source additions                                      */
/* ================================================================== */

describe("PhotoDiagnosticsSchema — cmykPreserve (tificc capability)", () => {
  const formats = {
    jpeg: true, png: true, webp: true, gif: true, tiff: true, heic: false, svg: true, bmp: false,
  };
  const base = { engine: null, jailed: { rlimits: true }, formats };

  it("requires cmykPreserve", () => {
    expect(PhotoDiagnosticsSchema.safeParse(base).success).toBe(false);
    expect(PhotoDiagnosticsSchema.safeParse({ ...base, cmykPreserve: true }).success).toBe(true);
  });
});

describe("PhotoSourceSchema — cmykAssetId is optional/additive", () => {
  const base = {
    assetId: "photo:m", proxyAssetId: "photo:p", masterMime: "image/jpeg",
    width: 4000, height: 3000, proxyWidth: 1600, proxyHeight: 1200,
    originalName: "x.jpg", colorSpace: "rgb", intakeNotes: [],
  };
  it("parses without cmykAssetId (the RGB path)", () => {
    expect(PhotoSourceSchema.safeParse(base).success).toBe(true);
  });
  it("parses with cmykAssetId (the preserved-CMYK master)", () => {
    const r = PhotoSourceSchema.safeParse({ ...base, colorSpace: "cmyk", cmykAssetId: "photo:cmyk-1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cmykAssetId).toBe("photo:cmyk-1");
  });
});
