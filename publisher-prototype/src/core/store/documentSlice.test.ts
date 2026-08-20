import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  type LayoutDocument,
  type LayoutObject,
  type LineObject,
  type Paint,
  type ShapeObject,
  type Stroke,
} from "../model";
import {
  documentSetupCommitted,
  ellipseDrawCommitted,
  lineDrawCommitted,
  objectDeleteCommitted,
  objectDuplicateCommitted,
  objectPasteCommitted,
  objectFillCommitted,
  objectGroupCommitted,
  objectLockCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectUngroupCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
  pageSizeOverrideCommitted,
  roundedRectCornerRadiusCommitted,
  rectDrawCommitted,
} from "./documentActions";
import {
  documentLoadedCommitted,
  documentSlice,
  stressFixtureCleared,
  stressFixtureLoaded,
} from "./documentSlice";

/**
 * Document slice contract: state IS the schema-v3 LayoutDocument; tool
 * commits append/translate/resize/rotate with complete payloads; locked
 * objects and unknown ids are skipped defensively; load and stress-fixture
 * actions are the non-undoable replacement doors.
 */

function shape(id: string, overrides: Partial<ShapeObject> = {}): ShapeObject {
  return {
    type: "shape",
    shape: "rect",
    id,
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...overrides,
  };
}

function line(id: string, overrides: Partial<LineObject> = {}): LineObject {
  return {
    type: "line",
    id,
    x1: 0,
    y1: 0,
    x2: 2,
    y2: 1,
    locked: false,
    stroke: { paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } }, width: 1 },
    ...overrides,
  };
}

function docWith(objects: LayoutObject[]): LayoutDocument {
  const doc = createEmptyDocument();
  const page = doc.pages[0];
  if (!page) throw new Error("createEmptyDocument must yield a page");
  page.objects = objects;
  return doc;
}

function objectsOf(state: LayoutDocument): LayoutObject[] {
  return state.pages[0]?.objects ?? [];
}

const { reducer } = documentSlice;

describe("documentSlice", () => {
  it("starts as the empty schema-v3 document", () => {
    expect(documentSlice.getInitialState()).toEqual(createEmptyDocument());
  });

  it("replaces the whole document on document/loadedCommitted", () => {
    const loaded = docWith([shape("a")]);
    const next = reducer(documentSlice.getInitialState(), documentLoadedCommitted(loaded));
    expect(next).toBe(loaded);
  });

  describe("draw commits", () => {
    it("appends the finished object, preserving z-order (array order)", () => {
      let state = reducer(docWith([shape("a")]), rectDrawCommitted({ pageIndex: 0, object: shape("b") }));
      state = reducer(
        state,
        ellipseDrawCommitted({ pageIndex: 0, object: shape("c", { shape: "ellipse" }) }),
      );
      state = reducer(state, lineDrawCommitted({ pageIndex: 0, object: line("d") }));
      expect(objectsOf(state).map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
    });

    it("ignores an unknown pageIndex", () => {
      const before = docWith([shape("a")]);
      const state = reducer(before, rectDrawCommitted({ pageIndex: 5, object: shape("b") }));
      expect(objectsOf(state).map((o) => o.id)).toEqual(["a"]);
    });
  });

  describe("object/moveCommitted and object/nudgeCommitted", () => {
    it("translates frame objects and both endpoints of lines, in inches", () => {
      const before = docWith([shape("a"), line("l")]);
      for (const commit of [objectMoveCommitted, objectNudgeCommitted]) {
        const state = reducer(before, commit({ pageIndex: 0, ids: ["a", "l"], dx: 0.5, dy: -0.25 }));
        const [a, l] = objectsOf(state);
        expect(a).toMatchObject({ x: 1.5, y: 0.75 });
        expect(l).toMatchObject({ x1: 0.5, y1: -0.25, x2: 2.5, y2: 0.75 });
      }
    });

    it("skips locked objects and ignores unknown ids", () => {
      const before = docWith([shape("a", { locked: true }), shape("b")]);
      const state = reducer(
        before,
        objectMoveCommitted({ pageIndex: 0, ids: ["a", "b", "ghost"], dx: 1, dy: 1 }),
      );
      const [a, b] = objectsOf(state);
      expect(a).toMatchObject({ x: 1, y: 1 });
      expect(b).toMatchObject({ x: 2, y: 2 });
    });

    it("leaves objects not named in ids untouched", () => {
      const state = reducer(
        docWith([shape("a"), shape("b")]),
        objectNudgeCommitted({ pageIndex: 0, ids: ["b"], dx: 0.1, dy: 0 }),
      );
      const [a, b] = objectsOf(state);
      expect(a).toMatchObject({ x: 1 });
      expect(b).toMatchObject({ x: 1.1 });
    });
  });

  describe("object/resizeCommitted", () => {
    it("applies frame boxes to frame objects and endpoints to lines", () => {
      const state = reducer(
        docWith([shape("a"), line("l")]),
        objectResizeCommitted({
          pageIndex: 0,
          boxes: {
            a: { x: 0.5, y: 0.5, w: 4, h: 3 },
            l: { x1: 1, y1: 1, x2: 5, y2: 2 },
          },
        }),
      );
      const [a, l] = objectsOf(state);
      expect(a).toMatchObject({ x: 0.5, y: 0.5, w: 4, h: 3 });
      expect(l).toMatchObject({ x1: 1, y1: 1, x2: 5, y2: 2 });
    });

    it("ignores a box whose shape does not match the object", () => {
      const before = docWith([shape("a"), line("l")]);
      const state = reducer(
        before,
        objectResizeCommitted({
          pageIndex: 0,
          boxes: {
            a: { x1: 0, y1: 0, x2: 1, y2: 1 },
            l: { x: 0, y: 0, w: 1, h: 1 },
          },
        }),
      );
      expect(objectsOf(state)).toEqual(objectsOf(before));
    });

    it("skips locked objects and ignores unknown ids", () => {
      const state = reducer(
        docWith([shape("a", { locked: true })]),
        objectResizeCommitted({
          pageIndex: 0,
          boxes: { a: { x: 0, y: 0, w: 9, h: 9 }, ghost: { x: 0, y: 0, w: 1, h: 1 } },
        }),
      );
      expect(objectsOf(state)[0]).toMatchObject({ x: 1, y: 1, w: 2, h: 1 });
    });
  });

  describe("object/rotateCommitted", () => {
    it("sets absolute rotation in degrees on frame objects", () => {
      const state = reducer(
        docWith([shape("a", { rotation: 10 }), shape("b")]),
        objectRotateCommitted({ pageIndex: 0, rotations: { a: 45 } }),
      );
      const [a, b] = objectsOf(state);
      expect(a).toMatchObject({ rotation: 45 });
      expect(b).toMatchObject({ rotation: 0 });
    });

    it("skips lines (no rotation field), locked objects, and unknown ids", () => {
      const before = docWith([line("l"), shape("a", { locked: true })]);
      const state = reducer(
        before,
        objectRotateCommitted({ pageIndex: 0, rotations: { l: 90, a: 90, ghost: 90 } }),
      );
      expect(objectsOf(state)).toEqual(objectsOf(before));
    });

    it("advances the group's own frame angle, storing square as absence", () => {
      let state = reducer(
        docWith([shape("a"), shape("b")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      state = reducer(
        state,
        objectRotateCommitted({ pageIndex: 0, rotations: {}, groupRotations: { g1: 45 } }),
      );
      expect(state.groups).toEqual([{ id: "g1", rotation: 45 }]);
      state = reducer(
        state,
        objectRotateCommitted({ pageIndex: 0, rotations: {}, groupRotations: { g1: 0 } }),
      );
      expect(state.groups).toEqual([{ id: "g1" }]);
    });

    it("ignores a group id the document does not hold", () => {
      const before = docWith([shape("a")]);
      expect(
        reducer(
          before,
          objectRotateCommitted({ pageIndex: 0, rotations: {}, groupRotations: { ghost: 45 } }),
        ),
      ).toEqual(before);
    });

    it("applies the orbited geometry alongside the angles — a selection turns as one body", () => {
      const state = reducer(
        docWith([shape("a"), line("l")]),
        objectRotateCommitted({
          pageIndex: 0,
          rotations: { a: 90 },
          boxes: { a: { x: 4, y: 4, w: 2, h: 1 }, l: { x1: 3, y1: 0, x2: 3, y2: 2 } },
        }),
      );
      const [a, l] = objectsOf(state);
      expect(a).toMatchObject({ rotation: 90, x: 4, y: 4, w: 2, h: 1 });
      // A line takes the whole turn through its endpoints — it has no angle.
      expect(l).toMatchObject({ x1: 3, y1: 0, x2: 3, y2: 2 });
    });

    it("leaves geometry alone when the commit carries no boxes", () => {
      const state = reducer(
        docWith([shape("a")]),
        objectRotateCommitted({ pageIndex: 0, rotations: { a: 45 } }),
      );
      expect(objectsOf(state)[0]).toMatchObject({ rotation: 45, x: 1, y: 1, w: 2, h: 1 });
    });

    it("skips locked objects' geometry too", () => {
      const before = docWith([shape("a", { locked: true })]);
      const state = reducer(
        before,
        objectRotateCommitted({
          pageIndex: 0,
          rotations: { a: 90 },
          boxes: { a: { x: 9, y: 9, w: 9, h: 9 } },
        }),
      );
      expect(objectsOf(state)).toEqual(objectsOf(before));
    });
  });

  describe("object/fillCommitted", () => {
    const red: Paint = { kind: "color", color: { space: "rgb", values: [1, 0, 0] } };

    it("replaces fill wholesale on frame objects, including to null (hollow)", () => {
      let state = reducer(
        docWith([shape("a"), shape("b", { fill: red })]),
        objectFillCommitted({ pageIndex: 0, ids: ["a"], fill: red }),
      );
      expect(objectsOf(state)[0]).toMatchObject({ fill: red });
      state = reducer(state, objectFillCommitted({ pageIndex: 0, ids: ["b"], fill: null }));
      expect(objectsOf(state)[1]).toMatchObject({ fill: null });
    });

    it("skips lines (no fill field), locked objects, and unknown ids", () => {
      const before = docWith([line("l"), shape("a", { locked: true })]);
      const state = reducer(
        before,
        objectFillCommitted({ pageIndex: 0, ids: ["l", "a", "ghost"], fill: red }),
      );
      expect(objectsOf(state)).toEqual(objectsOf(before));
    });
  });

  describe("object/strokePaintCommitted and object/strokeWidthCommitted", () => {
    const blue: Paint = { kind: "color", color: { space: "rgb", values: [0, 0, 1] } };
    const thick: Stroke = { paint: blue, width: 4 };

    it("sets stroke paint keeping each object's own width; a stroke-less frame gains a 1pt stroke", () => {
      const state = reducer(
        docWith([shape("a"), shape("b", { stroke: thick }), line("l")]),
        objectStrokePaintCommitted({ pageIndex: 0, ids: ["a", "b", "l"], paint: blue }),
      );
      const [a, b, l] = objectsOf(state);
      expect(a).toMatchObject({ stroke: { paint: blue, width: 1 } });
      expect(b).toMatchObject({ stroke: { paint: blue, width: 4 } });
      expect(l).toMatchObject({ stroke: { paint: blue, width: 1 } });
    });

    it("removes a frame's stroke on null paint but ignores null for lines (schema-required)", () => {
      const state = reducer(
        docWith([shape("a", { stroke: thick }), line("l")]),
        objectStrokePaintCommitted({ pageIndex: 0, ids: ["a", "l"], paint: null }),
      );
      const [a, l] = objectsOf(state);
      expect(a).toMatchObject({ stroke: null });
      expect(l).toMatchObject({ stroke: line("l").stroke });
    });

    it("sets width only where a stroke exists — a stroke-less frame is left alone", () => {
      const state = reducer(
        docWith([shape("a"), shape("b", { stroke: thick }), line("l")]),
        objectStrokeWidthCommitted({ pageIndex: 0, ids: ["a", "b", "l"], width: 2.5 }),
      );
      const [a, b, l] = objectsOf(state);
      expect(a).toMatchObject({ stroke: null });
      expect(b).toMatchObject({ stroke: { paint: blue, width: 2.5 } });
      expect(l).toMatchObject({ stroke: { paint: line("l").stroke.paint, width: 2.5 } });
    });

    it("skips locked objects and ignores unknown ids", () => {
      const before = docWith([shape("a", { locked: true, stroke: thick })]);
      let state = reducer(
        before,
        objectStrokePaintCommitted({ pageIndex: 0, ids: ["a", "ghost"], paint: null }),
      );
      state = reducer(
        state,
        objectStrokeWidthCommitted({ pageIndex: 0, ids: ["a", "ghost"], width: 9 }),
      );
      expect(objectsOf(state)).toEqual(objectsOf(before));
    });
  });

  describe("roundedRect/cornerRadiusCommitted", () => {
    const rounded = (id: string, radius = 0.1) =>
      shape(id, { shape: "roundedRect", cornerRadius: radius });

    it("sets the radius on rounded rects and leaves every other kind alone", () => {
      const state = reducer(
        docWith([rounded("r"), shape("plain"), line("l")]),
        roundedRectCornerRadiusCommitted({ pageIndex: 0, ids: ["r", "plain", "l"], radius: 0.4 }),
      );
      const [r, plain, l] = objectsOf(state);
      expect(r).toMatchObject({ shape: "roundedRect", cornerRadius: 0.4 });
      expect(plain).not.toHaveProperty("cornerRadius");
      expect(l).not.toHaveProperty("cornerRadius");
    });

    it("stores a radius past the frame's bound — the bound belongs to drawing", () => {
      // The 2×1in frame draws at most 0.5in, but shrinking a frame must not
      // destroy the radius a wider frame is entitled to get back.
      const state = reducer(
        docWith([rounded("r")]),
        roundedRectCornerRadiusCommitted({ pageIndex: 0, ids: ["r"], radius: 9 }),
      );
      expect(objectsOf(state)[0]).toMatchObject({ cornerRadius: 9 });
    });

    it("floors at zero, skips locked objects and ignores unknown ids", () => {
      let state = reducer(
        docWith([rounded("r")]),
        roundedRectCornerRadiusCommitted({ pageIndex: 0, ids: ["r"], radius: -5 }),
      );
      expect(objectsOf(state)[0]).toMatchObject({ cornerRadius: 0 });

      const locked = docWith([rounded("r", 0.3)].map((o) => ({ ...o, locked: true })));
      state = reducer(
        locked,
        roundedRectCornerRadiusCommitted({ pageIndex: 0, ids: ["r", "ghost"], radius: 0.9 }),
      );
      expect(objectsOf(state)).toEqual(objectsOf(locked));
    });
  });

  describe("object/lockCommitted", () => {
    it("locks and unlocks — the one commit that must NOT skip locked objects", () => {
      let state = reducer(
        docWith([shape("a"), line("l")]),
        objectLockCommitted({ pageIndex: 0, ids: ["a", "l"], locked: true }),
      );
      expect(objectsOf(state).map((o) => o.locked)).toEqual([true, true]);
      state = reducer(state, objectLockCommitted({ pageIndex: 0, ids: ["a", "l"], locked: false }));
      expect(objectsOf(state).map((o) => o.locked)).toEqual([false, false]);
    });

    it("leaves objects not named in ids untouched and ignores unknown ids", () => {
      const state = reducer(
        docWith([shape("a"), shape("b")]),
        objectLockCommitted({ pageIndex: 0, ids: ["b", "ghost"], locked: true }),
      );
      expect(objectsOf(state).map((o) => o.locked)).toEqual([false, true]);
    });
  });

  describe("document/setupCommitted and page/sizeOverrideCommitted", () => {
    it("applies exactly the provided setup fields, leaving the rest untouched", () => {
      const state = reducer(
        documentSlice.getInitialState(),
        documentSetupCommitted({ bleed: 0.25, columns: 3 }),
      );
      expect(state.bleed).toBe(0.25);
      expect(state.columns).toBe(3);
      expect(state.size).toEqual({ w: 8.5, h: 11 });
      expect(state.margin).toBe(0.5);
      expect(state.slug).toBe(0);
    });

    it("applies an orientation toggle's swapped size and flag as one action", () => {
      const state = reducer(
        documentSlice.getInitialState(),
        documentSetupCommitted({ orientation: "landscape", size: { w: 11, h: 8.5 } }),
      );
      expect(state.orientation).toBe("landscape");
      expect(state.size).toEqual({ w: 11, h: 8.5 });
    });

    it("skips invalid fields while applying valid ones — never an unparseable document", () => {
      const state = reducer(
        documentSlice.getInitialState(),
        documentSetupCommitted({ size: { w: -2, h: 11 }, margin: 0.75, columns: 2.5 }),
      );
      expect(state.size).toEqual({ w: 8.5, h: 11 });
      expect(state.columns).toBe(1);
      expect(state.margin).toBe(0.75);
    });

    it("sets, replaces, and clears a page's size override", () => {
      const initial = documentSlice.getInitialState();
      const set = reducer(
        initial,
        pageSizeOverrideCommitted({ pageIndex: 0, sizeOverride: { w: 5, h: 7 } }),
      );
      expect(set.pages[0]?.sizeOverride).toEqual({ w: 5, h: 7 });
      const cleared = reducer(
        set,
        pageSizeOverrideCommitted({ pageIndex: 0, sizeOverride: null }),
      );
      expect(cleared.pages[0]?.sizeOverride).toBeUndefined();
      expect("sizeOverride" in (cleared.pages[0] ?? {})).toBe(false);
    });

    it("ignores an invalid override and an out-of-range page index", () => {
      const initial = documentSlice.getInitialState();
      const invalid = reducer(
        initial,
        pageSizeOverrideCommitted({ pageIndex: 0, sizeOverride: { w: 0, h: 7 } }),
      );
      expect(invalid.pages[0]?.sizeOverride).toBeUndefined();
      const outOfRange = reducer(
        initial,
        pageSizeOverrideCommitted({ pageIndex: 9, sizeOverride: { w: 5, h: 7 } }),
      );
      expect(outOfRange).toEqual(initial);
    });
  });

  describe("object/deleteCommitted", () => {
    it("removes the named objects and leaves the rest in z-order", () => {
      const state = reducer(
        docWith([shape("a"), line("l"), shape("b")]),
        objectDeleteCommitted({ pageIndex: 0, ids: ["a", "b"] }),
      );
      expect(objectsOf(state).map((o) => o.id)).toEqual(["l"]);
    });

    it("keeps locked objects — the lock is what refuses — and ignores unknown ids", () => {
      const state = reducer(
        docWith([shape("a", { locked: true }), shape("b")]),
        objectDeleteCommitted({ pageIndex: 0, ids: ["a", "b", "ghost"] }),
      );
      expect(objectsOf(state).map((o) => o.id)).toEqual(["a"]);
    });

    it("drops a group its last member left, at every nesting level", () => {
      let state = reducer(
        docWith([shape("a"), shape("b"), shape("c")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "inner", ids: ["a", "b"], groupIds: [] }),
      );
      state = reducer(
        state,
        objectGroupCommitted({ pageIndex: 0, groupId: "outer", ids: ["c"], groupIds: ["inner"] }),
      );
      // Emptying inner leaves outer standing — c still lives there.
      state = reducer(state, objectDeleteCommitted({ pageIndex: 0, ids: ["a", "b"] }));
      expect(state.groups.map((g) => g.id)).toEqual(["outer"]);
      // Emptying outer takes it too.
      state = reducer(state, objectDeleteCommitted({ pageIndex: 0, ids: ["c"] }));
      expect(state.groups).toEqual([]);
    });

    it("keeps a group a locked member still sits in", () => {
      let state = reducer(
        docWith([shape("a", { locked: true }), shape("b")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      state = reducer(state, objectDeleteCommitted({ pageIndex: 0, ids: ["a", "b"] }));
      expect(objectsOf(state).map((o) => o.id)).toEqual(["a"]);
      expect(state.groups.map((g) => g.id)).toEqual(["g1"]);
    });

    it("ignores an unknown pageIndex", () => {
      const before = docWith([shape("a")]);
      expect(reducer(before, objectDeleteCommitted({ pageIndex: 5, ids: ["a"] }))).toEqual(before);
    });
  });

  describe("object/duplicateCommitted", () => {
    it("appends the copies and their fresh groups", () => {
      const state = reducer(
        docWith([shape("a")]),
        objectDuplicateCommitted({
          pageIndex: 0,
          objects: [shape("copy", { x: 3, groupId: "g-copy" })],
          groups: [{ id: "g-copy", rotation: 30 }],
        }),
      );
      expect(objectsOf(state).map((o) => o.id)).toEqual(["a", "copy"]);
      expect(state.groups).toEqual([{ id: "g-copy", rotation: 30 }]);
    });

    it("ignores an unknown pageIndex", () => {
      const before = docWith([shape("a")]);
      expect(
        reducer(before, objectDuplicateCommitted({ pageIndex: 5, objects: [shape("c")], groups: [] })),
      ).toEqual(before);
    });
  });

  describe("object/pasteCommitted", () => {
    it("appends the pasted copies exactly as a duplicate does", () => {
      const state = reducer(
        docWith([shape("a")]),
        objectPasteCommitted({
          pageIndex: 0,
          objects: [shape("pasted", { x: 3, groupId: "g-pasted" })],
          groups: [{ id: "g-pasted" }],
        }),
      );
      expect(objectsOf(state).map((o) => o.id)).toEqual(["a", "pasted"]);
      expect(state.groups).toEqual([{ id: "g-pasted" }]);
    });

    it("ignores an unknown pageIndex", () => {
      const before = docWith([shape("a")]);
      expect(
        reducer(before, objectPasteCommitted({ pageIndex: 5, objects: [shape("c")], groups: [] })),
      ).toEqual(before);
    });
  });

  describe("object/groupCommitted", () => {
    const ids = (state: LayoutDocument) => objectsOf(state).map((o) => o.id);

    it("records the group and joins the named objects to it", () => {
      const state = reducer(
        docWith([shape("a"), shape("b"), shape("c")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "c"], groupIds: [] }),
      );
      expect(state.groups).toEqual([{ id: "g1" }]);
      const grouped = objectsOf(state).filter((o) => o.groupId === "g1");
      expect(grouped.map((o) => o.id)).toEqual(["a", "c"]);
    });

    it("nests an existing group instead of flattening it — members keep their groupId", () => {
      let state = reducer(
        docWith([shape("a"), shape("b"), shape("c")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "inner", ids: ["a", "b"], groupIds: [] }),
      );
      state = reducer(
        state,
        objectGroupCommitted({ pageIndex: 0, groupId: "outer", ids: ["c"], groupIds: ["inner"] }),
      );
      expect(state.groups).toEqual([{ id: "inner", parentGroupId: "outer" }, { id: "outer" }]);
      // a and b still belong to inner; only inner moved.
      expect(objectsOf(state).map((o) => o.groupId)).toEqual(["inner", "inner", "outer"]);
    });

    it("carries the entered group as the new group's parent", () => {
      const state = reducer(
        docWith([shape("a"), shape("b")]),
        objectGroupCommitted({
          pageIndex: 0,
          groupId: "g1",
          parentGroupId: "host",
          ids: ["a", "b"],
          groupIds: [],
        }),
      );
      expect(state.groups).toEqual([{ id: "g1", parentGroupId: "host" }]);
    });

    it("restacks members contiguously, ending where the topmost member stood", () => {
      const state = reducer(
        docWith([shape("a"), shape("between"), shape("b"), shape("above")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      // "between" drops below the block; the block ends at "b"'s old depth, so
      // "above" still sits on top. Members keep their own relative order.
      expect(ids(state)).toEqual(["between", "a", "b", "above"]);
    });

    it("restacks a locked member too — it is inside the group whatever selection does", () => {
      const state = reducer(
        docWith([shape("a", { locked: true }), shape("between"), shape("b")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      expect(ids(state)).toEqual(["between", "a", "b"]);
    });

    it("ignores a re-used group id rather than recording it twice", () => {
      const first = reducer(
        docWith([shape("a"), shape("b")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      const again = reducer(
        first,
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a"], groupIds: [] }),
      );
      expect(again).toEqual(first);
    });
  });

  describe("object/ungroupCommitted", () => {
    it("drops the group and frees its objects to the page", () => {
      const grouped = reducer(
        docWith([shape("a"), shape("b")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      const state = reducer(grouped, objectUngroupCommitted({ groupIds: ["g1"] }));
      expect(state.groups).toEqual([]);
      expect(objectsOf(state).every((o) => o.groupId === undefined)).toBe(true);
    });

    it("removes exactly one level: members re-join the enclosing group", () => {
      let state = reducer(
        docWith([shape("a"), shape("b"), shape("c")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "inner", ids: ["a", "b"], groupIds: [] }),
      );
      state = reducer(
        state,
        objectGroupCommitted({ pageIndex: 0, groupId: "outer", ids: ["c"], groupIds: ["inner"] }),
      );
      state = reducer(state, objectUngroupCommitted({ groupIds: ["inner"] }));
      expect(state.groups).toEqual([{ id: "outer" }]);
      expect(objectsOf(state).map((o) => o.groupId)).toEqual(["outer", "outer", "outer"]);
    });

    it("re-parents child groups, not just objects", () => {
      let state = reducer(
        docWith([shape("a"), shape("b"), shape("c")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "inner", ids: ["a", "b"], groupIds: [] }),
      );
      state = reducer(
        state,
        objectGroupCommitted({ pageIndex: 0, groupId: "outer", ids: ["c"], groupIds: ["inner"] }),
      );
      state = reducer(state, objectUngroupCommitted({ groupIds: ["outer"] }));
      // inner survives one level up, at the page's top level.
      expect(state.groups).toEqual([{ id: "inner" }]);
      expect(objectsOf(state).map((o) => o.groupId)).toEqual(["inner", "inner", undefined]);
    });

    it("leaves stacking as grouping left it", () => {
      const grouped = reducer(
        docWith([shape("a"), shape("between"), shape("b")]),
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a", "b"], groupIds: [] }),
      );
      const state = reducer(grouped, objectUngroupCommitted({ groupIds: ["g1"] }));
      expect(objectsOf(state).map((o) => o.id)).toEqual(["between", "a", "b"]);
    });

    it("frees master-page objects too, so no groupId is left pointing at nothing", () => {
      const doc = docWith([shape("a")]);
      doc.masters = [{ id: "m1", label: "Master A", objects: [shape("m", { groupId: "g1" })] }];
      let state = reducer(
        doc,
        objectGroupCommitted({ pageIndex: 0, groupId: "g1", ids: ["a"], groupIds: [] }),
      );
      state = reducer(state, objectUngroupCommitted({ groupIds: ["g1"] }));
      expect(state.masters[0]?.objects[0]?.groupId).toBeUndefined();
    });

    it("ignores an unknown group id", () => {
      const before = docWith([shape("a")]);
      expect(reducer(before, objectUngroupCommitted({ groupIds: ["ghost"] }))).toEqual(before);
    });
  });

  describe("stress fixture (debug)", () => {
    it("swaps the first page's objects on load, leaving document setup untouched", () => {
      const fixture = [shape("s-0"), shape("s-1", { shape: "ellipse" })];
      const state = reducer(documentSlice.getInitialState(), stressFixtureLoaded(fixture));
      expect(objectsOf(state)).toEqual(fixture);
      expect({ ...state, pages: [] }).toEqual({ ...createEmptyDocument(), pages: [] });
    });

    it("empties the first page on clear", () => {
      const loaded = reducer(documentSlice.getInitialState(), stressFixtureLoaded([shape("s-0")]));
      const cleared = reducer(loaded, stressFixtureCleared());
      expect(objectsOf(cleared)).toEqual([]);
    });
  });
});
