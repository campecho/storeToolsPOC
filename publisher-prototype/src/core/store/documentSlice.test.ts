import { describe, expect, it } from "vitest";
import { blankDocument, DEFAULT_LAYER_ID } from "../model/defaults";
import type { LayoutObject } from "../model/objects";
import {
  documentReplaced,
  documentSlice,
  effectivePageSetup,
  pageGeometry,
  stressFixtureCleared,
  stressFixtureLoaded,
} from "./documentSlice";

/**
 * The document slice over schema v3: a blank document to start, the debug-bar
 * stress fixture swapping page 1's objects without touching setup, and the
 * round trip's wholesale replacement.
 */

function rect(id: string, xIn: number, yIn: number): LayoutObject {
  return {
    type: "rect",
    id,
    layerId: DEFAULT_LAYER_ID,
    locked: false,
    opacity: 1,
    blend: "normal",
    effects: {},
    xIn,
    yIn,
    wIn: 1,
    hIn: 1,
    rotationDeg: 0,
    fill: { kind: "solid", color: { kind: "literal", value: { space: "rgb", values: [1, 0, 0] } } },
    stroke: null,
    wrap: { mode: "none", distance: { lIn: 0, rIn: 0, tIn: 0, bIn: 0 } },
  };
}

const LETTER = { widthIn: 8.5, heightIn: 11, bleedIn: 0.125, marginIn: 0.5 };

describe("documentSlice", () => {
  const fixture = [rect("a", 1, 2), rect("b", 0.5, 0.5)];

  it("starts as a blank one-page document", () => {
    expect(documentSlice.getInitialState()).toEqual(blankDocument());
  });

  it("starts on a US Letter page with 1/8in bleed and 1/2in margin", () => {
    const state = documentSlice.getInitialState();
    expect(pageGeometry(effectivePageSetup(state))).toEqual(LETTER);
    expect(state.pages[0]?.objects).toEqual([]);
  });

  it("replaces page 1's objects on stressFixtureLoaded, leaving setup untouched", () => {
    const loaded = documentSlice.reducer(
      documentSlice.getInitialState(),
      stressFixtureLoaded({ objects: fixture }),
    );
    expect(loaded.pages[0]?.objects).toEqual(fixture);
    expect(pageGeometry(effectivePageSetup(loaded))).toEqual(LETTER);

    const replacement = [rect("c", 0, 0)];
    const reloaded = documentSlice.reducer(loaded, stressFixtureLoaded({ objects: replacement }));
    expect(reloaded.pages[0]?.objects).toEqual(replacement);
    expect(pageGeometry(effectivePageSetup(reloaded))).toEqual(LETTER);
  });

  it("empties page 1's objects on stressFixtureCleared, leaving setup untouched", () => {
    const loaded = documentSlice.reducer(
      documentSlice.getInitialState(),
      stressFixtureLoaded({ objects: fixture }),
    );
    const cleared = documentSlice.reducer(loaded, stressFixtureCleared());
    expect(cleared.pages[0]?.objects).toEqual([]);
    expect(pageGeometry(effectivePageSetup(cleared))).toEqual(LETTER);
  });

  it("replaces the whole document on documentReplaced", () => {
    const incoming = blankDocument("Imported");
    incoming.setup = { ...incoming.setup, trim: { wIn: 11, hIn: 17 } };
    const replaced = documentSlice.reducer(documentSlice.getInitialState(), documentReplaced(incoming));
    expect(replaced).toEqual(incoming);
    expect(pageGeometry(effectivePageSetup(replaced)).widthIn).toBe(11);
  });
});

describe("effectivePageSetup", () => {
  it("prefers a page's own setup over the document's (§1.4 mixed sizes)", () => {
    const doc = blankDocument();
    const override = { ...doc.setup, trim: { wIn: 4, hIn: 6 } };
    doc.pages[0]!.setup = override;
    expect(effectivePageSetup(doc)).toEqual(override);
  });

  it("falls back to the document setup, including for a missing page", () => {
    const doc = blankDocument();
    expect(effectivePageSetup(doc)).toEqual(doc.setup);
    expect(effectivePageSetup(doc, 99)).toEqual(doc.setup);
  });
});
