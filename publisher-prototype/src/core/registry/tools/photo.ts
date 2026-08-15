import type { ToolContract } from "../types";

/**
 * Photo-mode tools (PLAN.md §4.2). Seven contracts; Zoom/Pan are the shared
 * mode "both" navigation contracts and are not duplicated here. Contracts
 * only — canvas behavior arrives with the Images & photo Phase B group.
 *
 * All seven bind to the one recipe vocabulary (core/image/, PLAN.md §6.5):
 * every commit appends or updates a PhotoOp in the frame's adjust list, so
 * editing is non-destructive and reset-to-original is free by construction.
 */

/**
 * Photo mode has no object stack — the single image is the surface, so no
 * tool here hit-tests objects. Handles, mask overlays, and overlay bounds
 * are overlay-layer targets, noted per tool.
 */
const SINGLE_IMAGE_SURFACE = {
  tolerancePx: 0,
  unfilledInterior: "passesThrough",
  lockedObjects: "skips",
} as const;

export const photoCropTool: ToolContract = {
  id: "photo-crop",
  label: "Crop & straighten",
  mode: "photo",
  group: "photo",
  shortcut: "C",
  req: ["§4.2"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "photo-crop.drag-handle.resizes-crop",
      trigger: "drag on crop edge/corner handle",
      behavior:
        "Resizes the crop rectangle from the dragged handle; preview in the overlay, one crop op commits on release (§4.2 crop).",
      action: "photoCrop/cropResizedCommitted",
    },
    {
      id: "photo-crop.shift-drag-corner.constrains-aspect",
      trigger: "drag on corner handle + Shift",
      behavior: "Constrains the crop rectangle to the current aspect ratio while resizing.",
      action: "photoCrop/cropResizedCommitted",
    },
    {
      id: "photo-crop.drag-inside.pans-image",
      trigger: "drag inside crop rectangle",
      behavior:
        "Pans the image under the crop window without changing the crop bounds; one commit on release.",
      action: "photoCrop/imagePannedCommitted",
    },
    {
      id: "photo-crop.drag-outside.straightens",
      trigger: "drag outside crop rectangle",
      behavior:
        "Rotates the image to straighten it, showing an alignment grid overlay while dragging; one commit on release.",
      action: "photoCrop/straightenCommitted",
    },
    {
      id: "photo-crop.rotate-ninety.rotates",
      trigger: "click rotate 90° control",
      behavior: "Rotates the image 90° per press (§4.2 rotate).",
      action: "photoCrop/rotatedCommitted",
    },
    {
      id: "photo-crop.flip.flips",
      trigger: "click flip horizontal/vertical control",
      behavior: "Flips the image across the chosen axis (§4.2 flip horizontal, flip vertical).",
      action: "photoCrop/flippedCommitted",
    },
    {
      id: "photo-crop.enter.applies-crop",
      trigger: "Enter or double-click",
      behavior: "Confirms the crop rectangle and exits crop-handle editing.",
      action: "photoCrop/cropCommitted",
    },
    {
      id: "photo-crop.esc.cancels-drag",
      trigger: "Esc during drag",
      behavior:
        "Cancels the in-flight crop, pan, or straighten drag and restores the prior geometry; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "aspect",
      label: "Aspect",
      default: "free",
      values: ["free", "original", "1:1", "4:3", "3:2", "16:9", "custom"],
    },
    {
      kind: "number",
      id: "angle",
      label: "Straighten",
      default: 0,
      min: -45,
      max: 45,
      step: 0.1,
      unit: "deg",
    },
    { kind: "boolean", id: "flipH", label: "Flip horizontal", default: false },
    { kind: "boolean", id: "flipV", label: "Flip vertical", default: false },
  ],
  panels: ["photo-crop-geometry", "photo-history"],
  undo: "per-gesture",
  notes: [
    "Photo mode has no object stack — the single image is the surface (tolerancePx 0); crop handles take priority over image pan and live on the overlay layer, not in object hit-testing.",
    "'Original image data should be preserved when feasible.' (§4.2) — the crop is a recipe op; an adjust commit is an ordinary document gesture (PLAN.md §6.5), same history, same undo.",
    "Rotate 90° is a command, not an OptionSpec — the doc's 'Rotate' (§4.2) is carried by photo-crop.rotate-ninety.rotates because the option kinds admit no command type.",
    "Straighten is not in §4.2 at all — the doc has only 'Rotate'; the straighten gesture, angle option, and grid overlay come from PLAN.md §6.5's crop/rotate/straighten/flip vocabulary (photo-app parity on the interaction).",
    "ASSUMPTION: the digest sketches an Enter-commits model for the crop; this contract resolves it to PLAN.md §6.3's one-commit-per-completed-gesture rule — each drag commits, Enter/double-click confirms and exits. Flagged for SME review.",
    "ASSUMPTION: handle interaction, in-crop pan, Shift aspect lock, and the -45°–45° straighten range are working guesses — §4.2 says only 'Crop' and 'Crop and resize controls should be precise.'",
  ],
};

export const photoAdjustTool: ToolContract = {
  id: "photo-adjust",
  label: "Adjust",
  mode: "photo",
  group: "photo",
  shortcut: "A",
  req: ["§4.2"],
  tier: "LIVE",
  cursor: "default",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "photo-adjust.drag-slider.commits-adjust",
      trigger: "drag on adjustment slider",
      behavior:
        "Previews the adjustment live on the proxy while dragging; one adjust op commits on release (PLAN.md §6.3 one action on pointer-up).",
      action: "photoAdjust/adjustCommitted",
    },
    {
      id: "photo-adjust.click-auto.auto-enhances",
      trigger: "click auto-enhance",
      behavior:
        "Commits a computed one-shot adjustment op over the current image (PLAN.md §6.5 auto-enhance).",
      action: "photoAdjust/autoEnhanceCommitted",
    },
    {
      id: "photo-adjust.click-reset.resets",
      trigger: "click reset",
      behavior:
        "Clears the adjust ops, restoring the original image (§4.2 reset image to original); one committed action, itself undoable.",
      action: "photoAdjust/resetCommitted",
    },
  ],
  options: [
    { kind: "number", id: "brightness", label: "Brightness", default: 0, min: -100, max: 100 },
    { kind: "number", id: "contrast", label: "Contrast", default: 0, min: -100, max: 100 },
    { kind: "number", id: "exposure", label: "Exposure", default: 0, min: -100, max: 100 },
    { kind: "number", id: "highlights", label: "Highlights", default: 0, min: -100, max: 100 },
    { kind: "number", id: "shadows", label: "Shadows", default: 0, min: -100, max: 100 },
    { kind: "number", id: "saturation", label: "Saturation", default: 0, min: -100, max: 100 },
    { kind: "number", id: "temperature", label: "Temperature", default: 0, min: -100, max: 100 },
    { kind: "number", id: "sharpen", label: "Sharpen", default: 0, min: -100, max: 100 },
    {
      kind: "number",
      id: "transparency",
      label: "Transparency",
      default: 0,
      min: 0,
      max: 100,
      unit: "%",
    },
    {
      kind: "enum",
      id: "recolor",
      label: "Recolor",
      default: "off",
      values: ["off", "tint", "monochrome"],
    },
  ],
  panels: ["photo-adjustments", "photo-history"],
  undo: "per-gesture",
  notes: [
    "Panel- and options-bar-driven — no canvas hit-testing (tolerancePx 0); the canvas shows the live proxy with before/after compare (PLAN.md §6.5).",
    "'Non-destructive editing where possible.' (§4.2) — every commit is a parametric op in the recipe; full-resolution replay at export is a dev-team seam (PLAN.md §6.5), not part of this tool.",
    "§4.2 requires brightness, contrast, recoloring, transparency, and reset; exposure, highlights, shadows, saturation, temperature, sharpen, and auto-enhance are PLAN.md §6.5 engine vocabulary, not doc requirements.",
    "ASSUMPTION: all slider ranges and defaults — the doc states none anywhere; -100–100 default 0 (transparency 0–100% per the digest) are POC-seeded working guesses for SME review, as are the recolor enum's values (§4.2 says only 'Recoloring').",
  ],
};

export const maskBrushTool: ToolContract = {
  id: "mask-brush",
  label: "Mask brush",
  mode: "photo",
  group: "photo",
  shortcut: "B",
  req: [],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "mask-brush.drag.paints-mask",
      trigger: "drag",
      behavior:
        "Paints mask strokes at the current brush size, hardness, and mode; the mask renders on the overlay layer and one action commits per stroke on release.",
      action: "maskBrush/strokeCommitted",
    },
    {
      id: "mask-brush.alt-drag.erases-mask",
      trigger: "drag + Alt",
      behavior: "Erases from the mask instead of painting, regardless of the mode option.",
      action: "maskBrush/strokeCommitted",
    },
    {
      id: "mask-brush.bracket.resizes-brush",
      trigger: "[ / ]",
      behavior: "Decreases/increases the brush size option by one step.",
      action: "maskBrush/sizeCommitted",
    },
    {
      id: "mask-brush.apply.dispatches-op",
      trigger: "click Apply",
      behavior:
        "Dispatches the selected mask-scoped operation over the drawn mask; a locally computed region adjust commits immediately, while model-backed operations commit when their patch returns.",
      action: "maskBrush/opRequestCommitted",
    },
  ],
  options: [
    {
      kind: "number",
      id: "size",
      label: "Size",
      default: 40,
      min: 1,
      max: 500,
      unit: "px",
    },
    { kind: "number", id: "hardness", label: "Hardness", default: 100, min: 0, max: 100 },
    {
      kind: "enum",
      id: "mode",
      label: "Mode",
      default: "add",
      values: ["add", "subtract"],
    },
    {
      kind: "enum",
      id: "operation",
      label: "Operation",
      default: "inpaint",
      values: ["inpaint", "spot-heal", "remove-background", "region-adjust"],
    },
  ],
  panels: ["photo-adjustments", "photo-history"],
  undo: "per-gesture",
  notes: [
    "Mask drawing is interaction-LIVE per PLAN.md §6.5 — the model-service execution the masks feed is SURFACE at the panel/operation level, not on this drawing tool; the seam declares the call: inpaint(image, mask) → patch, with spot heal, background removal, and upscale in the same seam family, and the result slots into the recipe as a stored-explicit patch.",
    "Zero doc coverage — the requirements doc never mentions masks; this tool exists entirely on PLAN.md §6.5's mask interactions, hence the empty req array. Thin; flagged for SME review.",
    "The whole image is the paint surface (tolerancePx 0) — no object hit-testing; the mask renders on the SVG/overlay layer.",
    "Strokes are per-gesture undoable even though the mask is pending — it attaches to the recipe only when the mask-scoped op commits.",
    "mask-brush.bracket.resizes-brush changes a tool option, not the document — its action carries no Committed suffix and it never enters document history.",
    "ASSUMPTION: Alt-to-erase, bracket size keys, brush size 1–500px default 40, and hardness 0–100 default 100 are photo-app-parity working guesses — no source states any of them.",
  ],
};

export const maskMarqueeTool: ToolContract = {
  id: "mask-marquee",
  label: "Mask marquee",
  mode: "photo",
  group: "photo",
  shortcut: "M",
  req: [],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "mask-marquee.drag.defines-region",
      trigger: "drag",
      behavior:
        "Rubber-bands a rectangular or elliptical mask region per the shape option; preview in the overlay, one action commits on release.",
      action: "maskMarquee/regionCommitted",
    },
    {
      id: "mask-marquee.shift-drag.constrains",
      trigger: "drag + Shift",
      behavior: "Constrains the region to a square or circle while dragging.",
      action: "maskMarquee/regionCommitted",
    },
    {
      id: "mask-marquee.drag-region.moves-region",
      trigger: "drag inside existing region",
      behavior: "Moves the region without resizing it; one commit on release.",
      action: "maskMarquee/regionMovedCommitted",
    },
    {
      id: "mask-marquee.apply.dispatches-op",
      trigger: "click Apply",
      behavior:
        "Dispatches the selected mask-scoped operation over the region; a locally computed region adjust commits immediately, while model-backed operations commit when their patch returns.",
      action: "maskMarquee/opRequestCommitted",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "shape",
      label: "Shape",
      default: "rectangle",
      values: ["rectangle", "ellipse"],
    },
    {
      kind: "number",
      id: "feather",
      label: "Feather",
      default: 0,
      min: 0,
      max: 100,
      unit: "px",
    },
    {
      kind: "enum",
      id: "operation",
      label: "Operation",
      default: "inpaint",
      values: ["inpaint", "spot-heal", "remove-background", "region-adjust"],
    },
  ],
  panels: ["photo-adjustments", "photo-history"],
  undo: "per-gesture",
  notes: [
    "Mask drawing is interaction-LIVE per PLAN.md §6.5 — the model-service execution the masks feed is SURFACE at the panel/operation level, not on this drawing tool; the seam declares the call: inpaint(image, mask) → patch, with spot heal, background removal, and upscale in the same seam family, and the result slots into the recipe as a stored-explicit patch.",
    "Zero doc coverage — the requirements doc never mentions masks; this tool exists entirely on PLAN.md §6.5's mask interactions (brush and marquee), hence the empty req array. Thin; flagged for SME review.",
    "The whole image is the marquee surface (tolerancePx 0) — no object hit-testing; region bounds and handles are overlay-layer targets.",
    "Regions are per-gesture undoable even though the mask is pending — it attaches to the recipe only when the mask-scoped op commits.",
    "ASSUMPTION: Shift constrain, move-inside-region, shape default, and the feather 0–100px range are photo-app-parity working guesses — no source states any of them.",
  ],
};

export const textOverlayTool: ToolContract = {
  id: "text-overlay",
  label: "Text overlay",
  mode: "photo",
  group: "photo",
  shortcut: "T",
  req: ["§3.3"],
  tier: "LIVE",
  cursor: "text",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "text-overlay.click.places-overlay",
      trigger: "click or drag on image",
      behavior:
        "Places a text overlay box at the click point (or of the dragged bounds) as a recipe overlay op and enters text editing.",
      action: "textOverlay/placedCommitted",
    },
    {
      id: "text-overlay.drag.moves-overlay",
      trigger: "drag on existing overlay",
      behavior: "Moves the overlay with the pointer; one commit on release.",
      action: "textOverlay/movedCommitted",
    },
    {
      id: "text-overlay.drag-handle.scales-overlay",
      trigger: "drag on overlay handle",
      behavior: "Resizes/scales the overlay from the dragged handle; one commit on release.",
      action: "textOverlay/scaledCommitted",
    },
    {
      id: "text-overlay.double-click.edits-text",
      trigger: "double-click on overlay",
      behavior: "Re-enters text editing inside the overlay.",
      action: "textOverlay/editEnteredCommitted",
    },
  ],
  options: [
    { kind: "number", id: "fontSize", label: "Size", default: 24, min: 6, max: 288, unit: "pt" },
    { kind: "color", id: "color", label: "Color", default: "#ffffff" },
    { kind: "boolean", id: "bold", label: "Bold", default: false },
    { kind: "boolean", id: "italic", label: "Italic", default: false },
    {
      kind: "enum",
      id: "align",
      label: "Alignment",
      default: "left",
      values: ["left", "center", "right"],
    },
    { kind: "number", id: "opacity", label: "Opacity", default: 100, min: 0, max: 100, unit: "%" },
  ],
  panels: ["photo-overlays", "photo-history"],
  undo: "per-gesture",
  notes: [
    "Thin coverage — the entire overlay capability rests on one word in PLAN.md §6.5's recipe vocabulary ('…recolor/tint, overlays, and mask-scoped ops'); §3.3 is cited for the character formatting basics only, and which subset applies in photo mode is unstated. Every gesture here is Publisher-parity (WordArt-like text-on-photo) pending SME review.",
    "Photo mode has no object stack (tolerancePx 0) — overlay bounds are overlay-layer targets, sitting above the image and ordered within the recipe.",
    "text-overlay.double-click.edits-text enters an editing mode without mutating the recipe — its action carries no Committed suffix.",
    "Font family binds to the document font list, which a closed enum OptionSpec cannot enumerate — the family picker is carried by the options bar against doc.fonts, not by an OptionSpec; flagged as a registry-representation gap.",
    "ASSUMPTION: every option range and default (size, white default color, opacity) — no source states any of them.",
  ],
};

export const imageOverlayTool: ToolContract = {
  id: "image-overlay",
  label: "Image overlay",
  mode: "photo",
  group: "photo",
  shortcut: "I",
  req: ["§4.1"],
  tier: "LIVE",
  cursor: "copy",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "image-overlay.place.inserts-image",
      trigger: "click on image with source chosen",
      behavior:
        "Inserts the chosen second image (logo, watermark, sticker) at default size at the click point as a recipe overlay op.",
      action: "imageOverlay/placedCommitted",
    },
    {
      id: "image-overlay.drag.moves-overlay",
      trigger: "drag on existing overlay",
      behavior: "Moves the overlay with the pointer; one commit on release.",
      action: "imageOverlay/movedCommitted",
    },
    {
      id: "image-overlay.drag-handle.scales-overlay",
      trigger: "drag on overlay handle",
      behavior: "Scales the overlay from the dragged handle; Shift preserves aspect.",
      action: "imageOverlay/scaledCommitted",
    },
    {
      id: "image-overlay.drag-rotate.rotates-overlay",
      trigger: "drag on rotation handle",
      behavior: "Rotates the overlay freely; one commit on release.",
      action: "imageOverlay/rotatedCommitted",
    },
  ],
  options: [
    { kind: "number", id: "opacity", label: "Opacity", default: 100, min: 0, max: 100, unit: "%" },
    {
      kind: "enum",
      id: "blend",
      label: "Blend",
      default: "normal",
      values: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "softLight"],
    },
  ],
  panels: ["photo-overlays", "photo-history"],
  undo: "per-gesture",
  notes: [
    "Thin coverage — same one-word basis as the text overlay (PLAN.md §6.5 '…overlays, and mask-scoped ops'); §4.1 is cited for insertion from local files and clipboard only. Every placement/transform gesture is parity pending SME review.",
    "Photo mode has no object stack (tolerancePx 0) — overlay bounds are overlay-layer targets above the image, ordered within the recipe.",
    "This contract covers placement and transform of an already-loaded asset; file ingest for camera formats (HEIC decode) is a dev-team seam on the import path (PLAN.md §6.5 seam list), not on this tool.",
    "ASSUMPTION: default-size placement, Shift aspect lock, rotation handle, opacity default, and the blend value set — §2.2's blend list belongs to layers, not overlays; borrowing its minimum set here is a working guess.",
  ],
};

export const photoEyedropperTool: ToolContract = {
  id: "photo-eyedropper",
  label: "Eyedropper",
  mode: "photo",
  group: "photo",
  shortcut: "E",
  req: ["§12.2"],
  tier: "LIVE",
  cursor: "crosshair",
  creates: null,
  hitTest: SINGLE_IMAGE_SURFACE,
  gestures: [
    {
      id: "photo-eyedropper.click.samples-color",
      trigger: "click on image",
      behavior:
        "Samples the pixel color under the pointer from the composited proxy (overlays included) into the active color target.",
      action: "photoEyedropper/sampleCommitted",
    },
    {
      id: "photo-eyedropper.drag.previews-sample",
      trigger: "drag",
      behavior:
        "Live-previews the color under the cursor while dragging; the sample under the pointer at release becomes the active color.",
      action: "photoEyedropper/sampleCommitted",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "sampleSize",
      label: "Sample size",
      default: "point",
      values: ["point", "3x3", "5x5"],
    },
  ],
  panels: ["photo-adjustments", "photo-overlays"],
  undo: "none",
  notes: [
    "Samples state, mutates nothing — undo 'none': the sampled color feeds overlay styling and recolor/tint targets but never touches the recipe or document history.",
    "Distinct from the layout-mode Eyedropper / format painter (§4.1 #19): that tool copies object formatting per §12.2 'Copy formatting'; this one samples a pixel color. §12.2 is the nearest doc hook — no photo-sampling requirement exists in the doc.",
    "Thin coverage — photo-mode color sampling is entirely parity; flagged for SME review.",
    "The whole image is the sample surface (tolerancePx 0) — no object hit-testing; sampling reads the composited proxy including overlays.",
    "ASSUMPTION: click/drag sampling gestures and the sample-size value set — no source states them.",
  ],
};

export const photoTools: readonly ToolContract[] = [
  photoCropTool,
  photoAdjustTool,
  maskBrushTool,
  maskMarqueeTool,
  textOverlayTool,
  imageOverlayTool,
  photoEyedropperTool,
];
