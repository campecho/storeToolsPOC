import { describe, expect, it } from "vitest";
import type { Group } from "./document";
import {
  enteredGroup,
  groupAncestry,
  groupMemberIds,
  groupingUnits,
  isInGroup,
  selectedGroupId,
  selectionUnit,
  ungroupingGroupIds,
} from "./groups";
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
  rect("spare"),
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

describe("isInGroup", () => {
  it("is structural — it counts a locked member the selection helpers skip", () => {
    const locked = OBJECTS.find((o) => o.id === "locked");
    if (locked === undefined) throw new Error("fixture missing the locked object");
    expect(isInGroup(GROUPS, locked, "inner")).toBe(true);
    expect(isInGroup(GROUPS, locked, "outer")).toBe(true);
    expect(groupMemberIds(OBJECTS, GROUPS, "inner")).not.toContain("locked");
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

describe("groupingUnits", () => {
  it("splits a selection into objects joining directly and groups becoming children", () => {
    // "b" resolves to its outer group, "loose" to itself.
    expect(groupingUnits(OBJECTS, GROUPS, ["b", "loose"], null)).toEqual({
      ids: ["loose"],
      groupIds: ["outer"],
    });
  });

  it("groups plain objects with no children", () => {
    expect(groupingUnits(OBJECTS, GROUPS, ["loose", "spare"], null)).toEqual({
      ids: ["loose", "spare"],
      groupIds: [],
    });
  });

  it("is null with fewer than two units — one group re-grouped alone stays as it is", () => {
    expect(groupingUnits(OBJECTS, GROUPS, ["a", "b", "c"], null)).toBeNull();
    expect(groupingUnits(OBJECTS, GROUPS, ["loose"], null)).toBeNull();
    expect(groupingUnits(OBJECTS, GROUPS, [], null)).toBeNull();
  });

  it("resolves units inside the entered group, so a subgroup nests rather than flattens", () => {
    expect(groupingUnits(OBJECTS, GROUPS, ["b", "a"], "outer")).toEqual({
      ids: ["a"],
      groupIds: ["inner"],
    });
  });
});

describe("ungroupingGroupIds", () => {
  it("names the outermost group of the selection", () => {
    expect(ungroupingGroupIds(OBJECTS, GROUPS, ["b", "c"], null)).toEqual(["outer"]);
  });

  it("names the subgroup once its parent is entered", () => {
    expect(ungroupingGroupIds(OBJECTS, GROUPS, ["b"], "outer")).toEqual(["inner"]);
  });

  it("is empty when nothing selected is grouped at this level", () => {
    expect(ungroupingGroupIds(OBJECTS, GROUPS, ["loose"], null)).toEqual([]);
    // Inside its own group a member has no group of its own to take apart.
    expect(ungroupingGroupIds(OBJECTS, GROUPS, ["b"], "inner")).toEqual([]);
  });
});

describe("selectedGroupId", () => {
  it("names the group when the selection is exactly its membership", () => {
    expect(selectedGroupId(OBJECTS, GROUPS, ["a", "b", "c"], null)).toBe("outer");
  });

  it("is null for a partial group, an ad-hoc multi-selection, and a lone object", () => {
    expect(selectedGroupId(OBJECTS, GROUPS, ["a", "b"], null)).toBeNull();
    expect(selectedGroupId(OBJECTS, GROUPS, ["a", "b", "c", "loose"], null)).toBeNull();
    expect(selectedGroupId(OBJECTS, GROUPS, ["loose"], null)).toBeNull();
    expect(selectedGroupId(OBJECTS, GROUPS, [], null)).toBeNull();
  });

  it("counts a group whose locked member cannot be selected as fully selected", () => {
    // "inner" also holds a locked object, which no selection can ever contain.
    expect(selectedGroupId(OBJECTS, GROUPS, ["b", "c"], "outer")).toBe("inner");
  });
});
