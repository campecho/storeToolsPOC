import { describe, expect, it } from "vitest";
import { framePivot, rotatePoint, rotatedFrameCorners } from "../hittest";
import { selectTool } from "../registry/tools/selection";
import {
  gestureCancelled,
  objectResizeCommitted,
  type FrameBox,
  type LineEndpoints,
  type ResizeCommit,
} from "../store/documentActions";
import { MIN_RESIZE_SIZE_IN } from "./constants";
import {
  resizeAnchor,
  resizeHandlePoint,
  resizeMachine,
  type ResizeContext,
  type ResizeHandle,
} from "./resize";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };

/** Selection AABB (1,1)–(3,3); a in the nw quadrant, b in the se, l on the diagonal. */
const BOUNDS: FrameBox = { x: 1, y: 1, w: 2, h: 2 };
const INITIAL: Record<string, FrameBox | LineEndpoints> = {
  a: { x: 1, y: 1, w: 1, h: 1 },
  b: { x: 2, y: 2, w: 1, h: 1 },
  l: { x1: 1, y1: 1, x2: 3, y2: 3 },
};

const HANDLE_POINTS: Record<ResizeHandle, GesturePoint> = {
  nw: { x: 1, y: 1 },
  n: { x: 2, y: 1 },
  ne: { x: 3, y: 1 },
  e: { x: 3, y: 2 },
  se: { x: 3, y: 3 },
  s: { x: 2, y: 3 },
  sw: { x: 1, y: 3 },
  w: { x: 1, y: 2 },
};

const OPPOSITE: Record<ResizeHandle, ResizeHandle> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

function ctx(handle: ResizeHandle): ResizeContext {
  return {
    pageIndex: 0,
    zoom: 1,
    handle,
    anchor: HANDLE_POINTS[OPPOSITE[handle]],
    bounds: BOUNDS,
    rotation: 0,
    initial: INITIAL,
  };
}

function drag(handle: ResizeHandle, to: GesturePoint, modifiers: GestureModifiers = NONE): GestureResult {
  let state = resizeMachine.begin(HANDLE_POINTS[handle], ctx(handle));
  state = resizeMachine.update(state, to, modifiers);
  return resizeMachine.end(state, modifiers);
}

function boxesOf(result: GestureResult): ResizeCommit["boxes"] {
  const action = result.action;
  if (action === null || !objectResizeCommitted.match(action)) {
    throw new Error("expected a resize commit");
  }
  return action.payload.boxes;
}

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

describe("select.drag-handle.resizes", () => {
  it("scales every member — boxes and line endpoints — from the anchor (se handle)", () => {
    const result = drag("se", { x: 5, y: 5 });
    expect(result.action?.type).toBe(clauseAction("select.drag-handle.resizes"));
    const boxes = boxesOf(result);
    expect(boxes["a"]).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(boxes["b"]).toEqual({ x: 3, y: 3, w: 2, h: 2 });
    expect(boxes["l"]).toEqual({ x1: 1, y1: 1, x2: 5, y2: 5 });
  });

  it("scales from the nw handle about the se anchor", () => {
    const boxes = boxesOf(drag("nw", { x: 0, y: 0 }));
    expect(boxes["a"]).toEqual({ x: 0, y: 0, w: 1.5, h: 1.5 });
    expect(boxes["b"]).toEqual({ x: 1.5, y: 1.5, w: 1.5, h: 1.5 });
    expect(boxes["l"]).toEqual({ x1: 0, y1: 0, x2: 3, y2: 3 });
  });

  it("scales from the ne handle about the sw anchor", () => {
    const boxes = boxesOf(drag("ne", { x: 4, y: 0 }));
    expect(boxes["a"]).toEqual({ x: 1, y: 0, w: 1.5, h: 1.5 });
    expect(boxes["b"]).toEqual({ x: 2.5, y: 1.5, w: 1.5, h: 1.5 });
  });

  it("scales from the sw handle about the ne anchor", () => {
    const boxes = boxesOf(drag("sw", { x: 0, y: 4 }));
    expect(boxes["a"]).toEqual({ x: 0, y: 1, w: 1.5, h: 1.5 });
    expect(boxes["b"]).toEqual({ x: 1.5, y: 2.5, w: 1.5, h: 1.5 });
  });

  it("scales one axis only from an edge handle", () => {
    const boxes = boxesOf(drag("e", { x: 4, y: 7 }));
    expect(boxes["a"]).toEqual({ x: 1, y: 1, w: 1.5, h: 1 });
    expect(boxes["b"]).toEqual({ x: 2.5, y: 2, w: 1.5, h: 1 });
    const boxesN = boxesOf(drag("n", { x: 9, y: 0 }));
    expect(boxesN["a"]).toEqual({ x: 1, y: 0, w: 1, h: 1.5 });
  });

  it("Shift preserves proportions from a corner handle", () => {
    const boxes = boxesOf(drag("se", { x: 5, y: 4 }, SHIFT));
    expect(boxes["a"]).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(boxes["b"]).toEqual({ x: 3, y: 3, w: 2, h: 2 });
  });

  it("Shift mirrors the driven axis onto the other from an edge handle", () => {
    // Both axes scale about the west-edge-midpoint anchor (1,2): the
    // selection also grows vertically around its vertical center.
    const boxes = boxesOf(drag("e", { x: 4, y: 2 }, SHIFT));
    expect(boxes["a"]).toEqual({ x: 1, y: 0.5, w: 1.5, h: 1.5 });
    expect(boxes["b"]).toEqual({ x: 2.5, y: 2, w: 1.5, h: 1.5 });
  });

  it("clamps to the minimum size instead of collapsing", () => {
    const boxes = boxesOf(drag("se", { x: 1.02, y: 1.02 }));
    const minScale = MIN_RESIZE_SIZE_IN / BOUNDS.w;
    expect(boxes["a"]).toMatchObject({ x: 1, y: 1, w: minScale, h: minScale });
  });

  it("clamps a drag through the anchor — no negative boxes, no flip", () => {
    const boxes = boxesOf(drag("se", { x: 0, y: 0 }));
    const a = boxes["a"];
    if (!a || !("w" in a)) throw new Error("expected a frame box");
    expect(a.w).toBeGreaterThan(0);
    expect(a.h).toBeGreaterThan(0);
  });

  it("commits nothing on an under-slop end", () => {
    expect(drag("se", { x: 3.01, y: 3.01 }).action).toBeNull();
  });

  it("previews the live scaled boxes", () => {
    let state = resizeMachine.begin(HANDLE_POINTS.se, ctx("se"));
    state = resizeMachine.update(state, { x: 5, y: 5 }, NONE);
    const preview = resizeMachine.preview(state);
    if (preview.kind !== "resize") throw new Error("expected a resize preview");
    expect(preview.boxes["a"]).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });
});

/** A lone object rotated a quarter turn: frame (1,1)–(3,2), pivot (2,1.5).
    Frame space is the unrotated box; document space is that turned 90°. */
const ROTATED: FrameBox = { x: 1, y: 1, w: 2, h: 1 };
const ROTATION = 90;
const PIVOT = framePivot(ROTATED);

/** Frame space → document space, the same step the chrome draws with. */
function toDoc(p: GesturePoint): GesturePoint {
  return rotatePoint(p, PIVOT, ROTATION);
}

function rotatedCtx(handle: ResizeHandle): ResizeContext {
  return {
    pageIndex: 0,
    zoom: 1,
    handle,
    anchor: resizeAnchor(handle, ROTATED),
    bounds: ROTATED,
    rotation: ROTATION,
    initial: { r: ROTATED },
  };
}

/** Drag a handle on the rotated frame; `to` is a point in FRAME space, so the
    expectations below read in the same coordinates the anchor lives in. */
function rotatedDrag(handle: ResizeHandle, to: GesturePoint): FrameBox {
  const ctxOf = rotatedCtx(handle);
  let state = resizeMachine.begin(toDoc(resizeHandlePoint(handle, ROTATED)), ctxOf);
  state = resizeMachine.update(state, toDoc(to), NONE);
  const box = boxesOf(resizeMachine.end(state, NONE))["r"];
  if (!box || !("w" in box)) throw new Error("expected a frame box");
  return box;
}

function expectBoxNear(box: FrameBox, expected: FrameBox): void {
  expect(box.x).toBeCloseTo(expected.x, 9);
  expect(box.y).toBeCloseTo(expected.y, 9);
  expect(box.w).toBeCloseTo(expected.w, 9);
  expect(box.h).toBeCloseTo(expected.h, 9);
}

describe("select.drag-handle.resizes (rotated frame)", () => {
  it("places handles and anchors on the unrotated frame", () => {
    expect(resizeHandlePoint("se", ROTATED)).toEqual({ x: 3, y: 2 });
    expect(resizeHandlePoint("n", ROTATED)).toEqual({ x: 2, y: 1 });
    expect(resizeAnchor("se", ROTATED)).toEqual({ x: 1, y: 1 });
    expect(resizeAnchor("n", ROTATED)).toEqual({ x: 2, y: 2 });
  });

  it("scales in the frame's own space, then offsets so the anchor stays put", () => {
    // Doubling both axes about the nw anchor: the box grows to 4×2, and the
    // offset compensates for the frame center the scale moved.
    expectBoxNear(rotatedDrag("se", { x: 5, y: 3 }), { x: -0.5, y: 1.5, w: 4, h: 2 });
  });

  it("pins the grabbed anchor's corner in document space", () => {
    const before = rotatedFrameCorners(ROTATED, ROTATION);
    const after = rotatedFrameCorners(rotatedDrag("se", { x: 5, y: 3 }), ROTATION);
    // rotatedFrameCorners rings tl, tr, br, bl — the se drag anchors on tl.
    expect(after[0]?.x).toBeCloseTo(before[0]?.x ?? NaN, 9);
    expect(after[0]?.y).toBeCloseTo(before[0]?.y ?? NaN, 9);
  });

  it("stretches an edge handle along the frame's edge, not the document axis", () => {
    // The east handle points down the page at 90°; the drag still only
    // changes the frame's width.
    expectBoxNear(rotatedDrag("e", { x: 4, y: 1.5 }), { x: 0.5, y: 1.5, w: 3, h: 1 });
  });

  it("leaves an unrotated frame's boxes untouched by the offset", () => {
    // The pin is a no-op at rotation 0 — the multi-object cases above are the
    // regression, this is the seam stated outright.
    const boxes = boxesOf(drag("se", { x: 5, y: 5 }));
    expect(boxes["a"]).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });
});

describe("select.esc.cancels-drag (resize)", () => {
  it("cancel returns the gesture/cancelled record", () => {
    expect(resizeMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
