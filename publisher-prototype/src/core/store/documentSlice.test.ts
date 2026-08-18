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
  ellipseDrawCommitted,
  lineDrawCommitted,
  objectFillCommitted,
  objectLockCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
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
