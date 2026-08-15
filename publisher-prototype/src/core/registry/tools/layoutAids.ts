import type { ToolContract } from "../types";

/**
 * Layout-aid tools (PLAN.md §4.1 #20). Contracts only — canvas behavior
 * arrives with the Document structure Phase B group.
 */

export const guideTool: ToolContract = {
  id: "guide",
  label: "Guide",
  mode: "layout",
  group: "layout-aids",
  shortcut: "J",
  req: ["§2.4"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "guide",
  hitTest: {
    tolerancePx: 5,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "guide.drag-from-ruler.creates-guide",
      trigger: "drag from ruler onto page",
      behavior:
        "Creates a ruler guide at the drop position, orientation taken from the source ruler (§2.4 ruler guides, custom guide placement); preview tracks in the overlay, one action commits on release.",
      action: "guide/placedCommitted",
    },
    {
      id: "guide.drag.repositions-guide",
      trigger: "drag on existing guide",
      behavior:
        "Repositions the guide with the pointer unless it is locked (§2.4 guide locking); one commit on release.",
      action: "guide/movedCommitted",
    },
    {
      id: "guide.drag-to-ruler.deletes-guide",
      trigger: "drag guide back onto ruler",
      behavior: "Deletes the guide when released over its source ruler.",
      action: "guide/removedCommitted",
    },
    {
      id: "guide.shift-drag.snaps-to-ticks",
      trigger: "drag + Shift",
      behavior: "Snaps the guide position to the ruler's tick increments while dragging.",
      action: "guide/movedCommitted",
    },
    {
      id: "guide.double-click.numeric-entry",
      trigger: "double-click on guide",
      behavior:
        "Opens numeric position entry for the guide; confirming the value commits one move.",
      action: "guide/movedCommitted",
    },
    {
      id: "guide.esc.cancels-drag",
      trigger: "Esc during drag",
      behavior:
        "Cancels the in-flight guide placement or move and restores the prior position; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    { kind: "boolean", id: "snapToGuides", label: "Snap to guides", default: true },
    { kind: "boolean", id: "snapToGrid", label: "Snap to grid", default: false },
    { kind: "boolean", id: "showGuides", label: "Show guides", default: true },
    { kind: "color", id: "guideColor", label: "Guide color", default: "#00b0f0" },
  ],
  panels: ["guides-grid", "document-setup"],
  undo: "per-gesture",
  notes: [
    "Guides are per-page document entities (PLAN.md §6.6 per-page guides) — placement, move, and delete are ordinary document gestures with per-gesture undo.",
    "Locked guides are not draggable (§2.4 guide locking) — hitTest lockedObjects 'skips' applies to guides themselves, and locked state must be visible before a drag is attempted.",
    "Guides never print unless explicitly configured: 'Guides should not print unless explicitly configured as printable objects.' (§2.4)",
    "'Snap behavior should be optional and easy to toggle.' (§2.4) — snapToGuides/snapToGrid live in the options bar for exactly that reason.",
    "Orientation is not an OptionSpec: the digest records it as enum(horizontal|vertical) '[from drag source]' — it is derived from the source ruler, never set by the user, so it is carried here as a note rather than an option.",
    "ASSUMPTION: drag-to-ruler delete, Shift tick-snapping, double-click numeric entry, and Esc cancel are Publisher-parity fillers — §2.4 states the capabilities (placement, locking, color/visibility), not the bindings.",
    "ASSUMPTION: 5px hairline grab tolerance (guides are the hairline-class hit case), snapToGuides default true, snapToGrid default false, and the guide color value are working guesses for SME review — §2.4 requires 'Guide color or visibility settings' but names no default.",
  ],
};

export const layoutAidTools: readonly ToolContract[] = [guideTool];
