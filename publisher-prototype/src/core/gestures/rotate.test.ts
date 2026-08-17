import { describe, expect, it } from "vitest";
import { selectTool } from "../registry/tools/selection";
import { gestureCancelled, objectRotateCommitted, type RotateCommit } from "../store/documentActions";
import { rotateMachine, type RotateContext } from "./rotate";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };

/** Pivot (2,2); the drag begins on the rotation handle at (4,2) → angle 0°.
    Lines are excluded by construction: ctx.initialRotations never lists them. */
function ctx(over: Partial<RotateContext> = {}): RotateContext {
  return {
    pageIndex: 0,
    zoom: 1,
    pivot: { x: 2, y: 2 },
    initialRotations: { a: 0, b: 7 },
    ...over,
  };
}

const HANDLE: GesturePoint = { x: 4, y: 2 };

function drag(to: GesturePoint, modifiers: GestureModifiers = NONE): GestureResult {
  let state = rotateMachine.begin(HANDLE, ctx());
  state = rotateMachine.update(state, to, modifiers);
  return rotateMachine.end(state, modifiers);
}

function rotationsOf(result: GestureResult): RotateCommit["rotations"] {
  const action = result.action;
  if (action === null || !objectRotateCommitted.match(action)) {
    throw new Error("expected a rotate commit");
  }
  return action.payload.rotations;
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
    const rotations = rotationsOf(result);
    expect(rotations["a"]).toBeCloseTo(90, 6);
    expect(rotations["b"]).toBeCloseTo(97, 6);
  });

  it("rotates negative for a counter-clockwise drag", () => {
    const rotations = rotationsOf(drag(at(-90)));
    expect(rotations["a"]).toBeCloseTo(-90, 6);
    expect(rotations["b"]).toBeCloseTo(-83, 6);
  });

  it("Shift snaps each RESULTING rotation to 15° increments, not the delta", () => {
    const rotations = rotationsOf(drag(at(40), SHIFT));
    // a: 0 + 40 → 45. b: 7 + 40 = 47 → 45 (delta-snapping would give 52).
    expect(rotations["a"]).toBeCloseTo(45, 6);
    expect(rotations["b"]).toBeCloseTo(45, 6);
  });

  it("only rotates ids the ctx lists — lines never appear", () => {
    expect(Object.keys(rotationsOf(drag(at(90))))).toEqual(["a", "b"]);
  });

  it("commits nothing on an under-slop end", () => {
    expect(drag({ x: 4.01, y: 2.01 }).action).toBeNull();
  });

  it("previews the live rotations", () => {
    let state = rotateMachine.begin(HANDLE, ctx());
    state = rotateMachine.update(state, at(30), NONE);
    const preview = rotateMachine.preview(state);
    if (preview.kind !== "rotate") throw new Error("expected a rotate preview");
    expect(preview.rotations["a"]).toBeCloseTo(30, 6);
  });
});

describe("select.esc.cancels-drag (rotate)", () => {
  it("cancel returns the gesture/cancelled record — the clause's declared action", () => {
    expect(rotateMachine.cancel().action.type).toBe(clauseAction("select.esc.cancels-drag"));
    expect(rotateMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
