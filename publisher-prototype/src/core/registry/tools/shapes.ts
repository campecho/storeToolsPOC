import type { ToolContract } from "../types";

/**
 * Shape tools (PLAN.md §4.1 #8–17). Contracts only — canvas behavior
 * arrives with the Shapes Phase B group.
 *
 * Every drawing tool spells its full gesture set even where tools repeat the
 * shared draw pattern: the registry is reviewable data, and repetition is
 * intended so each tool's contract reads standalone.
 */

export const rectTool: ToolContract = {
  id: "rect",
  label: "Rectangle",
  mode: "layout",
  group: "shapes",
  shortcut: "R",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "rect.drag.creates",
      trigger: "drag",
      behavior:
        "Creates a rectangle of the dragged bounds (§4.4 rectangles); preview renders in the overlay, one action commits on release.",
      action: "rect/drawCommitted",
    },
    {
      id: "rect.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn rectangle to a square.",
      action: "rect/drawCommitted",
    },
    {
      id: "rect.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the rectangle from the center outward instead of corner to corner.",
      action: "rect/drawCommitted",
    },
    {
      id: "rect.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in rectangle at the click point.",
      action: "rect/drawCommitted",
    },
    {
      id: "rect.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
  ],
  panels: ["transform", "color-swatches", "effects", "align-distribute"],
  undo: "per-gesture",
  notes: [
    "'Shapes should remain editable vector objects.' (§4.4) — drawn rectangles are paths the node-select tool can edit.",
    "Unfilled interior passes through: a click inside an unfilled rectangle does not select it, only the stroke hits within tolerance (PLAN.md §5 — doc silent).",
    "Flat fill and stroke live here; the §4.4 gradients and pattern fills belong to the fill/gradient tool's contract.",
    "ASSUMPTION: Shift-square, Alt-from-center, click-for-default-size (1×1 in), and Esc-cancel are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
    "ASSUMPTION: fill default #4472c4 (theme-accent stand-in) and stroke default #000000 — the doc names no default colors.",
    "ASSUMPTION: 4px stroke tolerance and 0.75pt default stroke width are working guesses for SME review.",
  ],
};

export const roundedRectTool: ToolContract = {
  id: "rounded-rect",
  label: "Rounded rectangle",
  mode: "layout",
  group: "shapes",
  shortcut: "U",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "rounded-rect.drag.creates",
      trigger: "drag",
      behavior:
        "Creates a rounded rectangle of the dragged bounds (§4.4 rounded rectangles); preview renders in the overlay, one action commits on release.",
      action: "roundedRect/drawCommitted",
    },
    {
      id: "rounded-rect.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn rounded rectangle to a square.",
      action: "roundedRect/drawCommitted",
    },
    {
      id: "rounded-rect.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the rounded rectangle from the center outward instead of corner to corner.",
      action: "roundedRect/drawCommitted",
    },
    {
      id: "rounded-rect.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in rounded rectangle at the click point.",
      action: "roundedRect/drawCommitted",
    },
    {
      id: "rounded-rect.drag-adjust-handle.sets-corner-radius",
      trigger: "drag on corner-radius adjust handle",
      behavior:
        "Changes the corner radius of the placed shape; preview in overlay, one commit on release.",
      action: "roundedRect/cornerRadiusCommitted",
    },
    {
      id: "rounded-rect.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
    {
      kind: "number",
      id: "cornerRadius",
      label: "Corner radius",
      default: 0.1,
      min: 0,
      max: 2,
      step: 0.05,
      unit: "in",
    },
  ],
  panels: ["transform", "color-swatches", "effects", "align-distribute"],
  undo: "per-gesture",
  notes: [
    "'Rounded rectangles.' (§4.4) is the whole doc coverage; the gesture set mirrors rect.",
    "ASSUMPTION: Shift-square, Alt-from-center, click-for-default-size, and Esc-cancel are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
    "ASSUMPTION: the corner-radius adjust handle is Publisher's yellow-diamond adjust handle; it is an overlay target.",
    "ASSUMPTION: cornerRadius max of 2in is a static stand-in for the digest's geometric bound (half the shorter side) — runtime clamps to that bound.",
    "ASSUMPTION: fill default #4472c4 and stroke default #000000 — the doc names no default colors.",
  ],
};

export const ellipseTool: ToolContract = {
  id: "ellipse",
  label: "Ellipse",
  mode: "layout",
  group: "shapes",
  shortcut: "E",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "ellipse.drag.creates",
      trigger: "drag",
      behavior:
        "Creates an ellipse inscribed in the dragged bounds (§4.4 circles and ovals); preview renders in the overlay, one action commits on release.",
      action: "ellipse/drawCommitted",
    },
    {
      id: "ellipse.shift-drag.constrains-circle",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn ellipse to a circle.",
      action: "ellipse/drawCommitted",
    },
    {
      id: "ellipse.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the ellipse from the center outward instead of corner to corner.",
      action: "ellipse/drawCommitted",
    },
    {
      id: "ellipse.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in ellipse at the click point.",
      action: "ellipse/drawCommitted",
    },
    {
      id: "ellipse.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
  ],
  panels: ["transform", "color-swatches", "effects", "align-distribute"],
  undo: "per-gesture",
  notes: [
    "'Circles and ovals.' (§4.4).",
    "ASSUMPTION: hit testing runs against the ellipse geometry, not the bounding box — corners of the bounds outside the curve must not hit; unfilled interior passes through.",
    "ASSUMPTION: Shift-circle, Alt-from-center, click-for-default-size, and Esc-cancel are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
    "ASSUMPTION: fill default #4472c4 and stroke default #000000 — the doc names no default colors.",
  ],
};

export const lineTool: ToolContract = {
  id: "line",
  label: "Line",
  mode: "layout",
  group: "shapes",
  shortcut: "L",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "line",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "line.drag.creates",
      trigger: "drag",
      behavior:
        "Draws a straight line from the press point to the release point (§4.4 lines); preview renders in the overlay, one action commits on release.",
      action: "line/drawCommitted",
    },
    {
      id: "line.shift-drag.constrains-angle",
      trigger: "drag + Shift",
      behavior: "Constrains the line angle to 0/45/90 degrees.",
      action: "line/drawCommitted",
    },
    {
      id: "line.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0.25,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
    {
      kind: "enum",
      id: "dash",
      label: "Dash",
      default: "solid",
      values: ["solid", "dashed", "dotted"],
    },
  ],
  panels: ["transform", "color-swatches", "effects"],
  undo: "per-gesture",
  notes: [
    "'Lines.' (§4.4). A line has no fill and no interior — only the stroke hits, within tolerance.",
    "Hairline click tolerance is the canonical PLAN.md §5 hitTest case: 4px screen-space tolerance around the stroke, independent of zoom.",
    "No Alt-from-center and no click-for-default-size — the digest defines neither for lines.",
    "ASSUMPTION: the 0/45/90° Shift constraint, Esc-cancel, dash values (solid|dashed|dotted), 4px tolerance, and 0.75pt default stroke width are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
    "ASSUMPTION: stroke default #000000 — the doc names no default colors.",
  ],
};

export const arrowTool: ToolContract = {
  id: "arrow",
  label: "Arrow",
  mode: "layout",
  group: "shapes",
  shortcut: "W",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "line",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "arrow.drag.creates",
      trigger: "drag",
      behavior:
        "Draws an arrowed line from the press point to the release point (§4.4 arrows); preview renders in the overlay, one action commits on release.",
      action: "arrow/drawCommitted",
    },
    {
      id: "arrow.shift-drag.constrains-angle",
      trigger: "drag + Shift",
      behavior: "Constrains the arrow angle to 0/45/90 degrees.",
      action: "arrow/drawCommitted",
    },
    {
      id: "arrow.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0.25,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
    {
      kind: "enum",
      id: "dash",
      label: "Dash",
      default: "solid",
      values: ["solid", "dashed", "dotted"],
    },
    {
      kind: "enum",
      id: "headStart",
      label: "Start head",
      default: "none",
      values: ["none", "arrow", "circle", "diamond"],
    },
    {
      kind: "enum",
      id: "headEnd",
      label: "End head",
      default: "arrow",
      values: ["none", "arrow", "circle", "diamond"],
    },
    {
      kind: "enum",
      id: "headSize",
      label: "Head size",
      default: "m",
      values: ["s", "m", "l"],
    },
  ],
  panels: ["transform", "color-swatches", "effects"],
  undo: "per-gesture",
  notes: [
    "'Arrows.' (§4.4). Hit testing follows line: no interior, stroke-only within tolerance — the hairline tolerance is the canonical PLAN.md §5 case.",
    "No Alt-from-center and no click-for-default-size — the digest defines neither for arrows.",
    "ASSUMPTION: the entire arrowhead option set (headStart none, headEnd arrow, s|m|l sizes, and the head-shape values beyond 'arrow') is Publisher-parity filler — the digest's list is open-ended.",
    "ASSUMPTION: the 0/45/90° Shift constraint, Esc-cancel, dash values, and stroke default #000000 are working guesses for SME review, as on line.",
  ],
};

export const starPolygonTool: ToolContract = {
  id: "star-polygon",
  label: "Star / polygon",
  mode: "layout",
  group: "shapes",
  shortcut: "S",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "star-polygon.drag.creates",
      trigger: "drag",
      behavior:
        "Creates a star or regular polygon inscribed in the dragged bounds (§4.4 stars); preview renders in the overlay, one action commits on release.",
      action: "starPolygon/drawCommitted",
    },
    {
      id: "star-polygon.shift-drag.constrains-regular",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn shape to regular proportions (equal width and height).",
      action: "starPolygon/drawCommitted",
    },
    {
      id: "star-polygon.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the star or polygon from the center outward instead of corner to corner.",
      action: "starPolygon/drawCommitted",
    },
    {
      id: "star-polygon.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in star or polygon at the click point.",
      action: "starPolygon/drawCommitted",
    },
    {
      id: "star-polygon.drag-adjust-handle.sets-inner-radius",
      trigger: "drag on inner-radius adjust handle",
      behavior:
        "Changes the inner radius (point depth) of the placed star; preview in overlay, one commit on release.",
      action: "starPolygon/innerRadiusCommitted",
    },
    {
      id: "star-polygon.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "number",
      id: "points",
      label: "Points",
      default: 5,
      min: 3,
      max: 24,
      step: 1,
    },
    {
      kind: "number",
      id: "innerRadiusRatio",
      label: "Inner radius",
      default: 0.5,
      min: 0.1,
      max: 0.9,
      step: 0.05,
    },
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
  ],
  panels: ["transform", "color-swatches", "effects", "align-distribute"],
  undo: "per-gesture",
  notes: [
    "'Stars.' (§4.4).",
    "ASSUMPTION: hit testing runs against the star path, not the bounding box — the concave gaps between points must not hit; unfilled interior passes through.",
    "ASSUMPTION: Shift-regular, Alt-from-center, click-for-default-size, Esc-cancel, and the inner-radius adjust handle are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
    "ASSUMPTION: 5 points and 0.5 inner-radius ratio defaults, plus fill #4472c4 and stroke #000000, are working guesses for SME review.",
  ],
};

export const calloutTool: ToolContract = {
  id: "callout",
  label: "Callout",
  mode: "layout",
  group: "shapes",
  shortcut: "O",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "callout.drag.creates",
      trigger: "drag",
      behavior:
        "Creates a callout shape with a pointer tail in the dragged bounds (§4.4 callouts); preview renders in the overlay, one action commits on release.",
      action: "callout/drawCommitted",
    },
    {
      id: "callout.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn callout body to a square.",
      action: "callout/drawCommitted",
    },
    {
      id: "callout.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the callout from the center outward instead of corner to corner.",
      action: "callout/drawCommitted",
    },
    {
      id: "callout.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in callout at the click point.",
      action: "callout/drawCommitted",
    },
    {
      id: "callout.drag-tail-handle.repositions-tail",
      trigger: "drag on tail adjust handle",
      behavior:
        "Repositions the pointer tail of the placed callout; preview in overlay, one commit on release.",
      action: "callout/tailCommitted",
    },
    {
      id: "callout.double-click.enters-text-edit",
      trigger: "double-click on placed callout",
      behavior: "Enters text editing inside the callout.",
      action: "callout/textEditEnteredCommitted",
    },
    {
      id: "callout.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
    {
      kind: "enum",
      id: "tailAnchor",
      label: "Tail anchor",
      default: "bottom-left",
      values: ["bottom-left", "bottom-right", "top-left", "top-right"],
    },
  ],
  panels: ["transform", "color-swatches", "effects", "character", "paragraph"],
  undo: "per-gesture",
  notes: [
    "'Callouts.' (§4.4) · 'Use shapes for backgrounds, dividers, badges, callouts, and signage.' (§4.4).",
    "ASSUMPTION: the callout accepts text — Publisher parity; the doc lists only the shape.",
    "ASSUMPTION: the tail counts as part of the path for hit testing, and the tail adjust handle is an overlay target.",
    "ASSUMPTION: the digest's free tail-anchor point is simplified to preset anchor positions in the options bar; free repositioning happens through the tail adjust handle.",
    "ASSUMPTION: Shift-square, Alt-from-center, click-for-default-size, Esc-cancel, double-click-to-edit-text, fill #4472c4, and stroke #000000 are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
  ],
};

export const bannerTool: ToolContract = {
  id: "banner",
  label: "Banner",
  mode: "layout",
  group: "shapes",
  shortcut: "N",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "banner.drag.creates",
      trigger: "drag",
      behavior:
        "Creates a ribbon/banner shape in the dragged bounds (§4.4 banners); preview renders in the overlay, one action commits on release.",
      action: "banner/drawCommitted",
    },
    {
      id: "banner.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn banner bounds to a square.",
      action: "banner/drawCommitted",
    },
    {
      id: "banner.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the banner from the center outward instead of corner to corner.",
      action: "banner/drawCommitted",
    },
    {
      id: "banner.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in banner at the click point.",
      action: "banner/drawCommitted",
    },
    {
      id: "banner.drag-adjust-handle.sets-fold-depth",
      trigger: "drag on fold adjust handle",
      behavior:
        "Varies the ribbon fold depth of the placed banner; preview in overlay, one commit on release.",
      action: "banner/foldDepthCommitted",
    },
    {
      id: "banner.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
  ],
  panels: ["transform", "color-swatches", "effects"],
  undo: "per-gesture",
  notes: [
    "'Banners.' (§4.4). The doc is silent on the banner's adjust parameters — the fold-depth handle carries no dedicated option until SME review names one.",
    "ASSUMPTION: hit testing is path-accurate as on star-polygon — concavities in the ribbon must not hit; unfilled interior passes through.",
    "ASSUMPTION: Shift-square, Alt-from-center, click-for-default-size, Esc-cancel, and the fold-depth adjust handle are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
    "ASSUMPTION: fill default #4472c4 and stroke default #000000 — the doc names no default colors.",
  ],
};

export const flowchartTool: ToolContract = {
  id: "flowchart",
  label: "Flowchart",
  mode: "layout",
  group: "shapes",
  shortcut: "F",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "flowchart.drag.creates",
      trigger: "drag",
      behavior:
        "Creates the selected flowchart symbol in the dragged bounds (§4.4 flowchart shapes); preview renders in the overlay, one action commits on release.",
      action: "flowchart/drawCommitted",
    },
    {
      id: "flowchart.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the drawn symbol bounds to a square.",
      action: "flowchart/drawCommitted",
    },
    {
      id: "flowchart.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the symbol from the center outward instead of corner to corner.",
      action: "flowchart/drawCommitted",
    },
    {
      id: "flowchart.click.creates-default-size",
      trigger: "click (no drag)",
      behavior: "Creates a default 1×1 in flowchart symbol at the click point.",
      action: "flowchart/drawCommitted",
    },
    {
      id: "flowchart.esc.cancels-draw",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight draw; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "symbol",
      label: "Symbol",
      default: "process",
      values: ["process", "decision", "terminator", "data", "document"],
    },
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
  ],
  panels: ["transform", "color-swatches", "effects", "align-distribute"],
  undo: "per-gesture",
  notes: [
    "'Flowchart shapes.' (§4.4) · 'Create simple diagrams and design accents without external illustration tools.' (§4.4).",
    "ASSUMPTION: the symbol is chosen in the options bar before drawing; the digest's open-ended symbol list is pinned to process|decision|terminator|data|document pending SME review.",
    "ASSUMPTION: hit testing follows each symbol's geometry (rect-like or ellipse-like per symbol); unfilled interior passes through.",
    "ASSUMPTION: Shift-square, Alt-from-center, click-for-default-size, Esc-cancel, fill #4472c4, and stroke #000000 are Publisher-parity fillers — §4.4 lists the shape, not the bindings.",
  ],
};

export const penTool: ToolContract = {
  id: "pen",
  label: "Pen / freeform",
  mode: "layout",
  group: "shapes",
  shortcut: "G",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "shape",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "pen.click.adds-anchor",
      trigger: "click",
      behavior: "Adds a straight-segment anchor point to the in-progress path.",
      action: "pen/anchorCommitted",
    },
    {
      id: "pen.click-drag.adds-curve-anchor",
      trigger: "click-drag at a point",
      behavior: "Adds a curved-segment anchor point with tangent handles pulled out by the drag.",
      action: "pen/curveAnchorCommitted",
    },
    {
      id: "pen.click-start.closes-path",
      trigger: "click on start point",
      behavior: "Closes the path and commits the shape.",
      action: "pen/drawCommitted",
    },
    {
      id: "pen.double-click.commits-open-path",
      trigger: "double-click or Enter",
      behavior: "Commits the path as an open shape at its current anchors.",
      action: "pen/drawCommitted",
    },
    {
      id: "pen.esc.discards-path",
      trigger: "Esc",
      behavior: "Discards the in-progress path; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "color", id: "fill", label: "Fill", default: "#4472c4" },
    { kind: "color", id: "stroke", label: "Stroke", default: "#000000" },
    {
      kind: "number",
      id: "strokeWidth",
      label: "Stroke width",
      default: 0.75,
      min: 0,
      max: 20,
      step: 0.25,
      unit: "pt",
    },
    { kind: "boolean", id: "autoClose", label: "Auto-close", default: false },
  ],
  panels: ["transform", "color-swatches", "effects"],
  undo: "per-gesture",
  notes: [
    "'Freeform shapes where feasible.' (§4.4) — this tool is that requirement's creation surface; node editing is handed to the node-select tool.",
    "Open paths have no interior hit; closed unfilled paths pass through per the unfilled-interior rule.",
    "Each anchor placement commits its own action so per-gesture undo steps back one anchor at a time; the close/finish gesture commits the shape itself.",
    "NOTE: the entire gesture model is assumption — the doc gives one line. Publisher/Illustrator parity pending SME review.",
    "ASSUMPTION: fill default #4472c4, stroke default #000000, and the autoClose option — the doc names none of them.",
  ],
};

export const shapeTools: readonly ToolContract[] = [
  rectTool,
  roundedRectTool,
  ellipseTool,
  lineTool,
  arrowTool,
  starPolygonTool,
  calloutTool,
  bannerTool,
  flowchartTool,
  penTool,
];
