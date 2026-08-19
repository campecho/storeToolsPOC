import { describe, expect, it } from "vitest";
import { selectTool } from "../registry/tools/selection";
import {
  gestureCancelled,
  objectRotateCommitted,
  type FrameBox,
  type LineEndpoints,
  type RotateCommit,
} from "../store/documentActions";
import { rotateMachine, type RotateContext } from "./rotate";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };

/**
 * Pivot (2,2); the drag begins on the rotation handle at (4,2) → angle 0°.
 * The selection is a rigid body about that pivot: "a" is a 2×1 frame centred
 * at (4,2), "b" a 1×1 frame centred at (2,4) already turned 7°, and "l" a
 * line from the pivot out to (4,2). Lines appear in `initial` only — they
 * carry no rotation field to seed.
 */
function ctx(over: Partial<RotateContext> = {}): RotateContext {
  return {
    pageIndex: 0,
    zoom: 1,
    pivot: { x: 2, y: 2 },
    frameRotation: 0,
    initialRotations: { a: 0, b: 7 },
    initial: {
      a: { x: 3, y: 1.5, w: 2, h: 1 },
      b: { x: 1.5, y: 3.5, w: 1, h: 1 },
      l: { x1: 2, y1: 2, x2: 4, y2: 2 },
    },
    ...over,
  };
}

const HANDLE: GesturePoint = { x: 4, y: 2 };

function drag(
  to: GesturePoint,
  modifiers: GestureModifiers = NONE,
  over: Partial<RotateContext> = {},
): GestureResult {
  let state = rotateMachine.begin(HANDLE, ctx(over));
  state = rotateMachine.update(state, to, modifiers);
  return rotateMachine.end(state, modifiers);
}

function commitOf(result: GestureResult): RotateCommit {
  const action = result.action;
  if (action === null || !objectRotateCommitted.match(action)) {
    throw new Error("expected a rotate commit");
  }
  return action.payload;
}

function boxOf(commit: RotateCommit, id: string): FrameBox {
  const box = commit.boxes?.[id];
  if (box === undefined || !("w" in box)) throw new Error(`expected a frame box for ${id}`);
  return box;
}

function endpointsOf(commit: RotateCommit, id: string): LineEndpoints {
  const box = commit.boxes?.[id];
  if (box === undefined || !("x1" in box)) throw new Error(`expected line endpoints for ${id}`);
  return box;
}

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

/** Point at `deg` on the radius-2 circle about the pivot. */
function at(deg: number): GesturePoint {
  const rad = (deg * Math.PI) / 180;
  return { x: 2 + 2 * Math.cos(rad), y: 2 + 2 * Math.sin(rad) };
}

describe("select.drag-rotate.rotates", () => {
  it("commits absolute rotations: each member's initial plus the pointer delta", () => {
    const result = drag(at(90));
    expect(result.action?.type).toBe(clauseAction("select.drag-rotate.rotates"));
    const { rotations } = commitOf(result);
    expect(rotations["a"]).toBeCloseTo(90, 6);
    expect(rotations["b"]).toBeCloseTo(97, 6);
  });

  it("orbits every member's geometry about the pivot — the selection turns as one body", () => {
    const commit = commitOf(drag(at(90)));
    // a's centre (4,2) swings a quarter turn about (2,2) to (2,4); its size
    // is untouched, so the box origin follows the centre.
    const a = boxOf(commit, "a");
    expect(a.x).toBeCloseTo(1, 6);
    expect(a.y).toBeCloseTo(3.5, 6);
    expect(a.w).toBe(2);
    expect(a.h).toBe(1);
    // b's centre (2,4) swings to (0,2).
    const b = boxOf(commit, "b");
    expect(b.x).toBeCloseTo(-0.5, 6);
    expect(b.y).toBeCloseTo(1.5, 6);
  });

  it("turns a line by its endpoints — it carries no rotation field to set", () => {
    const commit = commitOf(drag(at(90)));
    expect(commit.rotations["l"]).toBeUndefined();
    const l = endpointsOf(commit, "l");
    // The endpoint sitting ON the pivot stays; the far one swings to (2,4).
    expect(l.x1).toBeCloseTo(2, 6);
    expect(l.y1).toBeCloseTo(2, 6);
    expect(l.x2).toBeCloseTo(2, 6);
    expect(l.y2).toBeCloseTo(4, 6);
  });

  it("leaves a LONE object's box exactly as it was — its pivot is its own centre", () => {
    const lone: Partial<RotateContext> = {
      pivot: { x: 4, y: 2 },
      frameRotation: 0,
      initialRotations: { a: 0 },
      initial: { a: { x: 3, y: 1.5, w: 2, h: 1 } },
    };
    // The handle IS the pivot here, so drag from elsewhere on the circle.
    let state = rotateMachine.begin({ x: 4, y: 0 }, ctx(lone));
    state = rotateMachine.update(state, { x: 6, y: 2 }, NONE);
    const commit = commitOf(rotateMachine.end(state, NONE));
    expect(commit.rotations["a"]).toBeCloseTo(90, 6);
    expect(boxOf(commit, "a")).toEqual({ x: 3, y: 1.5, w: 2, h: 1 });
  });

  it("rotates negative for a counter-clockwise drag", () => {
    const { rotations } = commitOf(drag(at(-90)));
    expect(rotations["a"]).toBeCloseTo(-90, 6);
    expect(rotations["b"]).toBeCloseTo(-83, 6);
  });

  it("Shift snaps the FRAME's resulting angle and every member takes that one delta", () => {
    const { rotations } = commitOf(drag(at(40), SHIFT));
    // The multi-selection frame is unrotated: 0 + 40 snaps to 45, so the body
    // turns 45 and each member keeps its own offset (snapping each member
    // separately would give a: 45, b: 45 and tear the body apart).
    expect(rotations["a"]).toBeCloseTo(45, 6);
    expect(rotations["b"]).toBeCloseTo(52, 6);
  });

  it("Shift on a lone object snaps that object's own resulting angle", () => {
    // A lone selection's frame rotation IS the object's, so the snap lands on
    // a 15° multiple: 7 + 40 = 47 → 45.
    const { rotations } = commitOf(
      drag(at(40), SHIFT, {
        frameRotation: 7,
        initialRotations: { b: 7 },
        initial: { b: { x: 1.5, y: 3.5, w: 1, h: 1 } },
      }),
    );
    expect(rotations["b"]).toBeCloseTo(45, 6);
  });

  it("only rotates ids the ctx lists", () => {
    const commit = commitOf(drag(at(90)));
    expect(Object.keys(commit.rotations)).toEqual(["a", "b"]);
    expect(Object.keys(commit.boxes ?? {})).toEqual(["a", "b", "l"]);
  });

  it("commits nothing on an under-slop end", () => {
    expect(drag({ x: 4.01, y: 2.01 }).action).toBeNull();
  });

  it("previews the live rotations and the orbited geometry", () => {
    let state = rotateMachine.begin(HANDLE, ctx());
    state = rotateMachine.update(state, at(90), NONE);
    const preview = rotateMachine.preview(state);
    if (preview.kind !== "rotate") throw new Error("expected a rotate preview");
    expect(preview.rotations["a"]).toBeCloseTo(90, 6);
    const a = preview.boxes["a"];
    if (a === undefined || !("w" in a)) throw new Error("expected a frame box for a");
    expect(a.x).toBeCloseTo(1, 6);
    expect(a.y).toBeCloseTo(3.5, 6);
  });
});

describe("select.esc.cancels-drag (rotate)", () => {
  it("cancel returns the gesture/cancelled record — the clause's declared action", () => {
    expect(rotateMachine.cancel().action.type).toBe(clauseAction("select.esc.cancels-drag"));
    expect(rotateMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
