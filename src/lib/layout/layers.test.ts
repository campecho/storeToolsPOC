import { describe, it, expect } from "vitest";
import type { LayoutDocument, LayoutObject } from "@/lib/schema";
import { baseLayerDef, BASE_LAYER_ID, LayoutDocumentSchema } from "@/lib/schema";
import { migrateV2Document, V2LayoutDocumentSchema } from "@/lib/schema/layout-v2";
import { migrateV3Document, type V3LayoutObject } from "@/lib/schema/layout-v3";
import { hexPaint } from "@/lib/color/paint";
import {
  addLayer,
  distributeToLayers,
  editableLayerIds,
  ensurePageLayers,
  flattenPage,
  layerOfObject,
  mergeLayer,
  moveObjectsToLayer,
  patchLayer,
  reorderLayer,
  visibleLayerIds,
} from "./layers";

const rect = (id: string): LayoutObject => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rotation: 0,
  locked: false,
  fill: hexPaint("#ffffff"),
  stroke: null,
});

/** The same rect in the frozen v3 object shape (hex fill) for the v2 migration lane. */
const v3Rect = (id: string): V3LayoutObject => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rotation: 0,
  locked: false,
  fill: "#ffffff",
  stroke: null,
});

/** Two layers (base + "top"), page 1: a/b on base, c on top. */
function twoLayerDoc(): LayoutDocument {
  return {
    version: 4,
    name: "t",
    product: null,
    size: { w: 8.5, h: 11 },
    orientation: "portrait",
    bleed: 0,
    margin: 0.5,
    columns: 1,
    layers: [
      baseLayerDef(),
      { id: "top", name: "Layer 2", color: "#aed76f", visible: true, locked: false, nonPrint: false },
    ],
    pages: [
      {
        id: "p1",
        masterId: null,
        layers: [
          { layerId: BASE_LAYER_ID, objects: [rect("a"), rect("b")] },
          { layerId: "top", objects: [rect("c")] },
        ],
      },
    ],
    masters: [],
    assets: {},
    guides: { v: [], h: [] },
    swatches: [],
  };
}

describe("flattenPage / layerOfObject", () => {
  it("concatenates layer contents bottom-to-top", () => {
    const page = twoLayerDoc().pages[0];
    expect(flattenPage(page).map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(layerOfObject(page, "b")).toBe(BASE_LAYER_ID);
    expect(layerOfObject(page, "c")).toBe("top");
    expect(layerOfObject(page, "nope")).toBeUndefined();
  });
});

describe("distributeToLayers", () => {
  it("keeps survivors on their layer, ordered by flat position", () => {
    const page = twoLayerDoc().pages[0];
    const flat = flattenPage(page);
    // permute the whole flat array — b before a
    const layers = distributeToLayers(page, [flat[1], flat[0], flat[2]], BASE_LAYER_ID);
    expect(layers[0].objects.map((o) => o.id)).toEqual(["b", "a"]);
    expect(layers[1].objects.map((o) => o.id)).toEqual(["c"]);
  });

  it("a cross-layer permutation cannot move objects between layers", () => {
    const page = twoLayerDoc().pages[0];
    const flat = flattenPage(page);
    // "front" gesture: move a (base layer) to the very end of the flat array
    const layers = distributeToLayers(page, [flat[1], flat[2], flat[0]], BASE_LAYER_ID);
    // a is frontmost WITHIN base, but still beneath everything on "top"
    expect(layers[0].objects.map((o) => o.id)).toEqual(["b", "a"]);
    expect(layers[1].objects.map((o) => o.id)).toEqual(["c"]);
  });

  it("fresh ids land on the target layer; unknown target falls back to base", () => {
    const page = twoLayerDoc().pages[0];
    const withNew = [...flattenPage(page), rect("n")];
    expect(distributeToLayers(page, withNew, "top")[1].objects.map((o) => o.id)).toEqual(["c", "n"]);
    expect(distributeToLayers(page, withNew, "gone")[0].objects.map((o) => o.id)).toEqual(["a", "b", "n"]);
  });

  it("dropped objects simply vanish", () => {
    const page = twoLayerDoc().pages[0];
    const layers = distributeToLayers(page, [flattenPage(page)[2]], BASE_LAYER_ID);
    expect(layers[0].objects).toHaveLength(0);
    expect(layers[1].objects.map((o) => o.id)).toEqual(["c"]);
  });
});

describe("ensurePageLayers", () => {
  it("returns the same document when already normal", () => {
    const doc = twoLayerDoc();
    expect(ensurePageLayers(doc)).toBe(doc);
  });

  it("adds missing containers in definition order and merges orphans into base", () => {
    const doc = twoLayerDoc();
    const drifted: LayoutDocument = {
      ...doc,
      pages: [
        {
          id: "p1",
          masterId: null,
          layers: [
            { layerId: "ghost", objects: [rect("g")] },
            { layerId: "top", objects: [rect("c")] },
          ],
        },
      ],
    };
    const fixed = ensurePageLayers(drifted);
    expect(fixed.pages[0].layers.map((l) => l.layerId)).toEqual([BASE_LAYER_ID, "top"]);
    // the orphaned ghost object survives on the base layer
    expect(fixed.pages[0].layers[0].objects.map((o) => o.id)).toEqual(["g"]);
    expect(fixed.pages[0].layers[1].objects.map((o) => o.id)).toEqual(["c"]);
  });
});

describe("addLayer / patchLayer / visibility sets", () => {
  it("adds an empty layer on top of the stack, on every page", () => {
    const { doc, id } = addLayer(twoLayerDoc());
    expect(doc.layers).toHaveLength(3);
    expect(doc.layers[2].id).toBe(id);
    expect(doc.pages[0].layers[2]).toEqual({ layerId: id, objects: [] });
  });

  it("patchLayer toggles flags; the id set helpers reflect them", () => {
    let doc = twoLayerDoc();
    doc = patchLayer(doc, "top", { visible: false });
    expect(visibleLayerIds(doc).has("top")).toBe(false);
    doc = patchLayer(doc, BASE_LAYER_ID, { locked: true });
    expect(editableLayerIds(doc).has(BASE_LAYER_ID)).toBe(false);
    // hidden implies non-editable regardless of lock
    expect(editableLayerIds(doc).has("top")).toBe(false);
  });
});

describe("mergeLayer", () => {
  it("merges down with the merged content stacked above the receiver's", () => {
    const doc = mergeLayer(twoLayerDoc(), "top")!;
    expect(doc.layers.map((l) => l.id)).toEqual([BASE_LAYER_ID]);
    expect(doc.pages[0].layers[0].objects.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("the bottom layer merges up; the last layer refuses", () => {
    const up = mergeLayer(twoLayerDoc(), BASE_LAYER_ID)!;
    expect(up.layers.map((l) => l.id)).toEqual(["top"]);
    expect(up.pages[0].layers[0].objects.map((o) => o.id)).toEqual(["c", "a", "b"]);
    expect(mergeLayer(up, "top")).toBeNull();
  });
});

describe("reorderLayer / moveObjectsToLayer", () => {
  it("reorders definitions and every page's containers together", () => {
    const doc = reorderLayer(twoLayerDoc(), 0, 1);
    expect(doc.layers.map((l) => l.id)).toEqual(["top", BASE_LAYER_ID]);
    expect(doc.pages[0].layers.map((l) => l.layerId)).toEqual(["top", BASE_LAYER_ID]);
    // whole-page z-order now paints c beneath a/b
    expect(flattenPage(doc.pages[0]).map((o) => o.id)).toEqual(["c", "a", "b"]);
  });

  it("out-of-range reorders are no-ops", () => {
    const doc = twoLayerDoc();
    expect(reorderLayer(doc, 0, 5)).toBe(doc);
    expect(reorderLayer(doc, 1, 1)).toBe(doc);
  });

  it("moves objects onto a layer, stacked above its content", () => {
    const doc = moveObjectsToLayer(twoLayerDoc(), "p1", ["a"], "top");
    expect(doc.pages[0].layers[0].objects.map((o) => o.id)).toEqual(["b"]);
    expect(doc.pages[0].layers[1].objects.map((o) => o.id)).toEqual(["c", "a"]);
  });

  it("unknown target layer is a no-op", () => {
    const doc = twoLayerDoc();
    expect(moveObjectsToLayer(doc, "p1", ["a"], "nope")).toBe(doc);
  });
});

describe("migrateV2Document", () => {
  it("lifts a v2 document: flat page objects become the base layer, z-order intact", () => {
    const v2 = V2LayoutDocumentSchema.parse({
      version: 2,
      name: "old",
      product: null,
      size: { w: 8.5, h: 11 },
      orientation: "portrait",
      bleed: 0,
      margin: 0.5,
      columns: 1,
      pages: [{ id: "p1", masterId: null, objects: [v3Rect("a"), v3Rect("b")] }],
      masters: [{ id: "m1", label: "A", objects: [v3Rect("m")] }],
    });
    const v3 = migrateV2Document(v2);
    expect(v3.version).toBe(3);
    expect(v3.layers).toEqual([baseLayerDef()]);
    expect(v3.pages[0].layers).toEqual([
      { layerId: BASE_LAYER_ID, objects: [v3Rect("a"), v3Rect("b")] },
    ]);
    // masters stay flat
    expect(v3.masters[0].objects.map((o) => o.id)).toEqual(["m"]);
    // …and the v3 → v4 step lifts the hex fills to Paints, reaching the current schema
    const v4 = migrateV3Document(v3);
    expect(LayoutDocumentSchema.safeParse(v4).success).toBe(true);
    expect(v4.version).toBe(4);
    expect(v4.pages[0].layers).toEqual([{ layerId: BASE_LAYER_ID, objects: [rect("a"), rect("b")] }]);
  });
});
