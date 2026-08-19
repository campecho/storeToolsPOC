import { describe, expect, it } from "vitest";
import type { Group } from "./document";
import { enteredGroup, groupAncestry, groupMemberIds, selectionUnit } from "./groups";
import type { LayoutObject, ShapeObject } from "./objects";

/**
 * Group membership resolution (SEAMS decision of record 2026-08-17): a click
 * selects the outermost group an object belongs to, and entering a group
 * moves that boundary one level inward.
 */

function rect(id: string, over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...over,
  };
}

/** outer ⊃ inner; "loose" belongs to neither. */
const GROUPS: Group[] = [{ id: "outer" }, { id: "inner", parentGroupId: "outer" }];
const OBJECTS: LayoutObject[] = [
  rect("a", { groupId: "outer" }),
  rect("b", { groupId: "inner" }),
  rect("c", { groupId: "inner" }),
  rect("locked", { groupId: "inner", locked: true }),
  rect("loose"),
];

describe("groupAncestry", () => {
  it("walks a nested group outward to its root", () => {
    expect(groupAncestry(GROUPS, "inner")).toEqual(["inner", "outer"]);
    expect(groupAncestry(GROUPS, "outer")).toEqual(["outer"]);
  });

  it("is empty for an ungrouped object and for an unknown group id", () => {
    expect(groupAncestry(GROUPS, undefined)).toEqual([]);
    expect(groupAncestry(GROUPS, "ghost")).toEqual([]);
  });

  it("terminates on a parent cycle rather than looping", () => {
    const cyclic: Group[] = [
      { id: "x", parentGroupId: "y" },
      { id: "y", parentGroupId: "x" },
    ];
    expect(groupAncestry(cyclic, "x")).toEqual(["x", "y"]);
  });
});

describe("groupMemberIds", () => {
  it("collects members at any depth, in the page's z-order", () => {
    expect(groupMemberIds(OBJECTS, GROUPS, "outer")).toEqual(["a", "b", "c"]);
    expect(groupMemberIds(OBJECTS, GROUPS, "inner")).toEqual(["b", "c"]);
  });

  it("leaves locked members out — the select tool never picks them up either", () => {
    expect(groupMemberIds(OBJECTS, GROUPS, "inner")).not.toContain("locked");
  });
});

describe("selectionUnit", () => {
  it("selects the OUTERMOST group of a nested member at the top level", () => {
    expect(selectionUnit(OBJECTS, GROUPS, "b", null)).toEqual({
      ids: ["a", "b", "c"],
      enteredGroupId: null,
    });
  });

  it("selects an ungrouped object alone", () => {
    expect(selectionUnit(OBJECTS, GROUPS, "loose", null)).toEqual({
      ids: ["loose"],
      enteredGroupId: null,
    });
  });

  it("stops one level below the entered group — a nested subgroup selects whole", () => {
    expect(selectionUnit(OBJECTS, GROUPS, "b", "outer")).toEqual({
      ids: ["b", "c"],
      enteredGroupId: "outer",
    });
  });

  it("selects the bare object once its own group is entered", () => {
    expect(selectionUnit(OBJECTS, GROUPS, "b", "inner")).toEqual({
      ids: ["b"],
      enteredGroupId: "inner",
    });
  });

  it("leaves the context when the click lands outside it", () => {
    expect(selectionUnit(OBJECTS, GROUPS, "loose", "inner")).toEqual({
      ids: ["loose"],
      enteredGroupId: null,
    });
  });
});

describe("enteredGroup", () => {
  it("descends exactly one level per double-click, selecting what sits there", () => {
    expect(enteredGroup(OBJECTS, GROUPS, "b", null)).toEqual({
      groupId: "outer",
      ids: ["b", "c"],
    });
    expect(enteredGroup(OBJECTS, GROUPS, "b", "outer")).toEqual({ groupId: "inner", ids: ["b"] });
  });

  it("has nothing to enter at the innermost level, or on an ungrouped object", () => {
    expect(enteredGroup(OBJECTS, GROUPS, "b", "inner")).toBeNull();
    expect(enteredGroup(OBJECTS, GROUPS, "loose", null)).toBeNull();
  });
});
