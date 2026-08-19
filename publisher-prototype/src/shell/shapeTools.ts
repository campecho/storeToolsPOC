import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import { BANNER_DEFAULT_HEIGHT, BANNER_DEFAULT_INSET } from "../core/geometry/shapePaths";
import type { DrawnShapeGeometry } from "../core/gestures";
import { tailTipFor, type CalloutTailAnchor, type FlowchartSymbol } from "../core/model";
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
      tailTip: tailTipFor(optionEnum(options, "callout", "tailAnchor", TAIL_ANCHORS, "bottom-left")),
    }),
  },
  banner: {
    creator: bannerDrawCommitted,
    geometryForBox: (options) => ({
      shape: "banner",
      panelInset: optionNumber(options, "banner", "panelInset", BANNER_DEFAULT_INSET),
      panelHeight: optionNumber(options, "banner", "panelHeight", BANNER_DEFAULT_HEIGHT),
    }),
  },
  flowchart: {
    creator: flowchartDrawCommitted,
    geometryForBox: (options) => ({
      shape: "flowchart",
      symbol: optionEnum(options, "flowchart", "symbol", FLOWCHART_SYMBOLS, "process"),
    }),
  },
};
