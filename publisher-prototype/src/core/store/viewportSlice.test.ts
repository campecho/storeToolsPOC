import { describe, expect, it } from "vitest";
import { globalKeyClauses } from "../registry/globalKeys";
import { toolRegistry } from "../registry/tools";
import type { Viewport } from "../geometry/viewport";
import {
  panCommitted,
  viewportSlice,
  zoomFitCommitted,
  zoomSetCommitted,
  zoomStepCommitted,
  zoomWheelCommitted,
} from "./viewportSlice";

/**
 * Viewport slice contract: committed actions replace state wholesale with a
 * re-clamped zoom, pan commits touch pan only, and the action types ARE the
 * registry's viewport/* gesture-clause vocabulary — one string shared by the
 * contract, the reducer, and this test.
 */

describe("viewportSlice", () => {
  const prior: Viewport = { zoom: 2, pan: { x: 10, y: -5 } };
  const zoomActionCreators = [
    zoomStepCommitted,
    zoomWheelCommitted,
    zoomFitCommitted,
    zoomSetCommitted,
  ];

  it("starts at zoom 1 with pan {0,0}", () => {
    expect(viewportSlice.getInitialState()).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
    expect(viewportSlice.reducer(undefined, { type: "@@INIT" })).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
  });

  it("replaces the whole viewport on every zoom commit", () => {
    for (const create of zoomActionCreators) {
      const next = viewportSlice.reducer(prior, create({ zoom: 1.5, pan: { x: -30, y: 40 } }));
      expect(next).toEqual({ zoom: 1.5, pan: { x: -30, y: 40 } });
    }
  });

  it("clamps zoom to the working range on every zoom commit", () => {
    for (const create of zoomActionCreators) {
      const high = viewportSlice.reducer(prior, create({ zoom: 99, pan: { x: 1, y: 2 } }));
      expect(high).toEqual({ zoom: 4, pan: { x: 1, y: 2 } });
      const low = viewportSlice.reducer(prior, create({ zoom: 0.001, pan: { x: 0, y: 0 } }));
      expect(low).toEqual({ zoom: 0.1, pan: { x: 0, y: 0 } });
    }
  });

  it("replaces pan only, leaving zoom untouched, on panCommitted", () => {
    const next = viewportSlice.reducer(prior, panCommitted({ pan: { x: -300, y: 7.5 } }));
    expect(next.zoom).toBe(2);
    expect(next.pan).toEqual({ x: -300, y: 7.5 });
  });

  it("backs every viewport/* gesture clause in the registry with an action creator of that type", () => {
    const actionTypes = new Set<string>(
      Object.values(viewportSlice.actions).map((creator) => creator.type),
    );
    const viewportClauses = [...toolRegistry.flatMap((tool) => tool.gestures), ...globalKeyClauses]
      .filter((clause) => clause.action.startsWith("viewport/"));
    expect(viewportClauses.length).toBeGreaterThan(0);
    for (const clause of viewportClauses) {
      expect(actionTypes.has(clause.action)).toBe(true);
    }
  });
});
