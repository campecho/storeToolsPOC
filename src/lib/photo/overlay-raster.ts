/**
 * Text & image overlays — the shared client raster module (plan §3.3, §4 PE6).
 *
 * BROWSER-ONLY for the raster functions: `rasterizeOverlay` / `paintOverlayContent`
 * touch a `<canvas>`, `document.fonts`, and `createImageBitmap`, so they run only
 * in the editor client. `foldOverlays` and `overlayPlacement` are PURE (no DOM,
 * no canvas) and isomorphic — unit-tested away from the surface.
 *
 * ── ONE FOLD, ONE PLACEMENT (the single sources of truth) ──
 * `foldOverlays(ops)` is THE fold every consumer shares — the canvas preview, the
 * Text & image panel's layer list, and the export sidecar (client.ts) all call it,
 * so they never disagree about which overlays exist or in what order. Overlay ops
 * fold LAST-WINS PER `id` over the applied slice (the adjust-setpoint precedent):
 *   • the latest op for each id replaces earlier ones (a drag/edit is a whole-op
 *     upsert with the SAME id — the store coalesces the history step);
 *   • `hidden: true` is the remove-TOMBSTONE — a folded id whose latest op is
 *     hidden drops out entirely;
 *   • render / z order = FIRST-APPEARANCE order of each id (the order the overlay
 *     was added; later edits never reorder it).
 *
 * `overlayPlacement(op)` is THE placement — the axis-aligned bounding box (AABB)
 * of the op's (possibly rotated) box, in effective-master px. It is used by BOTH
 * the export sidecar (the AABB is the FINAL-OUTPUT placement the server composites
 * at) AND as the raster's declared size, so the emitted PNG's decoded dims EQUAL
 * the declared width/height (the server contract). Rotation is BAKED into the
 * raster: rather than clipping a rotated box's corners, we rasterize the ROTATED
 * BOUNDING BOX and declare THAT as the placement — corners are preserved, the
 * server places a plain upright PNG, and one AABB drives both sides.
 *
 * The on-canvas PREVIEW does NOT use the raster/AABB — it draws the TRUE rotated
 * box live via ctx transforms (crisp, no re-encode). The AABB is export-only.
 *
 * NO WRAP at POC: text is a single line (documented) — long text overflows its
 * box rather than wrapping. A wrapped/measured text layout is a later tranche.
 *
 * The `hidden` field is being added to the overlay op schemas by the server
 * sibling (`hidden: boolean?`). This module reads it through a cast (`isHidden`)
 * and writes it through `hideOverlayOp`, so it compiles against the current
 * schema and stays correct once the field lands.
 */

import type { PhotoOp } from "@/lib/schema/photo";
import { fontStack } from "@/lib/layout/font-catalog";
import { ensureFamiliesLoaded } from "@/lib/layout/webfonts";
import { getAssetUrl } from "@/lib/assets/blob-store";

/** The two overlay op shapes, narrowed off the recipe union. */
export type TextOverlayOp = Extract<PhotoOp, { op: "textOverlay" }>;
export type LogoOverlayOp = Extract<PhotoOp, { op: "logoOverlay" }>;
export type OverlayOp = TextOverlayOp | LogoOverlayOp;

/** The remove-tombstone flag (server-sibling schema addition). Read via a cast so
    this module compiles against the current schema and once `hidden` lands. */
function isHidden(op: OverlayOp): boolean {
  return (op as { hidden?: boolean }).hidden === true;
}

/**
 * Fold a recipe (already sliced to the applied ops) to the VISIBLE overlays, in
 * z order (first-appearance of each id), last-wins per id, tombstones dropped.
 * The single fold every overlay consumer shares.
 */
export function foldOverlays(ops: PhotoOp[]): OverlayOp[] {
  const order: string[] = []; // first-appearance order of each id
  const latest = new Map<string, OverlayOp>();
  for (const op of ops) {
    if (op.op !== "textOverlay" && op.op !== "logoOverlay") continue;
    if (!latest.has(op.id)) order.push(op.id);
    latest.set(op.id, op);
  }
  const out: OverlayOp[] = [];
  for (const id of order) {
    const op = latest.get(id)!;
    if (!isHidden(op)) out.push(op); // hidden = removed
  }
  return out;
}

export interface OverlayPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The AABB of the op's rotated box, in effective-master px — the export placement
 * AND the raster's declared size (one source of truth). ALL FOUR are integers
 * (the server contract types left/top/width/height as ints; width/height must
 * equal the decoded PNG dims). left/top keep the box's center to within rounding.
 */
export function overlayPlacement(op: OverlayOp): OverlayPlacement {
  const { w, h } = op.box;
  const rad = (op.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = Math.max(1, Math.round(w * cos + h * sin));
  const height = Math.max(1, Math.round(w * sin + h * cos));
  const cx = op.box.x + w / 2;
  const cy = op.box.y + h / 2;
  return { left: Math.round(cx - width / 2), top: Math.round(cy - height / 2), width, height };
}

/**
 * Paint one overlay's CONTENT centered at the current transform origin (the caller
 * has already translated to the box center and rotated). Sync — shared by the
 * export raster and the on-canvas preview so both draw the box identically.
 *   `scale` = px per effective-master px (1 in export space; the display scale on
 *   the preview canvas). Text sizes and the box both scale by it.
 *   `image` = a decoded logo bitmap for a logoOverlay (null skips the draw until
 *   the bytes load); ignored for text.
 */
export function paintOverlayContent(
  ctx: CanvasRenderingContext2D,
  op: OverlayOp,
  scale: number,
  image: CanvasImageSource | null,
): void {
  const bw = op.box.w * scale;
  const bh = op.box.h * scale;
  if (op.op === "textOverlay") {
    const weight = op.font.bold ? "700" : "400";
    const style = op.font.italic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${op.font.size * scale}px ${fontStack(op.font.family)}`;
    ctx.fillStyle = op.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = op.align;
    // Single line, NO WRAP at POC (documented) — long text overflows the box.
    const x = op.align === "left" ? -bw / 2 : op.align === "right" ? bw / 2 : 0;
    ctx.fillText(op.text, x, 0);
  } else if (image) {
    ctx.drawImage(image, -bw / 2, -bh / 2, bw, bh);
  }
}

/** Decode a logo overlay's stored bytes to a drawable bitmap (browser-only). */
async function loadOverlayImage(assetId: string): Promise<CanvasImageSource | null> {
  const url = await getAssetUrl(assetId);
  if (!url) return null;
  const res = await fetch(url);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Rasterize an overlay to a PNG at the AABB placement × `scale` (BROWSER-ONLY).
 * Rotation is baked (rotate about the AABB center, box painted centered). The
 * returned width/height EQUAL the PNG's decoded dims — the server contract. Used
 * by the export sidecar at scale 1 (export space == effective-master space).
 */
export async function rasterizeOverlay(
  op: OverlayOp,
  scale: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const place = overlayPlacement(op);
  const width = Math.max(1, Math.round(place.width * scale));
  const height = Math.max(1, Math.round(place.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("overlay raster: no 2d context");

  let image: CanvasImageSource | null = null;
  if (op.op === "textOverlay") {
    await ensureFamiliesLoaded([op.font.family]); // fonts live client-side
  } else {
    image = await loadOverlayImage(op.assetId);
  }

  ctx.translate(width / 2, height / 2);
  ctx.rotate((op.rotation * Math.PI) / 180);
  paintOverlayContent(ctx, op, scale, image);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("overlay raster: toBlob produced no bytes");
  return { blob, width, height };
}

/**
 * The remove-tombstone op for an overlay — the same-id op with `hidden: true`
 * (which `foldOverlays` drops) and a fresh history label. Cast because the schema
 * `hidden` field is a server-sibling addition (see `isHidden`).
 */
export function hideOverlayOp(op: OverlayOp, label: string): PhotoOp {
  return { ...op, hidden: true, label } as PhotoOp;
}
