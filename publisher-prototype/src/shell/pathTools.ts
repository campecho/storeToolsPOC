import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import {
  bannerPath,
  calloutPath,
  flowchartPath,
  roundedRectPath,
  starPath,
  type CalloutTailAnchor,
  type FlowchartSymbol,
} from "../core/geometry/shapePaths";
import type { PathSeg } from "../core/model";
import {
  bannerDrawCommitted,
  calloutDrawCommitted,
  flowchartDrawCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  type DrawCommit,
} from "../core/store";
import { optionEnum, optionNumber, type ToolOptionValues } from "./toolOptions";

/**
 * Path-shape tool wiring (PLAN.md §4.1 #8–17, Shapes Phase B group): per
 * tool, the clause action its draw dispatches and how the live options bake
 * into the normalized path for a drawn box. Baking happens at draw time —
 * the parametric inputs are not stored on the object (the SEAMS.md deferral;
 * the adjust-handle clauses stay unwired until parametric storage lands).
 */

type Box = { x: number; y: number; w: number; h: number };

export type PathToolConfig = {
  creator: ActionCreatorWithPayload<DrawCommit>;
  pathForBox: (options: ToolOptionValues, box: Box) => PathSeg[];
};

const TAIL_ANCHORS: readonly CalloutTailAnchor[] = [
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right",
];

const FLOWCHART_SYMBOLS: readonly FlowchartSymbol[] = [
  "process",
  "decision",
  "terminator",
  "data",
  "document",
];

/** Inch radius → normalized per-axis radius. A zero extent (the degenerate
    mid-drag preview) normalizes to 0 rather than dividing by zero. */
function normalizedRadius(radiusIn: number, extentIn: number): number {
  if (extentIn <= 0) return 0;
  return Math.min(0.5, Math.max(0, radiusIn / extentIn));
}

export const PATH_TOOL_CONFIGS: Readonly<Record<string, PathToolConfig>> = {
  "rounded-rect": {
    creator: roundedRectDrawCommitted,
    pathForBox: (options, box) => {
      const radius = optionNumber(options, "rounded-rect", "cornerRadius", 0.1);
      return roundedRectPath(normalizedRadius(radius, box.w), normalizedRadius(radius, box.h));
    },
  },
  "star-polygon": {
    creator: starPolygonDrawCommitted,
    pathForBox: (options) =>
      starPath(
        Math.round(optionNumber(options, "star-polygon", "points", 5)),
        optionNumber(options, "star-polygon", "innerRadiusRatio", 0.5),
      ),
  },
  callout: {
    creator: calloutDrawCommitted,
    pathForBox: (options) =>
      calloutPath(optionEnum(options, "callout", "tailAnchor", TAIL_ANCHORS, "bottom-left")),
  },
  banner: {
    creator: bannerDrawCommitted,
    pathForBox: () => bannerPath(),
  },
  flowchart: {
    creator: flowchartDrawCommitted,
    pathForBox: (options) =>
      flowchartPath(optionEnum(options, "flowchart", "symbol", FLOWCHART_SYMBOLS, "process")),
  },
};
