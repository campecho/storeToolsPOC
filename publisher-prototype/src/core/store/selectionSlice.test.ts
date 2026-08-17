import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../model";
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
 * Selection slice contract: app state `{ ids }` in selection order, backed
 * by the registry's selection/* gesture-clause vocabulary; any document
 * swap (load or stress fixture) clears it wholesale.
 */

const { reducer } = selectionSlice;
const selected = (ids: string[]): SelectionState => ({ ids });

describe("selectionSlice", () => {
  it("starts empty", () => {
    expect(selectionSlice.getInitialState()).toEqual({ ids: [] });
  });

  it("replaces the selection, preserving payload order, on replaceCommitted", () => {
    const next = reducer(selected(["a"]), selectionReplaceCommitted({ ids: ["c", "b"] }));
    expect(next.ids).toEqual(["c", "b"]);
  });

  it("clears on clearedCommitted", () => {
    expect(reducer(selected(["a", "b"]), selectionClearedCommitted()).ids).toEqual([]);
  });

  it("toggles membership on toggleCommitted, appending new ids in selection order", () => {
    const added = reducer(selected(["a"]), selectionToggleCommitted({ id: "b" }));
    expect(added.ids).toEqual(["a", "b"]);
    const removed = reducer(added, selectionToggleCommitted({ id: "a" }));
    expect(removed.ids).toEqual(["b"]);
  });

  it("selects exactly the cycled-to object on cycleCommitted", () => {
    expect(reducer(selected(["a", "b"]), selectionCycleCommitted({ id: "c" })).ids).toEqual(["c"]);
  });

  it("replaces with the marquee hits on marqueeCommitted", () => {
    expect(reducer(selected(["z"]), selectionMarqueeCommitted({ ids: ["a", "b"] })).ids).toEqual([
      "a",
      "b",
    ]);
  });

  it("selects the entered member on groupEnteredCommitted", () => {
    const next = reducer(
      selected(["g"]),
      selectionGroupEnteredCommitted({ groupId: "grp-1", id: "a" }),
    );
    expect(next.ids).toEqual(["a"]);
  });

  it("clears when any document-swap action lands", () => {
    const actions = [
      documentLoadedCommitted(createEmptyDocument()),
      stressFixtureLoaded([]),
      stressFixtureCleared(),
    ];
    for (const action of actions) {
      expect(reducer(selected(["a", "b"]), action).ids).toEqual([]);
    }
  });
});
