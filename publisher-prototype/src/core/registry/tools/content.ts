import type { ToolContract } from "../types";

/**
 * Content tools (PLAN.md §4.1 #3–7). Contracts only — canvas behavior
 * arrives with the Text surfaces, Images & photo, and Tables & data
 * Phase B groups.
 */

export const textFrameTool: ToolContract = {
  id: "text-frame",
  label: "Text frame",
  mode: "layout",
  group: "content",
  shortcut: "T",
  req: ["§3.1"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "textFrame",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "selects",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "text-frame.drag.creates-frame",
      trigger: "drag",
      behavior:
        "Creates a text frame of the dragged bounds anywhere on the page (§3.1 'Create text boxes anywhere on the page').",
      action: "textFrame/drawCommitted",
    },
    {
      id: "text-frame.click.creates-default-frame",
      trigger: "click (no drag)",
      behavior: "Creates a default-size text frame at the click point.",
      action: "textFrame/placeCommitted",
    },
    {
      id: "text-frame.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the frame to a square while drawing.",
      action: "textFrame/drawCommitted",
    },
    {
      id: "text-frame.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the frame outward from the press point as its center.",
      action: "textFrame/drawCommitted",
    },
    {
      id: "text-frame.double-click.enters-text-edit",
      trigger: "double-click on existing frame (with Select)",
      behavior:
        "Enters text-editing mode on the frame, keeping text editing and object manipulation modes visibly distinct (§3.1).",
      action: "textFrame/editEnteredCommitted",
    },
    {
      id: "text-frame.esc.exits-text-edit",
      trigger: "Esc in text-editing mode",
      behavior: "Exits text editing back to whole-object selection.",
      action: "selection/replaceCommitted",
    },
    {
      id: "text-frame.esc.cancels-draw",
      trigger: "Esc mid-drag",
      behavior: "Cancels the in-flight frame creation; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "number",
      id: "padding",
      label: "Padding",
      default: 0.04,
      min: 0,
      max: 1,
      step: 0.01,
      unit: "in",
    },
  ],
  panels: [
    "character",
    "paragraph",
    "styles",
    "text-fit-overflow",
    "text-wrap",
    "transform",
    "language-proofing",
  ],
  undo: "per-gesture",
  notes: [
    "'Text behaves like a layout object.' (§3.1) — frames place, resize, format, and layer like any other object.",
    "An overflowing frame shows an overflow indicator per §3.1's 'Detect text overflow' — 'Overflow detection should be obvious and actionable.' The indicator is overlay state, not a gesture.",
    "ASSUMPTION: click-to-place, Shift-square, Alt-center, and both Esc behaviors are Publisher-parity fillers — §3.1 states the capabilities, not the bindings.",
    "ASSUMPTION: 0.04in default padding is a working guess for SME review. §3.1's box-level fill, border, and transparency ('Format the box itself') and an assumed default text style are option candidates held back — the doc states no defaults and OptionSpec has no style-reference kind.",
    "ASSUMPTION: an unfilled frame interior still hits — a frame's empty interior is the frame (PLAN §5 unfilled-interior rule); the doc is silent on tolerance.",
  ],
};

export const linkTextTool: ToolContract = {
  id: "link-text",
  label: "Link text",
  mode: "layout",
  group: "content",
  shortcut: null,
  req: ["§3.2"],
  tier: "LIVE",
  cursor: "pointer",
  creates: null,
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "selects",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "link-text.click-sequence.links-frames",
      trigger: "click on out-port, then click on target frame",
      behavior:
        "Links the source frame to the target; text flows automatically between them, including across pages (§3.2 'Link one text box to another', 'Flow text automatically').",
      action: "linkText/linkCommitted",
    },
    {
      id: "link-text.badge-drag.pours-linked-frame",
      trigger: "click on overset badge, then drag on empty area",
      behavior:
        "Creates a new text frame of the dragged bounds already linked to the overset chain.",
      action: "linkText/pourCommitted",
    },
    {
      id: "link-text.click-connector.breaks-link",
      trigger: "click on link connector",
      behavior:
        "Breaks the link; text pulls back into the source chain (§3.2 'Allow users to break links').",
      action: "linkText/unlinkCommitted",
    },
    {
      id: "link-text.esc.cancels-pending-link",
      trigger: "Esc with a pending link",
      behavior: "Discards the loaded link cursor; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "continuation",
      label: "Continuation",
      default: "manual",
      values: ["manual", "automatic"],
    },
  ],
  panels: ["text-fit-overflow", "pages"],
  undo: "per-gesture",
  notes: [
    "creates stays null: linking writes threading data (storyId / prevFrameId / nextFrameId, PLAN §6.6) rather than a canvas object; the badge-drag pour is the one gesture that also leaves a frame behind.",
    "Hovering a linked frame shows link direction and connected-frame indicators (§3.2 'Linked frames should be easy to inspect') — overlay-only, no action dispatches.",
    "Deleting a linked frame warns before content is lost (§3.2) — 'Overflow text is not silently hidden.'",
    "'Reordering pages must not break text flow.' (§3.2) — the threading model, not the gesture set, carries this obligation.",
    "ASSUMPTION: the overset-badge pour gesture and Esc cancel are Publisher-parity fillers — §3.2 states linking and breaking, not the bindings.",
    "ASSUMPTION: 'manual' default for continuation — §3.2 requires 'Support manual and automatic continuation' and states no default.",
    "ASSUMPTION: link ports and overset badges are overlay targets sharing the 4px tolerance — the doc is silent.",
  ],
};

export const pictureFrameTool: ToolContract = {
  id: "picture-frame",
  label: "Picture frame",
  mode: "layout",
  group: "content",
  shortcut: "P",
  req: ["§4.1"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "pictureFrame",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "selects",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "picture-frame.drag.creates-frame",
      trigger: "drag",
      behavior:
        "Draws a picture frame of the dragged bounds, then accepts an image from a local file (§4.1 'Insert images from local files').",
      action: "pictureFrame/drawCommitted",
    },
    {
      id: "picture-frame.click.places-natural-size",
      trigger: "click (no drag)",
      behavior: "Places the image at its natural size at the click point.",
      action: "pictureFrame/placeCommitted",
    },
    {
      id: "picture-frame.shift-drag.constrains-square",
      trigger: "drag + Shift",
      behavior: "Constrains the frame to a square while drawing.",
      action: "pictureFrame/drawCommitted",
    },
    {
      id: "picture-frame.alt-drag.draws-from-center",
      trigger: "drag + Alt",
      behavior: "Draws the frame outward from the press point as its center.",
      action: "pictureFrame/drawCommitted",
    },
    {
      id: "picture-frame.drop-file.inserts-image",
      trigger: "drop file onto canvas",
      behavior: "Inserts the dropped image at the drop point.",
      action: "pictureFrame/dropCommitted",
    },
    {
      id: "picture-frame.paste.inserts-from-clipboard",
      trigger: "paste",
      behavior: "Inserts an image from the clipboard (§4.1 'Insert images from clipboard').",
      action: "pictureFrame/pasteCommitted",
    },
    {
      id: "picture-frame.replace.preserves-frame",
      trigger: "replace image on existing frame",
      behavior:
        "Swaps in the new image while preserving position and frame settings (§4.1).",
      action: "pictureFrame/replaceCommitted",
    },
    {
      id: "picture-frame.esc.cancels-draw",
      trigger: "Esc mid-drag",
      behavior: "Cancels the in-flight frame creation; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "mode",
      label: "Image mode",
      default: "embed",
      values: ["link", "embed"],
    },
  ],
  panels: ["image-adjust", "resource-manager", "transform", "effects", "text-wrap"],
  undo: "per-gesture",
  notes: [
    "'Replace an existing image while preserving position and frame settings.' (§4.1) — replacement is a frame operation, never a delete-and-redraw.",
    "'Missing linked images should be flagged.' (§4.1) — flagging rides the Resource manager's link status.",
    "§4.1's accepted formats (jpg, png, tiff, bmp, gif, svg and similar) are an import capability, not a user option — carried here rather than as an OptionSpec.",
    "ASSUMPTION: click-to-place at natural size, the Shift/Alt draw modifiers, file drop, and Esc cancel are Publisher-parity fillers — §4.1 states file, clipboard, and replace insertion, not the bindings.",
    "ASSUMPTION: 'embed' default for mode — §4.1 requires 'Link images. Embed images.' and states no default.",
    "ASSUMPTION: the frame interior always hits — an image fills it; hence unfilledInterior 'selects'.",
  ],
};

export const cropTool: ToolContract = {
  id: "crop",
  label: "Crop",
  mode: "layout",
  group: "content",
  shortcut: "C",
  req: ["§4.2"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "selects",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "crop.click.enters-crop-mode",
      trigger: "click on placed image",
      behavior:
        "Enters crop mode, showing crop handles over the full image extent (§4.2 'Crop').",
      action: "crop/modeEnteredCommitted",
    },
    {
      id: "crop.drag-handle.adjusts-region",
      trigger: "drag on crop handle",
      behavior:
        "Adjusts the visible region from the dragged handle; Shift preserves the aspect ratio; preview in overlay, one commit on release.",
      action: "crop/regionAdjustedCommitted",
    },
    {
      id: "crop.drag-image.pans-under-window",
      trigger: "drag on image inside frame",
      behavior:
        "Pans the image beneath the crop window without moving the frame (in-frame crop/pan/zoom, PLAN §6.5); one commit on release.",
      action: "crop/imagePannedCommitted",
    },
    {
      id: "crop.enter.exits-crop-mode",
      trigger: "Enter or click outside",
      behavior: "Exits crop mode, keeping the committed crop.",
      action: "crop/modeExitedCommitted",
    },
    {
      id: "crop.esc.cancels-adjustment",
      trigger: "Esc during drag",
      behavior:
        "Cancels the in-flight handle drag or pan and restores the prior crop; nothing commits.",
      action: "gesture/cancelled",
    },
    {
      id: "crop.reset.restores-original",
      trigger: "reset (options bar)",
      behavior: "Restores the original image, clearing the crop (§4.2 'Reset image to original').",
      action: "crop/resetCommitted",
    },
  ],
  options: [{ kind: "boolean", id: "aspectLock", label: "Lock aspect", default: false }],
  panels: ["image-adjust", "transform"],
  undo: "per-gesture",
  notes: [
    "'Non-destructive editing where possible.' (§4.2) — the crop is an adjust op on the frame (PLAN §6.5 PhotoOp), never a pixel edit; 'Original image data should be preserved when feasible.' (§4.2)",
    "'Crop and resize controls should be precise.' (§4.2) — handle drags preview in the overlay and commit exactly one action each.",
    "ASSUMPTION: crop-mode presentation, Shift aspect preserve, and the commit model are fillers — §4.2 lists operations, not gestures. Each handle drag or pan commits one action per PLAN §6.3, with Esc scoped to the in-flight drag rather than the whole crop session — SME review item.",
    "ASSUMPTION: aspectLock off by default, and crop handles take precedence over frame handles while crop mode is active — the doc is silent on both.",
  ],
};

export const tableTool: ToolContract = {
  id: "table",
  label: "Table",
  mode: "layout",
  group: "content",
  shortcut: null,
  req: ["§8.1"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: "table",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "selects",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "table.drag.creates-table",
      trigger: "drag",
      behavior:
        "Draws the table bounds and applies the row and column count from the options bar (§8.1 'Insert tables', 'Specify row and column count').",
      action: "table/drawCommitted",
    },
    {
      id: "table.click.inserts-default-table",
      trigger: "click (no drag)",
      behavior: "Inserts a default-size table at the click point.",
      action: "table/placeCommitted",
    },
    {
      id: "table.drag-boundary.resizes-rows-cols",
      trigger: "drag on row/column boundary",
      behavior:
        "Resizes the rows and columns at the dragged boundary (§8.1); preview in overlay, one commit on release.",
      action: "table/gridResizedCommitted",
    },
    {
      id: "table.double-click-cell.edits-text",
      trigger: "double-click on cell",
      behavior: "Enters text editing inside the cell (§8.1 'Format text inside cells').",
      action: "table/cellEditEnteredCommitted",
    },
    {
      id: "table.drag-cells.selects-range",
      trigger: "drag across cells",
      behavior:
        "Selects the cell range for merge and formatting operations (§8.1 'Merge cells').",
      action: "table/rangeSelectedCommitted",
    },
    {
      id: "table.tab.adds-row",
      trigger: "Tab in last cell",
      behavior:
        "Adds a row below and moves the caret into it (§8.1 'Simple editing similar to other Office table tools').",
      action: "table/rowAddedCommitted",
    },
    {
      id: "table.esc.steps-selection-outward",
      trigger: "Esc",
      behavior:
        "Exits cell editing to table selection, then table selection to whole-object selection.",
      action: "selection/replaceCommitted",
    },
  ],
  options: [
    { kind: "number", id: "rows", label: "Rows", default: 3, min: 1, max: 100, step: 1 },
    { kind: "number", id: "cols", label: "Columns", default: 3, min: 1, max: 100, step: 1 },
  ],
  panels: ["table-properties", "character", "paragraph", "color-swatches"],
  undo: "per-gesture",
  notes: [
    "'Tables must behave predictably inside a fixed-layout publication.' (§8.1) — the table is a frame (PLAN §6.6), positioned and layered like any object.",
    "Borders and per-cell shading (§8.1) are Table properties panel territory, not options-bar state.",
    "PLAN §6.6 flags the table as the second-hardest build item; contracts land in Phase A, cell behavior with the Tables & data Phase B group.",
    "ASSUMPTION: click-to-insert default size, the range-drag selection gesture, Tab-adds-row, and the Esc chain are Office-table-parity fillers per §8.1's 'Simple editing similar to other Office table tools'.",
    "ASSUMPTION: the 3×3 default and 1–100 ranges are working guesses for SME review; cell boundaries will need a grab tolerance distinct from cell interiors — the doc is silent.",
  ],
};

export const contentTools: readonly ToolContract[] = [
  textFrameTool,
  linkTextTool,
  pictureFrameTool,
  cropTool,
  tableTool,
];
