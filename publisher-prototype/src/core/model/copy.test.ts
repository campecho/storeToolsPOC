import { describe, expect, it } from "vitest";
import { copiesOf } from "./copy";
import type { Group } from "./document";
import type { LayoutObject } from "./objects";

/**
 * The shared copier behind select.alt-drag.duplicates,
 * document.ctrl-d.duplicates-selection and document.ctrl-v.pastes-clipboard.
 * What matters is that a copy is INDEPENDENT — new ids, its own group — and
 * that it lands exactly where the offset says.
 */

function shape(id: string, x: number, groupId?: string): LayoutObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...(groupId === undefined ? {} : { groupId }),
  };
}

function line(id: string): LayoutObject {
  return {
    id,
    type: "line",
    x1: 1,
    y1: 2,
    x2: 3,
    y2: 4,
    locked: false,
    stroke: { paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } }, width: 1 },
  };
}

/** Deterministic factories: copy ids read c1, c2… and group ids g1, g2… */
function factories() {
  let objectN = 0;
  let groupN = 0;
  return {
    idFactory: () => `c${++objectN}`,
    groupIdFactory: () => `g${++groupN}`,
  };
}

describe("copiesOf", () => {
  it("mints a fresh id for every copy and offsets a frame by its origin", () => {
    const { objects } = copiesOf({
      objects: [shape("a", 2), shape("b", 5)],
      groups: [],
      dx: 0.25,
      dy: 0.5,
      ...factories(),
    });
    expect(objects.map((o) => o.id)).toEqual(["c1", "c2"]);
    expect(objects.map((o) => (o.type === "shape" ? [o.x, o.y] : null))).toEqual([
      [2.25, 0.5],
      [5.25, 0.5],
    ]);
  });

  it("offsets a line by both endpoints", () => {
    const { objects } = copiesOf({
      objects: [line("l")],
      groups: [],
      dx: 1,
      dy: 2,
      ...factories(),
    });
    const copy = objects[0];
    expect(copy?.type === "line" && [copy.x1, copy.y1, copy.x2, copy.y2]).toEqual([2, 4, 4, 6]);
  });

  it("leaves the originals untouched", () => {
    const original = shape("a", 2);
    copiesOf({ objects: [original], groups: [], dx: 1, dy: 1, ...factories() });
    expect(original.type === "shape" && original.x).toBe(2);
  });

  it("copies group membership onto fresh group ids, keeping the nesting", () => {
    const groups: Group[] = [{ id: "outer" }, { id: "inner", parentGroupId: "outer" }];
    const { objects, groups: copied } = copiesOf({
      objects: [shape("a", 0, "inner"), shape("b", 1, "outer")],
      groups,
      dx: 0,
      dy: 0,
      ...factories(),
    });
    expect(copied).toEqual([{ id: "g1" }, { id: "g2", parentGroupId: "g1" }]);
    expect(objects.map((o) => o.groupId)).toEqual(["g2", "g1"]);
  });

  it("drops a parent that is not itself being copied — the copy joins the page", () => {
    const { groups } = copiesOf({
      objects: [shape("a", 0, "inner")],
      groups: [{ id: "inner", parentGroupId: "outer" }],
      dx: 0,
      dy: 0,
      ...factories(),
    });
    expect(groups).toEqual([{ id: "g1" }]);
  });

  it("carries a group's stored rotation across", () => {
    const { groups } = copiesOf({
      objects: [shape("a", 0, "g")],
      groups: [{ id: "g", rotation: 30 }],
      dx: 0,
      dy: 0,
      ...factories(),
    });
    expect(groups).toEqual([{ id: "g1", rotation: 30 }]);
  });

  it("leaves an ungrouped object ungrouped rather than inventing a group", () => {
    const { objects } = copiesOf({
      objects: [shape("a", 0)],
      groups: [],
      dx: 0,
      dy: 0,
      ...factories(),
    });
    expect(objects[0] && "groupId" in objects[0]).toBe(false);
  });
});
