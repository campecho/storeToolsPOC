import type { ToolContract, ToolGroup } from "./types";
import { navigationTools, panTool, zoomTool } from "./tools/navigation";
import { selectionTools } from "./tools/selection";
import { contentTools } from "./tools/content";
import { shapeTools } from "./tools/shapes";
import { styleTools } from "./tools/style";
import { layoutAidTools } from "./tools/layoutAids";
import { dataTools } from "./tools/data";
import { photoTools } from "./tools/photo";

/**
 * The tool registry (PLAN.md §4): every dock tool's contract, assembled from
 * one file per group. Order here is dock order — groups in the §4.1 sequence,
 * navigation last, photo-mode tools after the layout set.
 */
export const toolRegistry: readonly ToolContract[] = [
  ...selectionTools,
  ...contentTools,
  ...shapeTools,
  ...styleTools,
  ...layoutAidTools,
  ...dataTools,
  ...navigationTools,
  ...photoTools,
];

/** Dock rendering order for tool groups (PLAN.md §4.1 table order). */
export const TOOL_GROUP_ORDER: readonly ToolGroup[] = [
  "selection",
  "content",
  "shapes",
  "style",
  "layout-aids",
  "data",
  "navigation",
  "photo",
];

export { zoomTool, panTool };
