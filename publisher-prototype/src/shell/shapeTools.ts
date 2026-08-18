import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import { bannerPath } from "../core/geometry/shapePaths";
import type { DrawnShapeGeometry } from "../core/gestures";
import type { CalloutTailAnchor, FlowchartSymbol } from "../core/model";
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
 * Every tool whose options describe its SHAPE now stores them — rounded
 * rect, star/polygon, callout, flowchart — so those options stay editable
 * after the shape is placed and survive a resize as themselves. The banner
 * alone still bakes, having no shape option to store.
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
      shape: "starPolygon",
      points: Math.round(optionNumber(options, "star-polygon", "points", 5)),
      innerRadiusRatio: optionNumber(options, "star-polygon", "innerRadiusRatio", 0.5),
    }),
  },
  callout: {
    creator: calloutDrawCommitted,
    geometryForBox: (options) => ({
      shape: "callout",
      tailAnchor: optionEnum(options, "callout", "tailAnchor", TAIL_ANCHORS, "bottom-left"),
    }),
  },
  // The banner has no pre-draw shape option to store; its contracted fold
  // depth is not a tool option yet, so it stays a baked path.
  banner: {
    creator: bannerDrawCommitted,
    geometryForBox: () => ({ shape: "path", d: bannerPath() }),
  },
  flowchart: {
    creator: flowchartDrawCommitted,
    geometryForBox: (options) => ({
      shape: "flowchart",
      symbol: optionEnum(options, "flowchart", "symbol", FLOWCHART_SYMBOLS, "process"),
    }),
  },
};
