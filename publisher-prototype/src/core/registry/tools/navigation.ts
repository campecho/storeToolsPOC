import type { ToolContract } from "../types";

/** Navigation tools (PLAN.md §4.1 #23–24) — LIVE since the canvas foundation. */

/** Navigation tools do no object hit-testing; the spec says so explicitly. */
const NO_HIT_TESTING = {
  tolerancePx: 0,
  unfilledInterior: "passesThrough",
  lockedObjects: "skips",
} as const;

export const zoomTool: ToolContract = {
  id: "zoom",
  label: "Zoom",
  mode: "both",
  group: "navigation",
  shortcut: "Z",
  req: ["§9.1"],
  tier: "LIVE",
  cursor: "zoom-in",
  creates: null,
  hitTest: NO_HIT_TESTING,
  gestures: [
    {
      id: "zoom.click.steps-in",
      trigger: "click",
      behavior:
        "Steps zoom up to the next preset stop (10%–400%), keeping the clicked document point fixed in the viewport.",
      action: "viewport/zoomStepCommitted",
    },
    {
      id: "zoom.alt-click.steps-out",
      trigger: "click + Alt",
      behavior:
        "Steps zoom down to the previous preset stop, keeping the clicked document point fixed in the viewport.",
      action: "viewport/zoomStepCommitted",
    },
    {
      id: "zoom.wheel.ctrl-zooms-at-cursor",
      trigger: "Ctrl/Cmd + wheel",
      behavior:
        "Multiplies zoom by 1.075 per notch toward the pointer (reverse divides), clamped to 10%–400%, keeping the document point under the cursor fixed.",
      action: "viewport/zoomWheelCommitted",
    },
  ],
  options: [],
  panels: [],
  undo: "none",
  notes: [
    "Viewport changes never enter document history (undo: none).",
    "zoom.wheel.ctrl-zooms-at-cursor is active regardless of the selected tool; the clause lives here because this is the zoom contract.",
    "The zoom % readout and fit control render from viewport state, not tool options.",
    "ASSUMPTION: the 10%–400% range and preset stops are carried from the POC's working-range guesses — confirm against real large-format jobs (core/geometry/viewport.ts).",
  ],
};

export const panTool: ToolContract = {
  id: "pan",
  label: "Pan",
  mode: "both",
  group: "navigation",
  shortcut: "H",
  req: [],
  tier: "LIVE",
  cursor: "grab",
  creates: null,
  hitTest: NO_HIT_TESTING,
  gestures: [
    {
      id: "pan.drag.moves-viewport",
      trigger: "drag",
      behavior:
        "Translates the viewport with the pointer; the preview tracks live outside the store and one action commits on pointer-up.",
      action: "viewport/panCommitted",
    },
    {
      id: "pan.space-drag.temporary-pan",
      trigger: "Space + drag (any tool)",
      behavior:
        "Holding Space pans identically from within any tool, restoring that tool on release.",
      action: "viewport/panCommitted",
    },
    {
      id: "pan.wheel.scrolls",
      trigger: "wheel",
      behavior:
        "Scrolls the viewport vertically by the wheel delta; Shift + wheel scrolls horizontally.",
      action: "viewport/panCommitted",
    },
  ],
  options: [],
  panels: [],
  undo: "none",
  notes: [
    "Viewport changes never enter document history (undo: none).",
    "§4.1 lists Pan with no requirement citation ('—'); the empty req array is deliberate.",
  ],
};

export const navigationTools: readonly ToolContract[] = [zoomTool, panTool];
