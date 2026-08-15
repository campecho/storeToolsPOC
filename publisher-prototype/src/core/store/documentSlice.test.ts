import { describe, expect, it } from "vitest";
import {
  documentSlice,
  stressFixtureCleared,
  stressFixtureLoaded,
  type PlaceholderObject,
} from "./documentSlice";

/**
 * Pre-schema document slice: a US Letter default page and the debug-bar
 * stress fixture, which swaps the placeholder objects without ever touching
 * page setup.
 */

describe("documentSlice", () => {
  const fixture: PlaceholderObject[] = [
    { id: "a", xIn: 1, yIn: 2, wIn: 3, hIn: 4, rotationDeg: 0, fill: "#ff0000" },
    { id: "b", xIn: 0.5, yIn: 0.5, wIn: 1, hIn: 1.5, rotationDeg: 45, fill: "#00ff00" },
  ];

  it("starts with a US Letter page (1/8in bleed, 1/2in margin) and no objects", () => {
    expect(documentSlice.getInitialState()).toEqual({
      page: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125, marginIn: 0.5 },
      objects: [],
    });
  });

  it("replaces the objects on stressFixtureLoaded, leaving the page untouched", () => {
    const loaded = documentSlice.reducer(
      documentSlice.getInitialState(),
      stressFixtureLoaded({ objects: fixture }),
    );
    expect(loaded.objects).toEqual(fixture);
    expect(loaded.page).toEqual({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125, marginIn: 0.5 });

    const replacement: PlaceholderObject[] = [
      { id: "c", xIn: 0, yIn: 0, wIn: 8.5, hIn: 11, rotationDeg: 90, fill: "#0000ff" },
    ];
    const reloaded = documentSlice.reducer(loaded, stressFixtureLoaded({ objects: replacement }));
    expect(reloaded.objects).toEqual(replacement);
    expect(reloaded.page).toEqual({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125, marginIn: 0.5 });
  });

  it("empties the objects on stressFixtureCleared, leaving the page untouched", () => {
    const loaded = documentSlice.reducer(
      documentSlice.getInitialState(),
      stressFixtureLoaded({ objects: fixture }),
    );
    const cleared = documentSlice.reducer(loaded, stressFixtureCleared());
    expect(cleared.objects).toEqual([]);
    expect(cleared.page).toEqual({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125, marginIn: 0.5 });
  });
});
