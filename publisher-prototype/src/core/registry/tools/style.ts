import type { ToolContract } from "../types";

/**
 * Style tools (PLAN.md §4.1 #18–19). Contracts only — canvas behavior
 * arrives with the Shapes Phase B group.
 */

export const fillGradientTool: ToolContract = {
  id: "fill-gradient",
  label: "Fill & gradient",
  mode: "layout",
  group: "style",
  shortcut: "D",
  req: ["§4.4", "§9.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "fill-gradient.click.applies-fill",
      trigger: "click on object",
      behavior: "Applies the current fill to the object (§4.4 'Fill colors').",
      action: "fillGradient/fillAppliedCommitted",
    },
    {
      id: "fill-gradient.drag.sets-gradient-axis",
      trigger: "drag across object (gradient mode)",
      behavior:
        "Sets the gradient axis from press point to release point; preview in overlay, one commit on release.",
      action: "fillGradient/axisSetCommitted",
    },
    {
      id: "fill-gradient.drag-stop.repositions-stop",
      trigger: "drag on gradient stop",
      behavior: "Repositions the stop along the axis annotator; one commit on release.",
      action: "fillGradient/stopMovedCommitted",
    },
    {
      id: "fill-gradient.double-click-axis.adds-stop",
      trigger: "double-click on gradient axis",
      behavior: "Adds a new stop at the clicked position.",
      action: "fillGradient/stopAddedCommitted",
    },
    {
      id: "fill-gradient.esc.cancels-stop-drag",
      trigger: "Esc during stop drag",
      behavior: "Cancels the in-flight stop drag; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "fillType",
      label: "Fill type",
      default: "solid",
      values: ["none", "solid", "gradient", "pattern"],
    },
    { kind: "color", id: "color", label: "Color", default: "#000000" },
    {
      kind: "enum",
      id: "gradientType",
      label: "Gradient type",
      default: "linear",
      values: ["linear", "radial"],
    },
    {
      kind: "number",
      id: "angle",
      label: "Angle",
      default: 0,
      min: 0,
      max: 360,
      step: 1,
      unit: "deg",
    },
  ],
  panels: ["color-swatches", "effects", "themes"],
  undo: "per-gesture",
  notes: [
    "'Gradients. Pattern fills.' (§4.4) and 'Custom color palettes.' (§9.4) anchor the fill vocabulary.",
    "The color option carries a literal RGB value; swatch references and CMYK/spot handling (§9.4) ride the Color & swatches panel.",
    "ASSUMPTION: fills apply to the topmost hit object honoring the locked skip — §5.3's 'based on user settings' makes the skip a default, not absolute, as with the select tool.",
    "ASSUMPTION: click-to-apply, the gradient-axis drag, and stop editing are parity fillers — §4.4 states fills, gradients, and patterns, not the bindings.",
    "ASSUMPTION: 'solid' fillType, 'linear' gradientType, 0° angle, and the black literal default colour are working guesses for SME review — the doc states no defaults.",
  ],
};

export const eyedropperTool: ToolContract = {
  id: "eyedropper",
  label: "Eyedropper",
  mode: "layout",
  group: "style",
  shortcut: "I",
  req: ["§12.2"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "eyedropper.click-source.samples-formatting",
      trigger: "click on source object",
      behavior: "Samples the object's formatting (§12.2 'Copy formatting').",
      action: "eyedropper/sampleCommitted",
    },
    {
      id: "eyedropper.click-target.applies-formatting",
      trigger: "click on target object",
      behavior:
        "Applies the sampled formatting, preserving object and text formatting fidelity (§12.2).",
      action: "eyedropper/applyCommitted",
    },
    {
      id: "eyedropper.double-click-source.locks-painter",
      trigger: "double-click on source object",
      behavior: "Keeps the painter loaded for multiple targets.",
      action: "eyedropper/painterLockedCommitted",
    },
    {
      id: "eyedropper.alt-click.samples-color-only",
      trigger: "click + Alt (color mode)",
      behavior: "Samples the colour only, leaving other formatting untouched.",
      action: "eyedropper/colorSampledCommitted",
    },
    {
      id: "eyedropper.esc.drops-sample",
      trigger: "Esc",
      behavior: "Drops the loaded sample; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "scope",
      label: "Scope",
      default: "all",
      values: ["all", "fillStroke", "text"],
    },
  ],
  panels: ["color-swatches", "styles"],
  undo: "per-gesture",
  notes: [
    "'Copy formatting.' (§12.2) with 'Consistent Office-style behavior.' (§12.2) is the entire textual basis for this tool.",
    "ASSUMPTION: the doc has no dedicated eyedropper or format-painter section — §12.2's one bullet is the whole basis; the multi-target lock, Alt colour-only mode, and Esc drop are Office-parity fillers pending SME review.",
    "ASSUMPTION: locked objects may be sampled but not painted — the contract records 'skips' for the paint half; §5.3's 'based on user settings' applies as with the select tool.",
    "ASSUMPTION: 'all' default scope — the doc is silent beyond the one bullet.",
  ],
};

export const styleTools: readonly ToolContract[] = [fillGradientTool, eyedropperTool];
