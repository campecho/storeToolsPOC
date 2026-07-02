import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import {
  useLayoutStore,
  TOOL_LABELS,
  createDefaultDocument,
  surfaceObjects,
  type EditorTool,
} from "./layout-store";
import { LayoutDocumentSchema } from "@/schema";
import { MAX_PAGE_IN } from "@/lib/layout/geometry";
import {
  DUPLICATE_OFFSET_IN,
  createFrame,
  createLine,
  createTextFrame,
} from "@/lib/layout/objects";
import { placedPictureRect } from "@/lib/assets/placement";

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

describe("text frames (L5)", () => {
  it("setTextContent is transient — typing never floods the history", () => {
    const s = useLayoutStore.getState();
    const t = createTextFrame(1, 1, 3, 1);
    s.addObject(t);
    const depth = useLayoutStore.getState().past.length;
    s.setTextContent(t.id, "S");
    s.setTextContent(t.id, "SP");
    s.setTextContent(t.id, "SPRING SALE");
    const obj = pageObjects()[0];
    expect(obj.type === "text" && obj.text?.content).toBe("SPRING SALE");
    expect(useLayoutStore.getState().past).toHaveLength(depth);
  });

  it("an edit session commits as one gesture snapshot", () => {
    const s = useLayoutStore.getState();
    const t = createTextFrame(1, 1, 3, 1);
    s.addObject(t);
    const before = useLayoutStore.getState().doc; // session opens
    s.setTextContent(t.id, "Hello");
    s.setTextContent(t.id, "Hello world");
    s.commitGesture(before); // session closes
    s.undo();
    const obj = pageObjects()[0];
    expect(obj.type === "text" && obj.text?.content).toBe("");
  });

  it("setTextProps merges flattened patches and pushes history; no-ops don't", () => {
    const s = useLayoutStore.getState();
    const t = createTextFrame(1, 1, 3, 1);
    s.addObject(t);
    const depth = useLayoutStore.getState().past.length;

    s.setTextProps(t.id, { bold: true, size: 24, align: "center", lineSpacing: 1.1 });
    let obj = pageObjects()[0];
    expect(obj.type === "text" && obj.text?.font).toMatchObject({ bold: true, size: 24 });
    expect(obj.type === "text" && obj.text?.align).toBe("center");
    expect(obj.type === "text" && obj.text?.lineSpacing).toBe(1.1);
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);

    s.setTextProps(t.id, { bold: true }); // already bold — no change, no entry
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);

    s.setTextProps(t.id, { italic: true });
    obj = pageObjects()[0];
    expect(obj.type === "text" && obj.text?.font.italic).toBe(true);
    // the earlier fields survived the merge
    expect(obj.type === "text" && obj.text?.font.bold).toBe(true);
  });

  it("setTextProps ignores non-text objects", () => {
    const s = useLayoutStore.getState();
    const r = createFrame("rect", 1, 1, 2, 1);
    s.addObject(r);
    const depth = useLayoutStore.getState().past.length;
    s.setTextProps(r.id, { bold: true });
    expect(useLayoutStore.getState().past).toHaveLength(depth);
  });

  it("editingTextId clears on tool change, delete, undo-prune, and reset", () => {
    const s = useLayoutStore.getState();
    const t = createTextFrame(1, 1, 3, 1);
    s.addObject(t);

    s.setEditingText(t.id);
    s.setTool("rect");
    expect(useLayoutStore.getState().editingTextId).toBeNull();

    s.setEditingText(t.id);
    s.setSelection([t.id]);
    s.deleteSelection();
    expect(useLayoutStore.getState().editingTextId).toBeNull();

    s.undo(); // frame back
    const restored = pageObjects()[0];
    s.setEditingText(restored.id);
    s.undo(); // frame gone again — editing pruned
    expect(useLayoutStore.getState().editingTextId).toBeNull();

    s.redo();
    s.setEditingText(pageObjects()[0].id);
    s.resetDoc();
    expect(useLayoutStore.getState().editingTextId).toBeNull();
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

describe("pages & masters (L6)", () => {
  function masterA() {
    return useLayoutStore.getState().doc.masters.find((m) => m.id === "master-a")!;
  }

  it("addPage inserts a blank page after the active one, inheriting its master", () => {
    const s = useLayoutStore.getState();
    s.addPage();
    const st = useLayoutStore.getState();
    expect(st.doc.pages).toHaveLength(2);
    expect(st.activePageId).toBe(st.doc.pages[1].id);
    expect(st.doc.pages[1].masterId).toBe("master-a");
    expect(st.doc.pages[1].objects).toEqual([]);

    // from the first page, a new page lands in the middle — not at the end
    s.setActivePage(st.doc.pages[0].id);
    s.addPage();
    const st2 = useLayoutStore.getState();
    expect(st2.doc.pages).toHaveLength(3);
    expect(st2.activePageId).toBe(st2.doc.pages[1].id);
  });

  it("addPage clears the selection and is one undo step", () => {
    const s = useLayoutStore.getState();
    s.addObject(createFrame("rect", 1, 1, 2, 1)); // selects the rect
    s.addPage();
    expect(useLayoutStore.getState().selectedIds).toEqual([]);
    s.undo();
    const st = useLayoutStore.getState();
    expect(st.doc.pages).toHaveLength(1);
    // the pointer at the vanished page resolved back to a real one
    expect(st.activePageId).toBe("page-1");
  });

  it("removePage keeps at least one page and hands the slot to the neighbor", () => {
    const s = useLayoutStore.getState();
    s.removePage("page-1"); // guarded — last page stays
    expect(useLayoutStore.getState().doc.pages).toHaveLength(1);

    s.addPage();
    s.addPage();
    const [p1, n1, n2] = useLayoutStore.getState().doc.pages;
    s.setActivePage(n1.id);
    s.removePage(n1.id); // removing the active middle page
    const st = useLayoutStore.getState();
    expect(st.doc.pages.map((p) => p.id)).toEqual([p1.id, n2.id]);
    expect(st.activePageId).toBe(n2.id);

    s.removePage(p1.id); // removing a non-active page keeps the pointer
    expect(useLayoutStore.getState().activePageId).toBe(n2.id);
  });

  it("setActivePage is session navigation: no history, selection cleared, master editing ends", () => {
    const s = useLayoutStore.getState();
    s.addPage();
    const first = useLayoutStore.getState().doc.pages[0].id;
    const depth = useLayoutStore.getState().past.length;
    s.setMasterEditing("master-b");
    s.setActivePage(first);
    const st = useLayoutStore.getState();
    expect(st.activePageId).toBe(first);
    expect(st.masterEditingId).toBeNull();
    expect(st.past).toHaveLength(depth);
    s.setActivePage("nope"); // unknown ids are ignored
    expect(useLayoutStore.getState().activePageId).toBe(first);
  });

  it("applyMaster rebinds a page (nullable) and is undoable; unknown masters are refused", () => {
    const s = useLayoutStore.getState();
    s.applyMaster("page-1", "master-b");
    expect(useLayoutStore.getState().doc.pages[0].masterId).toBe("master-b");
    s.applyMaster("page-1", "missing");
    expect(useLayoutStore.getState().doc.pages[0].masterId).toBe("master-b");
    s.applyMaster("page-1", null);
    expect(useLayoutStore.getState().doc.pages[0].masterId).toBeNull();
    s.undo();
    s.undo();
    expect(useLayoutStore.getState().doc.pages[0].masterId).toBe("master-a");
  });

  it("addMaster takes the next free letter and opens it for editing", () => {
    const s = useLayoutStore.getState();
    s.addMaster();
    const st = useLayoutStore.getState();
    expect(st.doc.masters.map((m) => m.label)).toEqual(["A", "B", "C"]);
    expect(st.masterEditingId).toBe(st.doc.masters[2].id);
    expect(st.doc.masters[2].objects).toEqual([]);
  });

  it("object edits route to the master being edited, leaving every page untouched", () => {
    const s = useLayoutStore.getState();
    s.setMasterEditing("master-a");
    const r = createFrame("rect", 0.5, 10, 7.5, 0.4);
    s.addObject(r);
    expect(masterA().objects).toHaveLength(1);
    expect(useLayoutStore.getState().doc.pages[0].objects).toHaveLength(0);

    s.transformObject(r.id, { x: 1 });
    s.duplicateSelection();
    expect(masterA().objects).toHaveLength(2);
    s.deleteSelection(); // the duplicate became the selection
    expect(masterA().objects).toHaveLength(1);
    expect(masterA().objects[0]).toMatchObject({ x: 1 });
    expect(useLayoutStore.getState().doc.pages[0].objects).toHaveLength(0);
  });

  it("surfaceObjects resolves the editing surface", () => {
    const s = useLayoutStore.getState();
    expect(surfaceObjects(useLayoutStore.getState())).toBe(
      useLayoutStore.getState().doc.pages[0].objects,
    );
    s.setMasterEditing("master-b");
    expect(surfaceObjects(useLayoutStore.getState())).toBe(
      useLayoutStore.getState().doc.masters[1].objects,
    );
  });

  it("setMasterEditing guards unknown ids and clears the selection", () => {
    const s = useLayoutStore.getState();
    s.addObject(createFrame("rect", 1, 1, 2, 1));
    s.setMasterEditing("missing");
    expect(useLayoutStore.getState().masterEditingId).toBeNull();
    s.setMasterEditing("master-b");
    const st = useLayoutStore.getState();
    expect(st.masterEditingId).toBe("master-b");
    expect(st.selectedIds).toEqual([]);
  });

  it("undoing an Add master ends the dangling editing session", () => {
    const s = useLayoutStore.getState();
    s.addMaster(); // editing the new C
    s.undo();
    const st = useLayoutStore.getState();
    expect(st.doc.masters).toHaveLength(2);
    expect(st.masterEditingId).toBeNull();
  });

  it("resetDoc returns to the single-page pristine file", () => {
    const s = useLayoutStore.getState();
    s.addPage();
    s.setMasterEditing("master-b");
    s.resetDoc();
    const st = useLayoutStore.getState();
    expect(st.doc.pages).toHaveLength(1);
    expect(st.activePageId).toBe("page-1");
    expect(st.masterEditingId).toBeNull();
  });
});

describe("multi-select, align & distribute (L7)", () => {
  function seedThree() {
    const s = useLayoutStore.getState();
    const a = createFrame("rect", 0, 0, 1, 1);
    const b = createFrame("rect", 2, 2, 1, 1);
    const c = createFrame("rect", 7, 5, 1, 1);
    s.addObject(a);
    s.addObject(b);
    s.addObject(c);
    return [a, b, c] as const;
  }

  it("toggleSelected adds and removes members and ends a text session", () => {
    const s = useLayoutStore.getState();
    const [a, b] = seedThree();
    s.setSelection([a.id]);
    s.setEditingText(a.id);
    s.toggleSelected(b.id);
    expect(useLayoutStore.getState().selectedIds).toEqual([a.id, b.id]);
    expect(useLayoutStore.getState().editingTextId).toBeNull();
    s.toggleSelected(a.id);
    expect(useLayoutStore.getState().selectedIds).toEqual([b.id]);
  });

  it("setSurfaceObjects replaces the surface — transiently or as one undo step", () => {
    const s = useLayoutStore.getState();
    const [a] = seedThree();
    const depth = useLayoutStore.getState().past.length;
    const moved = pageObjects().map((o) => (o.id === a.id ? { ...o, x: 5 } : o));
    s.setSurfaceObjects(moved, true);
    expect(useLayoutStore.getState().past).toHaveLength(depth); // transient
    expect(pageObjects().find((o) => o.id === a.id)).toMatchObject({ x: 5 });
    s.setSurfaceObjects(pageObjects(), false);
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);
  });

  it("alignSelection works on one object relative to the page", () => {
    const s = useLayoutStore.getState();
    const [a] = seedThree();
    s.setSelection([a.id]);
    s.alignSelection("centerH");
    expect(pageObjects().find((o) => o.id === a.id)).toMatchObject({ x: 3.75 }); // (8.5-1)/2
  });

  it("relative to the selection needs two, and aligns to the union", () => {
    const s = useLayoutStore.getState();
    const [a, b] = seedThree();
    s.setAlignRel("selection");
    s.setSelection([a.id]);
    const before = useLayoutStore.getState().doc;
    s.alignSelection("left");
    expect(useLayoutStore.getState().doc).toBe(before); // guarded no-op

    s.setSelection([a.id, b.id]);
    s.alignSelection("right"); // union right edge = 3
    const objs = pageObjects();
    expect(objs.find((o) => o.id === a.id)).toMatchObject({ x: 2 });
    expect(objs.find((o) => o.id === b.id)).toMatchObject({ x: 2 });
  });

  it("aligning is one undo step with a no-op guard", () => {
    const s = useLayoutStore.getState();
    const [a, b] = seedThree();
    s.setSelection([a.id, b.id]);
    const depth = useLayoutStore.getState().past.length;
    s.alignSelection("top"); // both to y 0 (a already there)
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);
    s.alignSelection("top"); // nothing moves — no history entry
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);
    s.undo();
    expect(pageObjects().find((o) => o.id === b.id)).toMatchObject({ y: 2 });
  });

  it("distributeSelection needs three and equalizes gaps", () => {
    const s = useLayoutStore.getState();
    const [a, b, c] = seedThree();
    s.setAlignRel("selection");
    s.setSelection([a.id, b.id]);
    const before = useLayoutStore.getState().doc;
    s.distributeSelection("h");
    expect(useLayoutStore.getState().doc).toBe(before); // guarded

    s.setSelection([a.id, b.id, c.id]);
    s.distributeSelection("h"); // union 0..8, sizes 3 → gap 2.5
    const xs = [a.id, b.id, c.id].map(
      (id) => (pageObjects().find((o) => o.id === id)! as { x: number }).x,
    );
    expect(xs).toEqual([0, 3.5, 7]);
  });

  it("alignRel defaults to page and switches", () => {
    expect(useLayoutStore.getState().alignRel).toBe("page");
    useLayoutStore.getState().setAlignRel("selection");
    expect(useLayoutStore.getState().alignRel).toBe("selection");
  });
});

describe("side panel, assets & layers (L8)", () => {
  const photo = {
    id: "asset-1",
    name: "photo.png",
    kind: "image" as const,
    mime: "image/png",
    width: 480,
    height: 240,
    bytes: 2117,
  };
  const pdf = {
    id: "asset-2",
    name: "flyer.pdf",
    kind: "pdf" as const,
    mime: "application/pdf",
    bytes: 193,
  };

  it("togglePanelTab opens, switches, and collapses on the active tab", () => {
    const s = useLayoutStore.getState();
    expect(useLayoutStore.getState()).toMatchObject({ panelOpen: true, panelTab: "pages" });
    s.togglePanelTab("assets");
    expect(useLayoutStore.getState()).toMatchObject({ panelOpen: true, panelTab: "assets" });
    s.togglePanelTab("assets"); // the active tab collapses the panel
    expect(useLayoutStore.getState().panelOpen).toBe(false);
    s.togglePanelTab("layers"); // any tab reopens to it
    expect(useLayoutStore.getState()).toMatchObject({ panelOpen: true, panelTab: "layers" });
  });

  it("addAsset joins the library without an undo step", () => {
    const s = useLayoutStore.getState();
    const depth = useLayoutStore.getState().past.length;
    s.addAsset(photo);
    expect(useLayoutStore.getState().doc.assets["asset-1"]).toMatchObject({ name: "photo.png" });
    expect(useLayoutStore.getState().past).toHaveLength(depth);
  });

  it("placeAsset lands a bound picture at the computed rect, selected, one undo step", () => {
    const s = useLayoutStore.getState();
    s.addAsset(photo);
    s.placeAsset("asset-1");
    const objs = pageObjects();
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ type: "picture", assetId: "asset-1" });
    expect(objs[0]).toMatchObject(placedPictureRect(480, 240, useLayoutStore.getState().doc));
    expect(useLayoutStore.getState().selectedIds).toEqual([objs[0].id]);
    s.undo();
    expect(pageObjects()).toHaveLength(0);
    // the library survives the undo
    expect(useLayoutStore.getState().doc.assets["asset-1"]).toBeDefined();
  });

  it("placeAsset fills the selected picture frame instead of adding a new one", () => {
    const s = useLayoutStore.getState();
    const frame = createFrame("picture", 1, 1, 2, 2);
    s.addObject(frame);
    s.addAsset(photo);
    s.setSelection([frame.id]);
    s.placeAsset("asset-1");
    const objs = pageObjects();
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ id: frame.id, assetId: "asset-1", x: 1, w: 2 });
  });

  it("placeAsset is a guarded no-op for PDFs and unknown ids", () => {
    const s = useLayoutStore.getState();
    s.addAsset(pdf);
    const before = useLayoutStore.getState().doc;
    s.placeAsset("asset-2");
    s.placeAsset("no-such-asset");
    expect(useLayoutStore.getState().doc).toBe(before);
  });

  it("removeAsset drops the metadata; placed frames keep the reference (missing state)", () => {
    const s = useLayoutStore.getState();
    s.addAsset(photo);
    s.placeAsset("asset-1");
    s.removeAsset("asset-1");
    expect(useLayoutStore.getState().doc.assets["asset-1"]).toBeUndefined();
    expect(pageObjects()[0]).toMatchObject({ assetId: "asset-1" });
  });

  it("reorderObject moves one object to an absolute z-index as one undo step", () => {
    const s = useLayoutStore.getState();
    const a = createFrame("rect", 0, 0, 1, 1);
    const b = createFrame("ellipse", 1, 1, 1, 1);
    const c = createFrame("rect", 2, 2, 1, 1);
    s.addObject(a);
    s.addObject(b);
    s.addObject(c);
    const depth = useLayoutStore.getState().past.length;
    s.reorderObject(c.id, 0); // topmost to the bottom
    expect(pageObjects().map((o) => o.id)).toEqual([c.id, a.id, b.id]);
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);
    s.undo();
    expect(pageObjects().map((o) => o.id)).toEqual([a.id, b.id, c.id]);
  });

  it("reorderObject clamps the target and no-ops in place", () => {
    const s = useLayoutStore.getState();
    const a = createFrame("rect", 0, 0, 1, 1);
    const b = createFrame("rect", 1, 1, 1, 1);
    s.addObject(a);
    s.addObject(b);
    const depth = useLayoutStore.getState().past.length;
    s.reorderObject(a.id, 99); // clamps to the top
    expect(pageObjects().map((o) => o.id)).toEqual([b.id, a.id]);
    s.reorderObject(a.id, 1); // already there — no history entry
    expect(useLayoutStore.getState().past).toHaveLength(depth + 1);
  });

  it("reorderObject targets the edited master, like every object action", () => {
    const s = useLayoutStore.getState();
    s.setMasterEditing("master-a");
    const a = createFrame("rect", 0, 0, 1, 1);
    const b = createFrame("rect", 1, 1, 1, 1);
    s.addObject(a);
    s.addObject(b);
    s.reorderObject(b.id, 0);
    const master = useLayoutStore.getState().doc.masters.find((m) => m.id === "master-a")!;
    expect(master.objects.map((o) => o.id)).toEqual([b.id, a.id]);
    expect(useLayoutStore.getState().doc.pages[0].objects).toHaveLength(0);
  });

  it("undo/redo carry the current asset library forward", () => {
    const s = useLayoutStore.getState();
    s.addObject(createFrame("rect", 0, 0, 1, 1)); // an undoable step first
    s.addAsset(photo); // the library joins after that snapshot was taken
    s.undo(); // restores a doc that predates the asset — the library must survive
    expect(useLayoutStore.getState().doc.assets["asset-1"]).toBeDefined();
    expect(pageObjects()).toHaveLength(0);
    s.redo();
    expect(useLayoutStore.getState().doc.assets["asset-1"]).toBeDefined();
  });
});

describe("persisted-state validation (the merge guard)", () => {
  it("accepts a valid stored document", () => {
    const doc = createDefaultDocument();
    doc.name = "From storage";
    expect(LayoutDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("the committed contract fixture parses (fixtures/layout-document.v1.json)", () => {
    const raw = readFileSync(join(process.cwd(), "fixtures/layout-document.v1.json"), "utf8");
    const parsed = LayoutDocumentSchema.safeParse(JSON.parse(raw));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.pages).toHaveLength(2);
      expect(parsed.data.masters.map((m) => m.label)).toEqual(["A", "B"]);
      // every page's master reference resolves (soft ref — see schema note)
      const masterIds = new Set(parsed.data.masters.map((m) => m.id));
      for (const p of parsed.data.pages) {
        expect(p.masterId === null || masterIds.has(p.masterId)).toBe(true);
      }
    }
  });

  it("rejects corrupt shapes so the editor falls back to pristine", () => {
    expect(LayoutDocumentSchema.safeParse({ version: 1, name: "broken" }).success).toBe(false);
    expect(LayoutDocumentSchema.safeParse(null).success).toBe(false);
    const noPages = { ...createDefaultDocument(), pages: [] };
    expect(LayoutDocumentSchema.safeParse(noPages).success).toBe(false);
  });

  it("pre-L8 documents (no assets key) parse with an empty library — additive delta", () => {
    const doc: Record<string, unknown> = { ...createDefaultDocument() };
    delete doc.assets;
    const parsed = LayoutDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.assets).toEqual({});
  });
});
