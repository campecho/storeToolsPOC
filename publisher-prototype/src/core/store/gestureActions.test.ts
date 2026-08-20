import { describe, expect, it } from "vitest";
import { globalKeyClauses } from "../registry/globalKeys";
import { toolRegistry } from "../registry/tools";
import {
  arrowDrawCommitted,
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  gestureCancelled,
  lineDrawCommitted,
  objectDeleteCommitted,
  objectDuplicateCommitted,
  objectGroupCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectPasteCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectUngroupCommitted,
  rectDrawCommitted,
  bannerPanelHeightCommitted,
  bannerPanelInsetCommitted,
  roundedRectCornerRadiusCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  starPolygonInnerRadiusCommitted,
} from "./documentActions";
import { clipboardSlice } from "./clipboardSlice";
import { PANEL_COMMIT_ACTION_TYPES, UNDOABLE_ACTION_TYPES, redoCommitted, undoCommitted } from "./history";
import { penSlice } from "./penSlice";
import { selectionSlice } from "./selectionSlice";
import { viewportSlice } from "./viewportSlice";

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
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectGroupCommitted,
  objectUngroupCommitted,
  objectDeleteCommitted,
  objectDuplicateCommitted,
  objectPasteCommitted,
  bannerPanelInsetCommitted,
  bannerPanelHeightCommitted,
  gestureCancelled,
];

/** Prefixes whose registry clauses are ALL wired. Each joined as its last
    clause landed: roundedRect with its parametric storage and adjust
    handle, then starPolygon (draw + inner-radius handle) with the
    parametric generalization.

    Banner joined when the review named its two adjustments, closing the
    last parametric deferral.

    Still out, and not for want of parametric storage: callout has storage
    and a wired tail handle but also callout/textEditEnteredCommitted, which
    waits on the text tranche. Its draw clause is cross-checked through
    UNDOABLE_ACTION_TYPES below regardless. */
const WIRED_PREFIXES =
  /^(selection|object|rect|ellipse|line|arrow|roundedRect|starPolygon|banner)\//;

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

  it("lists in UNDOABLE_ACTION_TYPES only clause-backed commits — tool gestures (all per-gesture undo), global chords, or declared panel commits", () => {
    for (const type of UNDOABLE_ACTION_TYPES) {
      if (PANEL_COMMIT_ACTION_TYPES.has(type)) continue;
      const backing = clauses.filter(({ clause }) => clause.action === type);
      // A global chord backs a type just as a tool clause does; it simply has
      // no tool whose undo granularity to check (registry/globalKeys.ts).
      const global = globalKeyClauses.filter((clause) => clause.action === type);
      expect(backing.length + global.length, type).toBeGreaterThan(0);
      for (const { tool } of backing) {
        expect(tool.undo, `${tool.id} dispatches ${type}`).toBe("per-gesture");
      }
    }
  });

  it("backs every global chord with an action creator of that type", () => {
    const chordBackedTypes = new Set<string>([
      ...backedTypes,
      undoCommitted.type,
      redoCommitted.type,
      ...Object.values(clipboardSlice.actions).map((creator) => creator.type),
      ...Object.values(viewportSlice.actions).map((creator) => creator.type),
    ]);
    expect(globalKeyClauses.length).toBeGreaterThan(0);
    const missing = globalKeyClauses
      .filter((clause) => !chordBackedTypes.has(clause.action))
      .map((clause) => `${clause.id} → ${clause.action}`);
    expect(missing).toEqual([]);
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
