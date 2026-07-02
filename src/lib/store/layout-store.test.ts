import { describe, it, expect, beforeEach } from "vitest";
import {
  useLayoutStore,
  TOOL_LABELS,
  createDefaultDocument,
  type EditorTool,
} from "./layout-store";
import { LayoutDocumentSchema } from "@/schema";
import { MAX_PAGE_IN } from "@/lib/layout/geometry";
import { DUPLICATE_OFFSET_IN, createFrame, createLine } from "@/lib/layout/objects";

/** Objects on the active page, straight from the store. */
function pageObjects() {
  const s = useLayoutStore.getState();
  return s.doc.pages.find((p) => p.id === s.activePageId)!.objects;
}

beforeEach(() => {
  useLayoutStore.setState(useLayoutStore.getInitialState(), true);
});

describe("layout editor UI state", () => {
  it("boots with the prototype defaults: Home ribbon, Select tool, Page tab, Pages view", () => {
    const s = useLayoutStore.getState();
    expect(s.ribbon).toBe("home");
    expect(s.tool).toBe("select");
    expect(s.insp).toBe("page");
    expect(s.pages).toBe("pages");
  });

  it("switches each UI surface independently", () => {
    const s = useLayoutStore.getState();
    s.setRibbon("insert");
    s.setTool("rect");
    s.setInsp("props");
    s.setPages("masters");

    const after = useLayoutStore.getState();
    expect(after.ribbon).toBe("insert");
    expect(after.tool).toBe("rect");
    expect(after.insp).toBe("props");
    expect(after.pages).toBe("masters");
  });

  it("tools are single-select — picking one replaces the last", () => {
    const s = useLayoutStore.getState();
    s.setTool("ellipse");
    s.setTool("zoom");
    expect(useLayoutStore.getState().tool).toBe("zoom");
  });

  it("has a status-bar label for every tool", () => {
    const tools: EditorTool[] = [
      "select",
      "text",
      "rect",
      "ellipse",
      "line",
      "pic",
      "table",
      "zoom",
      "move",
    ];
    for (const tool of tools) {
      expect(TOOL_LABELS[tool]).toMatch(/ tool$/);
    }
  });
});

describe("document model", () => {
  it("boots with the pristine Letter document, valid against the schema", () => {
    const { doc } = useLayoutStore.getState();
    expect(LayoutDocumentSchema.parse(doc)).toEqual(createDefaultDocument());
    expect(doc.size).toEqual({ w: 8.5, h: 11 });
    expect(doc.bleed).toBe(0.125);
    expect(doc.margin).toBe(0.5);
    expect(doc.columns).toBe(1);
    expect(doc.pages[0].masterId).toBe("master-a");
    expect(doc.masters.map((m) => m.label)).toEqual(["A", "B"]);
  });

  it("applyPreset keeps the current orientation", () => {
    const s = useLayoutStore.getState();
    s.setOrientation("landscape");
    s.applyPreset("ledger");
    const { doc } = useLayoutStore.getState();
    expect(doc.size).toEqual({ w: 17, h: 11 });
    expect(doc.orientation).toBe("landscape");
  });

  it("applyPreset ignores unknown ids (bad deep links stay harmless)", () => {
    useLayoutStore.getState().applyPreset("nonsense");
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 8.5, h: 11 });
  });

  it("setPageSize clamps to the large-format bounds and derives orientation", () => {
    const s = useLayoutStore.getState();
    s.setPageSize(18, 24);
    expect(useLayoutStore.getState().doc.orientation).toBe("portrait");
    s.setPageSize(24, 18);
    expect(useLayoutStore.getState().doc.orientation).toBe("landscape");
    s.setPageSize(999, 0.2);
    expect(useLayoutStore.getState().doc.size).toEqual({ w: MAX_PAGE_IN, h: 1 });
  });

  it("setOrientation swaps the effective dimensions once", () => {
    const s = useLayoutStore.getState();
    s.setOrientation("landscape");
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 11, h: 8.5 });
    s.setOrientation("landscape"); // no-op — already landscape
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 11, h: 8.5 });
    s.setOrientation("portrait");
    expect(useLayoutStore.getState().doc.size).toEqual({ w: 8.5, h: 11 });
  });

  it("clamps bleed, margin, and columns to sane print ranges", () => {
    const s = useLayoutStore.getState();
    s.setBleed(3);
    s.setMargin(99);
    s.setColumns(42);
    const { doc } = useLayoutStore.getState();
    expect(doc.bleed).toBe(0.5);
    expect(doc.margin).toBe(8.5 / 2); // half the short edge
    expect(doc.columns).toBe(6);
    s.setColumns(0);
    expect(useLayoutStore.getState().doc.columns).toBe(1);
  });

  it("page-geometry changes bump fitRequestId; cosmetic ones don't", () => {
    const before = useLayoutStore.getState().fitRequestId;
    const s = useLayoutStore.getState();
    s.applyPreset("legal");
    s.setOrientation("landscape");
    s.setPageSize(20, 30);
    expect(useLayoutStore.getState().fitRequestId).toBe(before + 3);
    s.setName("Renamed");
    s.setBleed(0.25);
    expect(useLayoutStore.getState().fitRequestId).toBe(before + 3);
  });

  it("resetDoc restores the pristine document and re-fits", () => {
    const s = useLayoutStore.getState();
    s.setName("Spring sale flyer");
    s.setPageSize(18, 24);
    s.setColumns(3);
    s.toggleGuides();
    const fitBefore = useLayoutStore.getState().fitRequestId;
    s.resetDoc();
    const after = useLayoutStore.getState();
    expect(after.doc).toEqual(createDefaultDocument());
    expect(after.guidesVisible).toBe(true);
    expect(after.pan).toEqual({ x: 0, y: 0 });
    expect(after.fitRequestId).toBe(fitBefore + 1);
  });
});

describe("viewport", () => {
  it("zoom steps through the table and clamps", () => {
    const s = useLayoutStore.getState();
    s.setZoom(1);
    s.zoomIn();
    expect(useLayoutStore.getState().zoom).toBe(1.25);
    s.zoomOut();
    s.zoomOut();
    expect(useLayoutStore.getState().zoom).toBe(0.75);
    s.setZoom(99);
    expect(useLayoutStore.getState().zoom).toBe(4);
  });

  it("guides toggle flips visibility", () => {
    const s = useLayoutStore.getState();
    expect(useLayoutStore.getState().guidesVisible).toBe(true);
    s.toggleGuides();
    expect(useLayoutStore.getState().guidesVisible).toBe(false);
  });
});

describe("objects (L4 reducers)", () => {
  it("addObject appends, selects, and returns the tool to Select", () => {
    const s = useLayoutStore.getState();
    s.setTool("rect");
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    const after = useLayoutStore.getState();
    expect(pageObjects()).toHaveLength(1);
    expect(after.selectedIds).toEqual([r.id]);
    expect(after.tool).toBe("select");
    expect(after.past).toHaveLength(1);
  });

  it("transformObject: transient drags skip history, commits push it", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    const depth = useLayoutStore.getState().past.length;

    s.transformObject(r.id, { x: 2 }, true);
    expect(useLayoutStore.getState().past).toHaveLength(depth);
    expect(pageObjects()[0]).toMatchObject({ x: 2 });

    s.transformObject(r.id, { w: 3 });
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);
    expect(pageObjects()[0]).toMatchObject({ w: 3 });
  });

  it("transformObject clamps frame size at the minimum", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    s.transformObject(r.id, { w: 0, h: -5 });
    expect(pageObjects()[0]).toMatchObject({ w: 0.1, h: 0.1 });
  });

  it("commitGesture pushes the pre-gesture snapshot once, only if the doc changed", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    const depth = useLayoutStore.getState().past.length;

    // click without movement: nothing changed → no entry
    const untouched = useLayoutStore.getState().doc;
    s.commitGesture(untouched);
    expect(useLayoutStore.getState().past).toHaveLength(depth);

    // drag: several transient updates → exactly one entry
    const before = useLayoutStore.getState().doc;
    s.transformObject(r.id, { x: 2 }, true);
    s.transformObject(r.id, { x: 3 }, true);
    s.commitGesture(before);
    const after = useLayoutStore.getState();
    expect(after.past).toHaveLength(depth + 1);
    expect(after.past[after.past.length - 1]).toBe(before);
  });

  it("deleteSelection removes the objects and clears the selection", () => {
    const s = useLayoutStore.getState();
    s.addObject(createFrame("rect", 1, 1, 2, 1));
    s.deleteSelection();
    expect(pageObjects()).toHaveLength(0);
    expect(useLayoutStore.getState().selectedIds).toEqual([]);
  });

  it("duplicateSelection offsets the copy and selects it", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    s.duplicateSelection();
    const objs = pageObjects();
    expect(objs).toHaveLength(2);
    const copy = objs[1];
    expect(copy.id).not.toBe(r.id);
    expect(copy).toMatchObject({ x: 1 + DUPLICATE_OFFSET_IN, y: 1 + DUPLICATE_OFFSET_IN });
    expect(useLayoutStore.getState().selectedIds).toEqual([copy.id]);
  });

  it("reorder walks the selection through the z-stack and no-ops at the edges", () => {
    const s = useLayoutStore.getState();
    const a = createFrame("rect", 0, 0, 1, 1);
    const b = createFrame("rect", 1, 1, 1, 1);
    const c = createFrame("rect", 2, 2, 1, 1);
    s.addObject(a);
    s.addObject(b);
    s.addObject(c);

    s.setSelection([a.id]);
    s.reorder("forward");
    expect(pageObjects().map((o) => o.id)).toEqual([b.id, a.id, c.id]);

    const depth = useLayoutStore.getState().past.length;
    s.setSelection([c.id]);
    s.reorder("forward"); // already on top — no change, no history entry
    expect(pageObjects().map((o) => o.id)).toEqual([b.id, a.id, c.id]);
    expect(useLayoutStore.getState().past).toHaveLength(depth);

    s.reorder("backward");
    expect(pageObjects().map((o) => o.id)).toEqual([b.id, c.id, a.id]);
  });

  it("nudgeSelection moves by exact nudge steps, one history entry each", () => {
    const s = useLayoutStore.getState();
    const l = createLine(1, 1, 2, 2);
    s.addObject(l);
    const depth = useLayoutStore.getState().past.length;
    s.nudgeSelection(1 / 32, 0);
    s.nudgeSelection(0, 10 / 32);
    const moved = pageObjects()[0];
    expect(moved.type === "line" && moved.x1).toBeCloseTo(1 + 1 / 32, 10);
    expect(moved.type === "line" && moved.y1).toBeCloseTo(1 + 10 / 32, 10);
    expect(useLayoutStore.getState().past).toHaveLength(depth + 2);
  });
});

describe("undo history (L4 invariants)", () => {
  it("undo/redo walk the snapshot stacks and prune dead selection", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    s.transformObject(r.id, { x: 5 });

    s.undo(); // back to x:1
    expect(pageObjects()[0]).toMatchObject({ x: 1 });
    expect(useLayoutStore.getState().selectedIds).toEqual([r.id]);

    s.undo(); // back to empty page — selection pruned
    expect(pageObjects()).toHaveLength(0);
    expect(useLayoutStore.getState().selectedIds).toEqual([]);

    s.redo();
    s.redo();
    expect(pageObjects()[0]).toMatchObject({ x: 5 });
  });

  it("a new edit clears the redo stack", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    s.transformObject(r.id, { x: 5 });
    s.undo();
    expect(useLayoutStore.getState().future).toHaveLength(1);
    s.transformObject(r.id, { y: 3 });
    expect(useLayoutStore.getState().future).toHaveLength(0);
  });

  it("undo at the bottom and redo at the top are no-ops", () => {
    const s = useLayoutStore.getState();
    const before = useLayoutStore.getState().doc;
    s.undo();
    s.redo();
    expect(useLayoutStore.getState().doc).toBe(before);
  });

  it("history is bounded at 50 snapshots", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    for (let i = 0; i < 60; i++) s.transformObject(r.id, { x: i });
    expect(useLayoutStore.getState().past).toHaveLength(50);
  });

  it("page-setup commits are undoable too", () => {
    const s = useLayoutStore.getState();
    s.applyPreset("legal");
    expect(useLayoutStore.getState().doc.size.h).toBe(14);
    s.undo();
    expect(useLayoutStore.getState().doc.size.h).toBe(11);
  });

  it("resetDoc clears both stacks and the selection", () => {
    const s = useLayoutStore.getState();
    s.addObject(createFrame("rect", 1, 1, 2, 1));
    s.undo();
    expect(useLayoutStore.getState().future).toHaveLength(1);
    s.resetDoc();
    const after = useLayoutStore.getState();
    expect(after.past).toHaveLength(0);
    expect(after.future).toHaveLength(0);
    expect(after.selectedIds).toEqual([]);
  });
});

describe("persisted-state validation (the merge guard)", () => {
  it("accepts a valid stored document", () => {
    const doc = createDefaultDocument();
    doc.name = "From storage";
    expect(LayoutDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects corrupt shapes so the editor falls back to pristine", () => {
    expect(LayoutDocumentSchema.safeParse({ version: 1, name: "broken" }).success).toBe(false);
    expect(LayoutDocumentSchema.safeParse(null).success).toBe(false);
    const noPages = { ...createDefaultDocument(), pages: [] };
    expect(LayoutDocumentSchema.safeParse(noPages).success).toBe(false);
  });
});
