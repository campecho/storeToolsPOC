import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../model";
import { objectDeleteCommitted, objectDuplicateCommitted } from "./documentActions";
import {
  documentLoadedCommitted,
  stressFixtureCleared,
  stressFixtureLoaded,
} from "./documentSlice";
import {
  selectionClearedCommitted,
  selectionCycleCommitted,
  selectionGroupEnteredCommitted,
  selectionMarqueeCommitted,
  selectionReplaceCommitted,
  selectionSlice,
  selectionToggleCommitted,
  type SelectionState,
} from "./selectionSlice";

/**
 * Selection slice contract: app state `{ ids, enteredGroupId }` in selection
 * order, backed by the registry's selection/* gesture-clause vocabulary. Every
 * clause commits a unit of ids — a group selects whole — and any document swap
 * (load or stress fixture) clears the lot.
 */

const { reducer } = selectionSlice;
const selected = (ids: string[], enteredGroupId: string | null = null): SelectionState => ({
  ids,
  enteredGroupId,
});

describe("selectionSlice", () => {
  it("starts empty, at the top level", () => {
    expect(selectionSlice.getInitialState()).toEqual({ ids: [], enteredGroupId: null });
  });

  it("replaces the selection, preserving payload order, on replaceCommitted", () => {
    const next = reducer(selected(["a"]), selectionReplaceCommitted({ ids: ["c", "b"] }));
    expect(next.ids).toEqual(["c", "b"]);
  });

  it("carries the group context the click ended in, defaulting to the top level", () => {
    const entered = reducer(
      selected(["a"]),
      selectionReplaceCommitted({ ids: ["b"], enteredGroupId: "grp-1" }),
    );
    expect(entered.enteredGroupId).toBe("grp-1");
    const left = reducer(entered, selectionReplaceCommitted({ ids: ["c"] }));
    expect(left.enteredGroupId).toBeNull();
  });

  it("clears the selection AND the group context on clearedCommitted", () => {
    const next = reducer(selected(["a", "b"], "grp-1"), selectionClearedCommitted());
    expect(next).toEqual({ ids: [], enteredGroupId: null });
  });

  it("toggles membership on toggleCommitted, appending new ids in selection order", () => {
    const added = reducer(selected(["a"]), selectionToggleCommitted({ ids: ["b"] }));
    expect(added.ids).toEqual(["a", "b"]);
    const removed = reducer(added, selectionToggleCommitted({ ids: ["a"] }));
    expect(removed.ids).toEqual(["b"]);
  });

  it("toggles a group whole: a fully selected unit leaves, a partial one joins", () => {
    const group = ["g1", "g2"];
    const added = reducer(selected(["a"]), selectionToggleCommitted({ ids: group }));
    expect(added.ids).toEqual(["a", "g1", "g2"]);
    expect(reducer(added, selectionToggleCommitted({ ids: group })).ids).toEqual(["a"]);
    // Partially present: the missing members join rather than the unit leaving.
    expect(reducer(selected(["g1"]), selectionToggleCommitted({ ids: group })).ids).toEqual([
      "g1",
      "g2",
    ]);
  });

  it("selects exactly the cycled-to unit on cycleCommitted, carrying its context", () => {
    expect(reducer(selected(["a", "b"]), selectionCycleCommitted({ ids: ["c"] }))).toEqual({
      ids: ["c"],
      enteredGroupId: null,
    });
    // Cycling out of the entered group leaves it, exactly as a plain click does.
    expect(
      reducer(selected(["a"], "grp-1"), selectionCycleCommitted({ ids: ["c"] })).enteredGroupId,
    ).toBeNull();
  });

  it("leaves the entered group standing across a marquee", () => {
    expect(
      reducer(selected(["a"], "grp-1"), selectionMarqueeCommitted({ ids: ["b"] })).enteredGroupId,
    ).toBe("grp-1");
  });

  it("replaces with the marquee hits on marqueeCommitted", () => {
    expect(reducer(selected(["z"]), selectionMarqueeCommitted({ ids: ["a", "b"] })).ids).toEqual([
      "a",
      "b",
    ]);
  });

  it("enters the group and selects the unit found inside it on groupEnteredCommitted", () => {
    const next = reducer(
      selected(["g1", "g2"]),
      selectionGroupEnteredCommitted({ groupId: "grp-1", ids: ["g1"] }),
    );
    expect(next).toEqual({ ids: ["g1"], enteredGroupId: "grp-1" });
  });

  it("selects the copies an Alt-drag drops", () => {
    const next = reducer(
      selected(["a", "b"]),
      objectDuplicateCommitted({
        pageIndex: 0,
        objects: [
          { id: "c1", type: "shape", shape: "rect", x: 0, y: 0, w: 1, h: 1, rotation: 0, locked: false, fill: null, stroke: null },
          { id: "c2", type: "shape", shape: "rect", x: 0, y: 0, w: 1, h: 1, rotation: 0, locked: false, fill: null, stroke: null },
        ],
        groups: [],
      }),
    );
    expect(next.ids).toEqual(["c1", "c2"]);
  });

  it("prunes deleted ids, and leaves the group context when nothing is left", () => {
    const partial = reducer(
      selected(["a", "b", "c"], "grp-1"),
      objectDeleteCommitted({ pageIndex: 0, ids: ["b"] }),
    );
    expect(partial).toEqual({ ids: ["a", "c"], enteredGroupId: "grp-1" });
    const emptied = reducer(partial, objectDeleteCommitted({ pageIndex: 0, ids: ["a", "c"] }));
    expect(emptied).toEqual({ ids: [], enteredGroupId: null });
  });

  it("clears when any document-swap action lands", () => {
    const actions = [
      documentLoadedCommitted(createEmptyDocument()),
      stressFixtureLoaded([]),
      stressFixtureCleared(),
    ];
    for (const action of actions) {
      expect(reducer(selected(["a", "b"], "grp-1"), action)).toEqual({
        ids: [],
        enteredGroupId: null,
      });
    }
  });
});
