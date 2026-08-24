import { describe, it, expect, beforeEach } from "vitest";
import { useLayoutStore, interactiveSurfaceObjects, surfaceObjects } from "./layout-store";
import { BASE_LAYER_ID } from "@/lib/schema";
import type { LayoutObject } from "@/lib/schema";

/**
 * Store-level layer behavior (schema v3, redesign Phase 5): the active layer
 * receives new objects, z-reorder clamps to the layer band, hide/lock shed
 * selection and interactivity, and every layer action is one undo step.
 */

const rect = (id: string): LayoutObject => ({
  id,
  type: "rect",
  x: 1,
  y: 1,
  w: 1,
  h: 1,
  rotation: 0,
  locked: false,
  fill: "#fff",
  stroke: null,
});

beforeEach(() => {
  useLayoutStore.setState(useLayoutStore.getInitialState(), true);
});

describe("active layer", () => {
  it("boots on the base layer; addLayer creates on top and activates it", () => {
    const s = useLayoutStore.getState();
    expect(s.activeLayerId).toBe(BASE_LAYER_ID);
    s.addLayer();
    const after = useLayoutStore.getState();
    expect(after.doc.layers).toHaveLength(2);
    expect(after.activeLayerId).toBe(after.doc.layers[1].id);
    expect(after.doc.pages[0].layers[1].objects).toHaveLength(0);
  });

  it("new objects land on the active layer", () => {
    const s = useLayoutStore.getState();
    s.addObject(rect("on-base"));
    s.addLayer();
    useLayoutStore.getState().addObject(rect("on-top"));
    const page = useLayoutStore.getState().doc.pages[0];
    expect(page.layers[0].objects.map((o) => o.id)).toEqual(["on-base"]);
    expect(page.layers[1].objects.map((o) => o.id)).toEqual(["on-top"]);
  });

  it("setActiveLayer ignores unknown ids", () => {
    const s = useLayoutStore.getState();
    s.setActiveLayer("nope");
    expect(useLayoutStore.getState().activeLayerId).toBe(BASE_LAYER_ID);
  });
});

describe("z-reorder clamps to the layer band", () => {
  it("bring-to-front keeps a base object beneath upper-layer content", () => {
    const s = useLayoutStore.getState();
    s.addObject(rect("a"));
    s.addObject(rect("b"));
    s.addLayer();
    useLayoutStore.getState().addObject(rect("c"));
    useLayoutStore.getState().setSelection(["a"]);
    useLayoutStore.getState().reorder("front");
    const page = useLayoutStore.getState().doc.pages[0];
    expect(page.layers[0].objects.map((o) => o.id)).toEqual(["b", "a"]);
    expect(page.layers[1].objects.map((o) => o.id)).toEqual(["c"]);
    // whole-page z-order: a is front of its band, still beneath c
    expect(surfaceObjects(useLayoutStore.getState()).map((o) => o.id)).toEqual(["b", "a", "c"]);
  });
});

describe("visibility & lock gates", () => {
  it("hiding a layer sheds its selection and its interactivity", () => {
    const s = useLayoutStore.getState();
    s.addObject(rect("a"));
    s.setSelection(["a"]);
    s.setLayerVisible(BASE_LAYER_ID, false);
    const after = useLayoutStore.getState();
    expect(after.selectedIds).toEqual([]);
    expect(interactiveSurfaceObjects(after)).toHaveLength(0);
    // the object still exists in the document
    expect(after.doc.pages[0].layers[0].objects).toHaveLength(1);
  });

  it("locking a layer keeps objects visible but not interactive", () => {
    const s = useLayoutStore.getState();
    s.addObject(rect("a"));
    s.setLayerLocked(BASE_LAYER_ID, true);
    const after = useLayoutStore.getState();
    expect(surfaceObjects(after).map((o) => o.id)).toEqual(["a"]);
    expect(interactiveSurfaceObjects(after)).toHaveLength(0);
  });
});

describe("merge / move / rename / undo", () => {
  it("mergeLayerDown folds content down and is one undo step", () => {
    const s = useLayoutStore.getState();
    s.addObject(rect("a"));
    s.addLayer();
    const topId = useLayoutStore.getState().activeLayerId;
    useLayoutStore.getState().addObject(rect("c"));
    useLayoutStore.getState().mergeLayerDown(topId);
    let now = useLayoutStore.getState();
    expect(now.doc.layers).toHaveLength(1);
    expect(now.doc.pages[0].layers[0].objects.map((o) => o.id)).toEqual(["a", "c"]);
    expect(now.activeLayerId).toBe(BASE_LAYER_ID);
    now.undo();
    now = useLayoutStore.getState();
    expect(now.doc.layers).toHaveLength(2);
    expect(now.doc.pages[0].layers[1].objects.map((o) => o.id)).toEqual(["c"]);
  });

  it("the last layer refuses to merge", () => {
    const s = useLayoutStore.getState();
    const before = s.doc;
    s.mergeLayerDown(BASE_LAYER_ID);
    expect(useLayoutStore.getState().doc).toBe(before);
  });

  it("moveSelectionToLayer relocates the selection", () => {
    const s = useLayoutStore.getState();
    s.addObject(rect("a"));
    s.addLayer();
    const topId = useLayoutStore.getState().activeLayerId;
    useLayoutStore.getState().setSelection(["a"]);
    useLayoutStore.getState().moveSelectionToLayer(topId);
    const page = useLayoutStore.getState().doc.pages[0];
    expect(page.layers[0].objects).toHaveLength(0);
    expect(page.layers[1].objects.map((o) => o.id)).toEqual(["a"]);
  });

  it("renameLayer renames; moveLayer reorders and undo restores", () => {
    const s = useLayoutStore.getState();
    s.renameLayer(BASE_LAYER_ID, "Dieline");
    expect(useLayoutStore.getState().doc.layers[0].name).toBe("Dieline");
    useLayoutStore.getState().addLayer();
    useLayoutStore.getState().moveLayer(1, 0);
    expect(useLayoutStore.getState().doc.layers[1].id).toBe(BASE_LAYER_ID);
    useLayoutStore.getState().undo();
    expect(useLayoutStore.getState().doc.layers[0].id).toBe(BASE_LAYER_ID);
  });

  it("undoing addLayer clamps the active layer back to one that exists", () => {
    const s = useLayoutStore.getState();
    s.addLayer();
    const topId = useLayoutStore.getState().activeLayerId;
    expect(topId).not.toBe(BASE_LAYER_ID);
    useLayoutStore.getState().undo();
    expect(useLayoutStore.getState().activeLayerId).toBe(BASE_LAYER_ID);
  });
});

describe("new pages follow the layer stack", () => {
  it("addPage carries one container per document layer", () => {
    const s = useLayoutStore.getState();
    s.addLayer();
    useLayoutStore.getState().addPage();
    const page = useLayoutStore.getState().doc.pages[1];
    expect(page.layers.map((l) => l.layerId)).toEqual(
      useLayoutStore.getState().doc.layers.map((l) => l.id),
    );
  });
});
