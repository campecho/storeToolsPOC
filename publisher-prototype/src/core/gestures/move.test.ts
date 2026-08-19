import { describe, expect, it } from "vitest";
import { selectTool } from "../registry/tools/selection";
import { objectMoveCommitted, type TranslateCommit } from "../store/documentActions";
import { moveMachine, type MoveContext } from "./move";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };

const CTX: MoveContext = { pageIndex: 0, zoom: 1, ids: ["a", "b"] };

function drag(to: GesturePoint, modifiers: GestureModifiers = NONE): GestureResult {
  let state = moveMachine.begin({ x: 0, y: 0 }, CTX);
  state = moveMachine.update(state, to, modifiers);
  return moveMachine.end(state, modifiers);
}

function deltaOf(result: GestureResult): TranslateCommit {
  const action = result.action;
  if (action === null || !objectMoveCommitted.match(action)) {
    throw new Error("expected a move commit");
  }
  return action.payload;
}

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

describe("select.drag.moves-selection", () => {
  it("commits the raw pointer delta for every listed id", () => {
    const result = drag({ x: 1.5, y: -0.25 });
    expect(result.action?.type).toBe(clauseAction("select.drag.moves-selection"));
    expect(deltaOf(result)).toMatchObject({ ids: ["a", "b"], dx: 1.5, dy: -0.25 });
  });

  it("commits nothing on an under-slop end — the click path owns selection", () => {
    expect(drag({ x: 0.005, y: 0.005 }).action).toBeNull();
  });
});

describe("select.shift-drag.constrains-move", () => {
  it("pulls a near-horizontal drag flat, at the distance it projects", () => {
    const { dx, dy } = deltaOf(drag({ x: 2, y: 0.4 }, SHIFT));
    expect(dx).toBeCloseTo(2, 9);
    expect(dy).toBeCloseTo(0, 9);
  });

  it("pulls a near-vertical drag straight down", () => {
    const { dx, dy } = deltaOf(drag({ x: 0.3, y: -2 }, SHIFT));
    expect(dx).toBeCloseTo(0, 9);
    expect(dy).toBeCloseTo(-2, 9);
  });

  it("keeps a diagonal diagonal — 45° is one of the four", () => {
    const { dx, dy } = deltaOf(drag({ x: 2, y: 1.8 }, SHIFT));
    expect(dx).toBeCloseTo(dy, 9);
    expect(dx).toBeGreaterThan(0);
  });

  it("re-chooses the axis from where the drag is NOW, and frees it on release", () => {
    // Sideways first, then downward: the constraint follows the live drag.
    let state = moveMachine.begin({ x: 0, y: 0 }, CTX);
    state = moveMachine.update(state, { x: 2, y: 0.1 }, SHIFT);
    let preview = moveMachine.preview(state);
    if (preview.kind !== "move") throw new Error("expected a move preview");
    expect(preview.dy).toBeCloseTo(0, 9);
    state = moveMachine.update(state, { x: 0.1, y: 2 }, SHIFT);
    preview = moveMachine.preview(state);
    if (preview.kind !== "move") throw new Error("expected a move preview");
    expect(preview.dx).toBeCloseTo(0, 9);
    expect(preview.dy).toBeCloseTo(2, 9);
    // Letting Shift go hands the raw delta straight back.
    expect(deltaOf(moveMachine.end(state, NONE))).toMatchObject({ dx: 0.1, dy: 2 });
  });
});
