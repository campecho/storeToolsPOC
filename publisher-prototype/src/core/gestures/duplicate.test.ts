import { describe, expect, it } from "vitest";
import type { Group, LayoutObject, ShapeObject } from "../model";
import { selectTool } from "../registry/tools/selection";
import {
  gestureCancelled,
  objectDuplicateCommitted,
  type DuplicateCommit,
} from "../store/documentActions";
import { duplicateMachine, type DuplicateContext } from "./duplicate";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: true };
const SHIFT: GestureModifiers = { shift: true, alt: true };

function rect(id: string, over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...over,
  };
}

/** Ids mint predictably so the assertions can name them. */
function factories() {
  let objects = 0;
  let groups = 0;
  return {
    idFactory: () => `copy-${++objects}`,
    groupIdFactory: () => `grp-copy-${++groups}`,
  };
}

function ctx(over: Partial<DuplicateContext> = {}): DuplicateContext {
  return {
    pageIndex: 0,
    zoom: 1,
    objects: [rect("a")],
    groups: [],
    ...factories(),
    ...over,
  };
}

function drag(
  to: GesturePoint,
  modifiers: GestureModifiers = NONE,
  over: Partial<DuplicateContext> = {},
): GestureResult {
  let state = duplicateMachine.begin({ x: 0, y: 0 }, ctx(over));
  state = duplicateMachine.update(state, to, modifiers);
  return duplicateMachine.end(state, modifiers);
}

function commitOf(result: GestureResult): DuplicateCommit {
  const action = result.action;
  if (action === null || !objectDuplicateCommitted.match(action)) {
    throw new Error("expected a duplicate commit");
  }
  return action.payload;
}

describe("select.alt-drag.duplicates", () => {
  it("commits copies at the drag's end, leaving the originals alone", () => {
    const result = drag({ x: 2, y: 0.5 });
    expect(result.action?.type).toBe(clauseAction("select.alt-drag.duplicates"));
    const { objects } = commitOf(result);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ id: "copy-1", x: 3, y: 1.5, w: 2, h: 1 });
  });

  it("shifts a line by both endpoints", () => {
    const line: LayoutObject = {
      id: "l",
      type: "line",
      x1: 0,
      y1: 0,
      x2: 2,
      y2: 1,
      locked: false,
      stroke: { paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } }, width: 1 },
    };
    const copy = commitOf(drag({ x: 1, y: 1 }, NONE, { objects: [line] })).objects[0];
    expect(copy).toMatchObject({ x1: 1, y1: 1, x2: 3, y2: 2 });
  });

  it("Shift constrains the copy's travel to 45°", () => {
    // A near-horizontal drag lands flat, at the distance it projects.
    const copy = commitOf(drag({ x: 2, y: 0.4 }, SHIFT)).objects[0];
    if (copy === undefined || copy.type === "line") throw new Error("expected a frame copy");
    expect(copy.x).toBeCloseTo(3, 9);
    expect(copy.y).toBeCloseTo(1, 9);
  });

  it("copies the group too, with fresh ids, so the copy is its own group", () => {
    const groups: Group[] = [{ id: "g1", rotation: 30 }];
    const commit = commitOf(
      drag({ x: 1, y: 0 }, NONE, {
        objects: [rect("a", { groupId: "g1" }), rect("b", { groupId: "g1" })],
        groups,
      }),
    );
    expect(commit.groups).toEqual([{ id: "grp-copy-1", rotation: 30 }]);
    expect(commit.objects.map((o) => o.groupId)).toEqual(["grp-copy-1", "grp-copy-1"]);
    // The originals' group is untouched — sharing its id would have enlarged it.
    expect(groups).toEqual([{ id: "g1", rotation: 30 }]);
  });

  it("re-parents nested copies to each other, not to the originals", () => {
    const commit = commitOf(
      drag({ x: 1, y: 0 }, NONE, {
        objects: [rect("a", { groupId: "inner" })],
        groups: [{ id: "outer" }, { id: "inner", parentGroupId: "outer" }],
      }),
    );
    expect(commit.groups).toEqual([
      { id: "grp-copy-1" },
      { id: "grp-copy-2", parentGroupId: "grp-copy-1" },
    ]);
    expect(commit.objects[0]?.groupId).toBe("grp-copy-2");
  });

  it("drops group membership the copy set does not carry", () => {
    const copy = commitOf(
      drag({ x: 1, y: 0 }, NONE, { objects: [rect("a", { groupId: "left-behind" })], groups: [] }),
    ).objects[0];
    expect(copy?.groupId).toBeUndefined();
  });

  it("commits nothing on an under-slop end — that press is the alt-click", () => {
    expect(drag({ x: 0.005, y: 0.005 }).action).toBeNull();
  });

  it("previews as the move ghost", () => {
    let state = duplicateMachine.begin({ x: 0, y: 0 }, ctx());
    state = duplicateMachine.update(state, { x: 1, y: 2 }, NONE);
    expect(duplicateMachine.preview(state)).toEqual({ kind: "move", dx: 1, dy: 2 });
  });

  it("cancel returns the gesture/cancelled record", () => {
    expect(duplicateMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}
