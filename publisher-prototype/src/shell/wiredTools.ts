/**
 * Tools whose canvas behavior is implemented (PLAN.md §7 Phase A posture:
 * every tool visible with its contract, nothing drawing yet). The registry's
 * tier stays pure specification; the shell derives "not wired yet" from this
 * set, which grows as Phase B groups land.
 */
export const WIRED_TOOLS: ReadonlySet<string> = new Set([
  "zoom",
  "pan",
  "select",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "rounded-rect",
  "star-polygon",
  "callout",
  "banner",
  "flowchart",
  "pen",
]);

/**
 * Panels whose controls are live (PLAN.md §7 Phase B fan-out). The registry
 * tier stays pure specification — a LIVE-tier panel outside this set renders
 * its spec card with a "not wired yet" chip, exactly like an unwired tool.
 */
export const WIRED_PANELS: ReadonlySet<string> = new Set([
  "transform",
  "color-swatches",
  "align-distribute",
  "document-setup",
]);

/**
 * Option ids the wired implementation actually consumes, per tool. Options
 * a wired tool declares but nothing reads yet (select's showCoordinates and
 * positionRelativeTo) stay rendered but disabled: the options bar is an
 * honest surface, editable exactly where editing has an effect.
 */
export const CONSUMED_OPTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["select", new Set(["nudgeIncrement"])],
  ["rect", new Set(["fill", "stroke", "strokeWidth"])],
  ["ellipse", new Set(["fill", "stroke", "strokeWidth"])],
  ["line", new Set(["stroke", "strokeWidth", "dash"])],
  ["arrow", new Set(["stroke", "strokeWidth", "dash", "headStart", "headEnd", "headSize"])],
  ["rounded-rect", new Set(["fill", "stroke", "strokeWidth", "cornerRadius"])],
  ["star-polygon", new Set(["points", "innerRadiusRatio", "fill", "stroke", "strokeWidth"])],
  ["callout", new Set(["fill", "stroke", "strokeWidth", "tailAnchor"])],
  ["banner", new Set(["fill", "stroke", "strokeWidth"])],
  ["flowchart", new Set(["symbol", "fill", "stroke", "strokeWidth"])],
  ["pen", new Set(["fill", "stroke", "strokeWidth", "autoClose"])],
]);
