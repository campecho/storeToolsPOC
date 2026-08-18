import { describe, expect, it } from "vitest";
import { toolRegistry } from "../registry/tools";
import {
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  flowchartDrawCommitted,
  gestureCancelled,
  lineDrawCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  rectDrawCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
} from "./documentActions";
import { PANEL_COMMIT_ACTION_TYPES, UNDOABLE_ACTION_TYPES } from "./history";
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
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  calloutDrawCommitted,
  bannerDrawCommitted,
  flowchartDrawCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  gestureCancelled,
];

/** Prefixes whose registry clauses are ALL wired. The path-shape tools
    (roundedRect, starPolygon, callout, banner, flowchart) stay out until
    their adjust-handle clauses land — those need the parametric shape
    storage SEAMS.md records as deferred; only their draw clauses are wired
    (and cross-checked through UNDOABLE_ACTION_TYPES below). */
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
