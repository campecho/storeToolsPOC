import { describe, it, expect } from "vitest";
import type { FrameObject, LayoutDocument, LayoutObject } from "@/lib/schema";
import { BASE_LAYER_ID, baseLayerDef } from "@/lib/schema";
import { hexPaint } from "@/lib/color/paint";
import { runPreflight, MIN_DPI_WARN, SAFE_ZONE_IN } from "./preflight";

const rect = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<FrameObject> = {},
): FrameObject => ({
  id,
  type: "rect",
  x,
  y,
  w,
  h,
  rotation: 0,
  locked: false,
  fill: hexPaint("#ffffff"),
  stroke: null,
  ...extra,
});

function doc(objects: LayoutObject[], patch: Partial<LayoutDocument> = {}): LayoutDocument {
  return {
    version: 4,
    name: "t",
    product: null,
    size: { w: 8.5, h: 11 },
    orientation: "portrait",
    bleed: 0.125,
    margin: 0.5,
    columns: 1,
    layers: [baseLayerDef()],
    pages: [{ id: "p1", masterId: null, layers: [{ layerId: BASE_LAYER_ID, objects }] }],
    masters: [],
    assets: {},
    guides: { v: [], h: [] },
    swatches: [],
    ...patch,
  };
}

const text = (id: string, family: string): FrameObject => ({
  ...rect(id, 2, 2, 2, 1),
  type: "text",
  text: {
    paragraphs: [
      {
        align: "left",
        lineSpacing: 1.2,
        runs: [{ text: "Hello", font: { family, size: 11, bold: false, italic: false, underline: false }, color: hexPaint("#111111") }],
      },
    ],
  },
});

describe("runPreflight", () => {
  it("a clean centered object raises nothing", () => {
    expect(runPreflight(doc([rect("a", 2, 2, 3, 3)]))).toEqual([]);
  });

  it("flags unknown fonts once per family, as errors first", () => {
    const issues = runPreflight(doc([text("t1", "Proxima Nova"), text("t2", "Proxima Nova")]));
    const fonts = issues.filter((i) => i.rule === "missing-font");
    expect(fonts).toHaveLength(1);
    expect(fonts[0].severity).toBe("error");
    expect(fonts[0].title).toContain("Proxima Nova");
    expect(issues[0].severity).toBe("error");
  });

  it("rates image resolution by effective DPI at placed size", () => {
    const assets = {
      img: { id: "img", name: "banner.jpg", kind: "image" as const, mime: "image/jpeg", width: 400, height: 400, bytes: 1 },
    };
    // 400px over 4in = 100 DPI → error; over 1in = 400 DPI → clean
    const low = runPreflight(doc([rect("p", 2, 2, 4, 4, { type: "picture", assetId: "img" })], { assets }));
    expect(low.find((i) => i.rule === "low-res-image")?.severity).toBe("error");
    const ok = runPreflight(doc([rect("p", 2, 2, 1, 1, { type: "picture", assetId: "img" })], { assets }));
    expect(ok.find((i) => i.rule === "low-res-image")).toBeUndefined();
    expect(MIN_DPI_WARN).toBe(300);
  });

  it("warns near the trim, and about short bleed when crossing it", () => {
    const near = runPreflight(doc([rect("a", 0.05, 2, 1, 1)]));
    expect(near.find((i) => i.rule === "safe-zone")).toBeTruthy();
    expect(SAFE_ZONE_IN).toBeGreaterThan(0.05);

    // crosses the left trim but stops inside the 0.125in bleed band
    const short = runPreflight(doc([rect("b", -0.05, 2, 1, 1)]));
    expect(short.find((i) => i.rule === "bleed-short")).toBeTruthy();

    // reaches the full bleed — clean
    const full = runPreflight(doc([rect("c", -0.125, 2, 1, 1)]));
    expect(full.find((i) => i.rule === "bleed-short")).toBeUndefined();
    expect(full.find((i) => i.rule === "safe-zone")).toBeUndefined();
  });

  it("flags hairline strokes and injected overset ids", () => {
    const issues = runPreflight(
      doc([rect("a", 2, 2, 1, 1, { stroke: { paint: hexPaint("#000000"), width: 0.25 } }), text("t", "Motiva Sans")]),
      { oversetIds: ["t"] },
    );
    expect(issues.find((i) => i.rule === "hairline")).toBeTruthy();
    expect(issues.find((i) => i.rule === "text-overflow")?.objectId).toBe("t");
  });

  it("skips hidden and non-print layers", () => {
    const d = doc([]);
    const layered: LayoutDocument = {
      ...d,
      layers: [
        d.layers[0],
        { id: "np", name: "Dieline", color: "#cc0000", visible: true, locked: false, nonPrint: true },
        { id: "hid", name: "Notes", color: "#aed76f", visible: false, locked: false, nonPrint: false },
      ],
      pages: [
        {
          id: "p1",
          masterId: null,
          layers: [
            { layerId: BASE_LAYER_ID, objects: [] },
            { layerId: "np", objects: [rect("x", 0.01, 2, 1, 1)] },
            { layerId: "hid", objects: [rect("y", 0.01, 5, 1, 1)] },
          ],
        },
      ],
    };
    expect(runPreflight(layered)).toEqual([]);
  });
});
