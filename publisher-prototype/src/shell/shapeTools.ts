import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import {
  bannerPath,
  calloutPath,
  flowchartPath,
  starPath,
  type CalloutTailAnchor,
  type FlowchartSymbol,
} from "../core/geometry/shapePaths";
import type { DrawnShapeGeometry } from "../core/gestures";
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
 * Parametric shape-tool wiring (PLAN.md §4.1 #8–17, Shapes Phase B group):
 * per tool, the clause action its draw dispatches and the shape kind plus
 * geometry the live options produce for a drawn box.
 *
 * The rounded rect STORES its corner radius (the SEAMS.md deferral, now
 * landed), so its adjust-handle clause is wired and the radius survives a
 * resize as a radius. The rest still bake their options into a normalized
 * path at draw time and keep their adjust-handle clauses unwired until they
 * get parametric storage of their own.
 */

type Box = { x: number; y: number; w: number; h: number };

export type ShapeToolConfig = {
  creator: ActionCreatorWithPayload<DrawCommit>;
  geometryForBox: (options: ToolOptionValues, box: Box) => DrawnShapeGeometry;
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

export const SHAPE_TOOL_CONFIGS: Readonly<Record<string, ShapeToolConfig>> = {
  "rounded-rect": {
    creator: roundedRectDrawCommitted,
    geometryForBox: (options) => ({
      shape: "roundedRect",
      cornerRadius: optionNumber(options, "rounded-rect", "cornerRadius", 0.1),
    }),
  },
  "star-polygon": {
    creator: starPolygonDrawCommitted,
    geometryForBox: (options) => ({
      shape: "path",
      d: starPath(
        Math.round(optionNumber(options, "star-polygon", "points", 5)),
        optionNumber(options, "star-polygon", "innerRadiusRatio", 0.5),
      ),
    }),
  },
  callout: {
    creator: calloutDrawCommitted,
    geometryForBox: (options) => ({
      shape: "path",
      d: calloutPath(optionEnum(options, "callout", "tailAnchor", TAIL_ANCHORS, "bottom-left")),
    }),
  },
  banner: {
    creator: bannerDrawCommitted,
    geometryForBox: () => ({ shape: "path", d: bannerPath() }),
  },
  flowchart: {
    creator: flowchartDrawCommitted,
    geometryForBox: (options) => ({
      shape: "path",
      d: flowchartPath(optionEnum(options, "flowchart", "symbol", FLOWCHART_SYMBOLS, "process")),
    }),
  },
};
