import { describe, expect, it } from "vitest";
import { toolRegistry } from "../registry/tools";
import {
  ellipseDrawCommitted,
  gestureCancelled,
  lineDrawCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  rectDrawCommitted,
} from "./documentActions";
import { UNDOABLE_ACTION_TYPES } from "./history";
import { selectionSlice } from "./selectionSlice";

/**
 * Registry ↔ store cross-validation (the viewportSlice.test.ts pattern):
 * every wired gesture-clause action type is backed by an exported action
 * creator with exactly that string, and the undo set matches the registry's
 * per-gesture undo declarations — the contract, the action, and this test
 * share one string.
 */

const documentActionCreators = [
  rectDrawCommitted,
  ellipseDrawCommitted,
  lineDrawCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  gestureCancelled,
];

const WIRED_PREFIXES = /^(selection|object|rect|ellipse|line)\//;

describe("gesture-clause actions", () => {
  const backedTypes = new Set<string>([
    ...Object.values(selectionSlice.actions).map((creator) => creator.type),
    ...documentActionCreators.map((creator) => creator.type),
  ]);
  const clauses = toolRegistry.flatMap((tool) =>
    tool.gestures.map((clause) => ({ tool, clause })),
  );

  it("backs every selection/object/rect/ellipse/line gesture clause with an action creator of that type", () => {
    const wired = clauses.filter(({ clause }) => WIRED_PREFIXES.test(clause.action));
    expect(wired.length).toBeGreaterThan(0);
    const missing = wired
      .filter(({ clause }) => !backedTypes.has(clause.action))
      .map(({ clause }) => `${clause.id} → ${clause.action}`);
    expect(missing).toEqual([]);
  });

  it("backs the registry's gesture/cancelled clauses with the no-op record creator", () => {
    const cancelled = clauses.filter(({ clause }) => clause.action === gestureCancelled.type);
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it("lists in UNDOABLE_ACTION_TYPES only actions whose registry clauses all declare per-gesture undo", () => {
    for (const type of UNDOABLE_ACTION_TYPES) {
      const backing = clauses.filter(({ clause }) => clause.action === type);
      expect(backing.length, type).toBeGreaterThan(0);
      for (const { tool } of backing) {
        expect(tool.undo, `${tool.id} dispatches ${type}`).toBe("per-gesture");
      }
    }
  });

  it("keeps selection actions out of the undo set — selection is app state", () => {
    for (const creator of Object.values(selectionSlice.actions)) {
      expect(UNDOABLE_ACTION_TYPES.has(creator.type)).toBe(false);
    }
    expect(UNDOABLE_ACTION_TYPES.has(gestureCancelled.type)).toBe(false);
  });
});
