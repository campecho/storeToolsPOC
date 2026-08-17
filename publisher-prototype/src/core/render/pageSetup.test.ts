import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../model";
import { effectivePageSetup } from "./pageSetup";

/**
 * Effective page setup: per-page overrides win over document-level values;
 * absent overrides and out-of-range page indexes resolve to the document
 * values.
 */

describe("effectivePageSetup", () => {
  it("resolves to document-level values when the page carries no overrides", () => {
    const doc = createEmptyDocument();
    expect(effectivePageSetup(doc, 0)).toEqual({
      size: { w: 8.5, h: 11 },
      bleed: 0.125,
      margin: 0.5,
    });
  });

  it("applies per-page size/bleed/margin overrides", () => {
    const doc = createEmptyDocument();
    doc.pages[0] = {
      id: "page-1",
      masterId: null,
      objects: [],
      sizeOverride: { w: 11, h: 17 },
      bleedOverride: 0.25,
      marginOverride: 1,
    };
    expect(effectivePageSetup(doc, 0)).toEqual({
      size: { w: 11, h: 17 },
      bleed: 0.25,
      margin: 1,
    });
  });

  it("falls back to document-level values for an out-of-range page index", () => {
    const doc = createEmptyDocument();
    expect(effectivePageSetup(doc, 9)).toEqual({
      size: { w: 8.5, h: 11 },
      bleed: 0.125,
      margin: 0.5,
    });
  });
});
