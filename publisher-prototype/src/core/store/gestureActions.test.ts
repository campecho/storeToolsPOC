import { describe, expect, it } from "vitest";
import { toolRegistry } from "../registry/tools";
import {
  arrowDrawCommitted,
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  flowchartDrawCommitted,
  gestureCancelled,
  lineDrawCommitted,
  objectGroupCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectUngroupCommitted,
  rectDrawCommitted,
  roundedRectCornerRadiusCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  starPolygonInnerRadiusCommitted,
} from "./documentActions";
import { PANEL_COMMIT_ACTION_TYPES, UNDOABLE_ACTION_TYPES } from "./history";
import { penSlice } from "./penSlice";
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
  arrowDrawCommitted,
  roundedRectCornerRadiusCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  starPolygonInnerRadiusCommitted,
  calloutDrawCommitted,
  bannerDrawCommitted,
  flowchartDrawCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectGroupCommitted,
  objectUngroupCommitted,
  gestureCancelled,
];

/** Prefixes whose registry clauses are ALL wired. Each joined as its last
    clause landed: roundedRect with its parametric storage and adjust
    handle, then starPolygon (draw + inner-radius handle) and flowchart
    (draw, its only clause) with the parametric generalization.

    Still out, and each for a reason that is not parametric storage:
    callout has storage and a wired tail handle but also
    callout/textEditEnteredCommitted, which waits on the text tranche;
    banner has no contracted parameter behind its fold-depth handle.
    Their draw clauses are cross-checked through UNDOABLE_ACTION_TYPES
    below regardless. */
const WIRED_PREFIXES =
  /^(selection|object|rect|ellipse|line|arrow|roundedRect|starPolygon|flowchart)\//;

describe("gesture-clause actions", () => {
  const backedTypes = new Set<string>([
    ...Object.values(selectionSlice.actions).map((creator) => creator.type),
    ...Object.values(penSlice.actions).map((creator) => creator.type),
    ...documentActionCreators.map((creator) => creator.type),
  ]);
  const clauses = toolRegistry.flatMap((tool) =>
    tool.gestures.map((clause) => ({ tool, clause })),
  );

  it("backs every clause of a fully wired tool with an action creator of that type", () => {
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

  it("lists in UNDOABLE_ACTION_TYPES only clause-backed gestures (all per-gesture undo) or declared panel commits", () => {
    for (const type of UNDOABLE_ACTION_TYPES) {
      if (PANEL_COMMIT_ACTION_TYPES.has(type)) continue;
      const backing = clauses.filter(({ clause }) => clause.action === type);
      expect(backing.length, type).toBeGreaterThan(0);
      for (const { tool } of backing) {
        expect(tool.undo, `${tool.id} dispatches ${type}`).toBe("per-gesture");
      }
    }
  });

  it("keeps panel commits disjoint from clause-backed gestures — a type is one or the other", () => {
    expect(PANEL_COMMIT_ACTION_TYPES.size).toBeGreaterThan(0);
    for (const type of PANEL_COMMIT_ACTION_TYPES) {
      expect(UNDOABLE_ACTION_TYPES.has(type), type).toBe(true);
      expect(
        clauses.some(({ clause }) => clause.action === type),
        `${type} must not also appear as a tool gesture clause`,
      ).toBe(false);
    }
  });

  it("keeps selection actions out of the undo set — selection is app state", () => {
    for (const creator of Object.values(selectionSlice.actions)) {
      expect(UNDOABLE_ACTION_TYPES.has(creator.type)).toBe(false);
    }
    expect(UNDOABLE_ACTION_TYPES.has(gestureCancelled.type)).toBe(false);
  });
});
