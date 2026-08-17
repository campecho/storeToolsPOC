import { describe, expect, it } from "vitest";
import { selectTool } from "../registry/tools/selection";
import { gestureCancelled, objectMoveCommitted } from "../store/documentActions";
import { moveMachine, type MoveContext } from "./move";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };

function ctx(over: Partial<MoveContext> = {}): MoveContext {
  return { pageIndex: 0, zoom: 1, ids: ["a", "b"], ...over };
}

function drag(from: GesturePoint, to: GesturePoint): GestureResult {
  let state = moveMachine.begin(from, ctx());
  state = moveMachine.update(state, to, NONE);
  return moveMachine.end(state, NONE);
}

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

describe("select.drag.moves-selection", () => {
  it("commits one translate with the ctx ids and the final delta", () => {
    const result = drag({ x: 1, y: 1 }, { x: 2.5, y: 1.75 });
    expect(result.action?.type).toBe(clauseAction("select.drag.moves-selection"));
    const action = result.action;
    if (action === null || !objectMoveCommitted.match(action)) {
      throw new Error("expected a move commit");
    }
    expect(action.payload).toEqual({ pageIndex: 0, ids: ["a", "b"], dx: 1.5, dy: 0.75 });
  });

  it("commits nothing on an under-slop end — the shell's click path owns selection", () => {
    const result = drag({ x: 1, y: 1 }, { x: 1.02, y: 1.01 });
    expect(result.action).toBeNull();
  });

  it("previews the live delta", () => {
    let state = moveMachine.begin({ x: 1, y: 1 }, ctx());
    state = moveMachine.update(state, { x: 0.25, y: 3 }, NONE);
    expect(moveMachine.preview(state)).toEqual({ kind: "move", dx: -0.75, dy: 2 });
  });
});

describe("select.esc.cancels-drag (move)", () => {
  it("cancel returns the gesture/cancelled record — the clause's declared action", () => {
    expect(moveMachine.cancel().action.type).toBe(clauseAction("select.esc.cancels-drag"));
    expect(moveMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
