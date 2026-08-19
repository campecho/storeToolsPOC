import type { ToolContract } from "../types";

/**
 * Selection tools (PLAN.md §4.1 #1–2). Contracts only — canvas behavior
 * arrives with the Selection & transform Phase B group.
 */

export const selectTool: ToolContract = {
  id: "select",
  label: "Select",
  mode: "layout",
  group: "selection",
  shortcut: "V",
  req: ["§2.1", "§2.2", "§4.4", "§5.1", "§5.2", "§5.3"],
  tier: "LIVE",
  cursor: "default",
  creates: null,
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "select.click.selects-topmost",
      trigger: "click",
      behavior:
        "Selects the topmost unlocked object under the pointer — or, when it belongs to a group, that whole group (§5.1) — showing the selection frame with 8 handles and the rotation handle (§2.1, §5.2).",
      action: "selection/replaceCommitted",
    },
    {
      id: "select.click-empty.clears",
      trigger: "click on empty canvas",
      behavior: "Clears the selection.",
      action: "selection/clearedCommitted",
    },
    {
      id: "select.shift-click.toggles-membership",
      trigger: "click + Shift",
      behavior: "Adds the object to the selection, or removes it if already selected.",
      action: "selection/toggleCommitted",
    },
    {
      id: "select.alt-click.selects-beneath",
      trigger: "click + Alt",
      behavior:
        "Selects the next object beneath the current hit in stacking order, cycling through overlapping objects (§2.2 selecting obscured objects).",
      action: "selection/cycleCommitted",
    },
    {
      id: "select.drag-empty.marquee-selects",
      trigger: "drag from empty canvas",
      behavior:
        "Draws a marquee and selects every unlocked object it intersects on release; preview renders in the overlay, one action commits.",
      action: "selection/marqueeCommitted",
    },
    {
      id: "select.drag.moves-selection",
      trigger: "drag on selected object",
      behavior:
        "Moves the selection with the pointer, honoring snapping; objects stay exactly where placed on release (§2.1).",
      action: "object/moveCommitted",
    },
    {
      id: "select.drag-handle.resizes",
      trigger: "drag on resize handle",
      behavior:
        "Resizes the selection from the dragged handle; Shift preserves proportions (§4.4 preserve proportions when requested).",
      action: "object/resizeCommitted",
    },
    {
      id: "select.drag-rotate.rotates",
      trigger: "drag on rotation handle",
      behavior:
        "Rotates the selection freely about the selection frame's centre, as one rigid body — members orbit the pivot rather than each spinning in place; Shift snaps to fixed angles (§5.2 free rotation and fixed-angle options).",
      action: "object/rotateCommitted",
    },
    {
      id: "select.arrow.nudges",
      trigger: "arrow key",
      behavior:
        "Nudges the selection by the configured increment per §2.1's keyboard nudging with configurable increments.",
      action: "object/nudgeCommitted",
    },
    {
      id: "select.double-click-group.enters-group",
      trigger: "double-click on group member",
      behavior:
        "Enters the group to select and edit the individual object (§5.1 editing inside a group where feasible); each double-click descends one nesting level, and clicking outside the entered group leaves it.",
      action: "selection/groupEnteredCommitted",
    },
    {
      id: "select.esc.cancels-drag",
      trigger: "Esc during drag",
      behavior: "Cancels the in-flight move/resize/rotate and restores the original geometry; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "number",
      id: "nudgeIncrement",
      label: "Nudge",
      default: 0.1,
      min: 0.01,
      max: 2,
      step: 0.01,
      unit: "in",
    },
    { kind: "boolean", id: "showCoordinates", label: "Show coordinates", default: true },
    {
      kind: "enum",
      id: "positionRelativeTo",
      label: "Position relative to",
      default: "page",
      values: ["page", "margin", "guide", "object"],
    },
  ],
  panels: ["transform", "align-distribute", "layers", "effects", "text-wrap", "history"],
  undo: "per-gesture",
  notes: [
    "Skipping locked objects follows §5.3's 'based on user settings' — the skip is the default, not absolute; locked state renders visibly and locked objects can still be intentionally unlocked.",
    "Marquee, move, resize, and rotate previews live in the overlay outside the store; each commits exactly one action (PLAN.md §6.3).",
    "select.esc.cancels-drag commits nothing — gesture/cancelled is the gesture pipeline's no-op record, never a document mutation.",
    "A group selects as a UNIT: click, Shift-click, Alt-click and marquee all resolve a hit object to the outermost group it belongs to, so a transform never holds part of a group. Locked members stay out, exactly as the hit-test contract keeps them out of a click.",
    "Rotation is the one transform that moves a selection's members as well as changing them: object rotation pivots at each object's own centre, so a selection turns rigidly only by orbiting every member about the selection frame's centre. object/rotateCommitted therefore carries absolute geometry alongside the absolute angles, and lines — which store no angle — turn entirely through it.",
    "ASSUMPTION: empty-click clear, Shift-toggle, marquee gesture, Esc-cancel, and the Alt modifier for stack cycling are Publisher-parity fillers — §2.1/§2.2 state the capabilities, not the bindings.",
    "ASSUMPTION: 4px hit tolerance and 0.1in default nudge are working guesses for SME review.",
  ],
};

export const nodeSelectTool: ToolContract = {
  id: "node-select",
  label: "Node select",
  mode: "layout",
  group: "selection",
  shortcut: "A",
  req: ["§4.4"],
  tier: "LIVE",
  cursor: "default",
  creates: null,
  hitTest: {
    tolerancePx: 5,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "node-select.click.selects-node",
      trigger: "click on path node",
      behavior: "Selects the anchor point and shows its control handles.",
      action: "nodeSelect/nodeReplacedCommitted",
    },
    {
      id: "node-select.drag-node.moves-anchor",
      trigger: "drag on node",
      behavior: "Moves the anchor point, reshaping the path; preview in overlay, one commit on release.",
      action: "nodeSelect/nodeMovedCommitted",
    },
    {
      id: "node-select.drag-handle.adjusts-tangent",
      trigger: "drag on control handle",
      behavior: "Adjusts the curve tangent through the handle; one commit on release.",
      action: "nodeSelect/tangentAdjustedCommitted",
    },
    {
      id: "node-select.double-click-segment.inserts-node",
      trigger: "double-click on path segment",
      behavior: "Inserts a new anchor point at the clicked position on the segment.",
      action: "nodeSelect/nodeInsertedCommitted",
    },
    {
      id: "node-select.delete.removes-node",
      trigger: "Delete with node selected",
      behavior: "Removes the selected anchor point, joining its neighbors.",
      action: "nodeSelect/nodeRemovedCommitted",
    },
    {
      id: "node-select.esc.exits-to-object",
      trigger: "Esc",
      behavior: "Deselects nodes and returns to whole-object selection.",
      action: "selection/replaceCommitted",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "nodeType",
      label: "Node type",
      default: "corner",
      values: ["corner", "smooth", "symmetric"],
    },
  ],
  panels: ["transform"],
  undo: "per-gesture",
  notes: [
    "Shapes remain editable vector objects (§4.4) — this tool is that requirement's editing surface, paired with the pen tool's creation surface.",
    "ASSUMPTION: the doc has no dedicated node-editing section; the entire gesture model is Publisher/Illustrator parity pending SME review. Node grab radius (5px) intentionally exceeds segment tolerance (4px).",
  ],
};

export const selectionTools: readonly ToolContract[] = [selectTool, nodeSelectTool];
