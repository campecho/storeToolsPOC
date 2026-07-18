"use client";

import { useRef } from "react";
import type { PhotoOp, PixelRect } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { foldOverlays, type OverlayOp } from "@/lib/photo/overlay-raster";
import type { CanvasImageLayout } from "./PhotoCanvas";

/**
 * Text / logo overlay handles (wire Section B note: "Same handles as the Layout
 * Editor — drag to place, corners to scale, top handle to rotate"). Mounts inside
 * the PhotoCanvas container while the Text & image tool is active and an overlay
 * is selected (PE6). It MIRRORS the layout editor's picture-frame handle behavior
 * (`SelectionOverlay` + `CanvasViewport.startResize/startRotate` + `objects.ts`
 * `resizeRotatedBBox`), retargeted from page inches to effective-master px:
 *
 *   • CORNERS SCALE — 4 corner handles resize UNIFORMLY (aspect preserved, the
 *     dominant axis wins, like `resizeBBox`'s preserveAspect corner path) about
 *     the OPPOSITE corner, which stays fixed in world space through the rotation
 *     (the `resizeRotatedBBox` anchor trick). For text the font size scales by the
 *     same factor so "corners to scale" scales the whole word, not just the box.
 *   • TOP HANDLE ROTATES — a lollipop above the top edge; the angle reads by the
 *     DELTA from the grab (Shift snaps to 15°), exactly like `startRotate`.
 *   • DRAG INSIDE MOVES — the box translates by the pointer delta ("drag to place").
 *
 * Like `CropOverlay` it consumes `CanvasImageLayout` (box in effective-master px;
 * `scale` = CSS px per master px) and uses pointer capture. A gesture emits the
 * live `previewOp` each move (the canvas draws the TRUE rotated box from it) and
 * commits ONE coalesced `pushOp` on release (same-tag+id coalesce collapses the
 * whole drag to one history step). Clicking empty canvas deselects.
 */

const HANDLE = 12;
const ROTATE_ARM = 22;
const MIN_OVERLAY_PX = 8;

type Corner = "nw" | "ne" | "sw" | "se";

const CORNERS: { dir: Corner; fx: number; fy: number; cursor: string }[] = [
  { dir: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { dir: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { dir: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { dir: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
];

/** Rotate a point about a center by `deg` (the matrix CSS `rotate()` applies). */
function rotatePt(x: number, y: number, cx: number, cy: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Angle (deg, clockwise, 0 = straight up) from a center to a point. */
function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
}

function snapAngle(deg: number, step = 15): number {
  return Math.round(deg / step) * step;
}

/**
 * Uniform corner resize about the opposite corner, in master px — the
 * `resizeRotatedBBox` algorithm with preserveAspect forced on for corners.
 */
function resizeCornerUniform(
  start: PixelRect,
  dir: Corner,
  dxm: number,
  dym: number,
  rotation: number,
): PixelRect {
  const c0x = start.x + start.w / 2;
  const c0y = start.y + start.h / 2;
  // the corner opposite the dragged handle — fixed in world space
  const anchorX = dir.includes("e") ? start.x : start.x + start.w;
  const anchorY = dir.includes("s") ? start.y : start.y + start.h;
  const anchorWorld = rotatePt(anchorX, anchorY, c0x, c0y, rotation);

  // pointer delta → local (un-rotated) axes, resize the local rect
  const local = rotatePt(dxm, dym, 0, 0, -rotation);
  let { x, y, w, h } = start;
  if (dir.includes("e")) w = start.w + local.x;
  if (dir.includes("w")) {
    w = start.w - local.x;
    x = start.x + local.x;
  }
  if (dir.includes("s")) h = start.h + local.y;
  if (dir.includes("n")) {
    h = start.h - local.y;
    y = start.y + local.y;
  }
  // uniform: scale both axes by the dominant one
  if (start.w > 0 && start.h > 0) {
    const scale = Math.max(w / start.w, h / start.h);
    w = start.w * scale;
    h = start.h * scale;
  }
  if (w < MIN_OVERLAY_PX) {
    if (dir.includes("w")) x = start.x + start.w - MIN_OVERLAY_PX;
    w = MIN_OVERLAY_PX;
  }
  if (h < MIN_OVERLAY_PX) {
    if (dir.includes("n")) y = start.y + start.h - MIN_OVERLAY_PX;
    h = MIN_OVERLAY_PX;
  }

  // put the anchor corner back where it was in world space (about the new center)
  const c1x = x + w / 2;
  const c1y = y + h / 2;
  const anchorNow = rotatePt(anchorX, anchorY, c1x, c1y, rotation);
  return { x: x + (anchorWorld.x - anchorNow.x), y: y + (anchorWorld.y - anchorNow.y), w, h };
}

type Drag =
  | { kind: "move"; startX: number; startY: number; startBox: PixelRect }
  | { kind: "resize"; dir: Corner; startX: number; startY: number; startBox: PixelRect; startFontSize: number }
  | { kind: "rotate"; cxScreen: number; cyScreen: number; grabAngle: number; startRotation: number };

export function OverlayHandles({ layout }: { layout: CanvasImageLayout }) {
  const doc = usePhotoStore((s) => s.doc);
  const selectedOverlayId = usePhotoStore((s) => s.selectedOverlayId);
  const setSelectedOverlayId = usePhotoStore((s) => s.setSelectedOverlayId);
  const previewOp = usePhotoStore((s) => s.previewOp);
  const setPreviewOp = usePhotoStore((s) => s.setPreviewOp);
  const pushOp = usePhotoStore((s) => s.pushOp);

  const drag = useRef<Drag | null>(null);
  const pending = useRef<PhotoOp | null>(null);

  const { x, y, scale } = layout;

  // The selected overlay from the shared fold; the live preview (if a drag of THIS
  // overlay is in flight) wins so the ring tracks the drag.
  const applied = doc ? doc.recipe.slice(0, doc.cursor) : [];
  const base = foldOverlays(applied).find((o) => o.id === selectedOverlayId) ?? null;
  const previewOverlay: OverlayOp | null =
    previewOp && (previewOp.op === "textOverlay" || previewOp.op === "logoOverlay") && previewOp.id === selectedOverlayId
      ? previewOp
      : null;
  const current: OverlayOp | null = previewOverlay ?? base;

  const isText = current?.op === "textOverlay";
  const moveLabel = isText ? "Move text" : "Move image";
  const resizeLabel = isText ? "Resize text" : "Resize image";
  const rotateLabel = isText ? "Rotate text" : "Rotate image";

  const emit = (op: PhotoOp) => {
    pending.current = op;
    setPreviewOp(op);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || !current) return;
    if (g.kind === "move") {
      const dxm = (e.clientX - g.startX) / scale;
      const dym = (e.clientY - g.startY) / scale;
      const box = { ...g.startBox, x: g.startBox.x + dxm, y: g.startBox.y + dym };
      emit({ ...current, box, label: moveLabel });
    } else if (g.kind === "resize") {
      const dxm = (e.clientX - g.startX) / scale;
      const dym = (e.clientY - g.startY) / scale;
      const box = resizeCornerUniform(g.startBox, g.dir, dxm, dym, current.rotation);
      if (current.op === "textOverlay") {
        const factor = g.startBox.w > 0 ? box.w / g.startBox.w : 1;
        emit({
          ...current,
          box,
          font: { ...current.font, size: Math.max(1, Math.round(g.startFontSize * factor)) },
          label: resizeLabel,
        });
      } else {
        emit({ ...current, box, label: resizeLabel });
      }
    } else {
      const ang = angleFromCenter(g.cxScreen, g.cyScreen, e.clientX, e.clientY);
      let rot = g.startRotation + (ang - g.grabAngle);
      if (e.shiftKey) rot = snapAngle(rot);
      emit({ ...current, rotation: rot, label: rotateLabel });
    }
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const op = pending.current;
    pending.current = null;
    // Commit ONE coalesced step (pushOp clears the previewOp via CLEAR_DRAFT).
    if (op) pushOp(op, { coalesce: true });
  };

  const capture = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const startMove = (e: React.PointerEvent) => {
    if (e.button !== 0 || !current) return;
    e.stopPropagation();
    e.preventDefault();
    capture(e);
    drag.current = { kind: "move", startX: e.clientX, startY: e.clientY, startBox: current.box };
  };

  const startResize = (dir: Corner) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !current) return;
    e.stopPropagation();
    e.preventDefault();
    capture(e);
    drag.current = {
      kind: "resize",
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startBox: current.box,
      startFontSize: current.op === "textOverlay" ? current.font.size : 0,
    };
  };

  const startRotate = (e: React.PointerEvent) => {
    if (e.button !== 0 || !current) return;
    e.stopPropagation();
    e.preventDefault();
    capture(e);
    const cx = x + (current.box.x + current.box.w / 2) * scale;
    const cy = y + (current.box.y + current.box.h / 2) * scale;
    drag.current = {
      kind: "rotate",
      cxScreen: cx,
      cyScreen: cy,
      grabAngle: angleFromCenter(cx, cy, e.clientX, e.clientY),
      startRotation: current.rotation,
    };
  };

  return (
    <div
      data-testid="photo-overlay-handles"
      className="pointer-events-none absolute inset-0"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Deselect layer — an empty-canvas press clears the selection. Sits behind
          the box, so a press on the box/handles targets those, never this. */}
      <div
        data-testid="overlay-deselect"
        className="absolute inset-0"
        style={{ pointerEvents: "auto" }}
        onPointerDown={() => setSelectedOverlayId(null)}
      />

      {current && (
        <div
          data-testid="overlay-box"
          className="absolute border-[1.5px] border-brand"
          style={{
            left: x + current.box.x * scale,
            top: y + current.box.y * scale,
            width: current.box.w * scale,
            height: current.box.h * scale,
            transform: current.rotation ? `rotate(${current.rotation}deg)` : undefined,
            transformOrigin: "center",
            pointerEvents: "none",
          }}
        >
          {/* drag-inside-to-move */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: "auto", cursor: "move", touchAction: "none" }}
            onPointerDown={startMove}
          />

          {/* rotate lollipop above the top edge */}
          <div
            className="pointer-events-none absolute bg-brand"
            style={{ left: "calc(50% - 0.5px)", top: -ROTATE_ARM, width: 1, height: ROTATE_ARM }}
          />
          <div
            data-testid="overlay-handle-rotate"
            onPointerDown={startRotate}
            className="absolute rounded-full border border-brand bg-white"
            style={{
              width: HANDLE,
              height: HANDLE,
              left: `calc(50% - ${HANDLE / 2}px)`,
              top: -ROTATE_ARM - HANDLE / 2,
              cursor: "grab",
              pointerEvents: "auto",
              touchAction: "none",
            }}
          />

          {/* 4 corner scale handles */}
          {CORNERS.map((c) => (
            <div
              key={c.dir}
              data-testid={`overlay-handle-${c.dir}`}
              onPointerDown={startResize(c.dir)}
              className="absolute border border-brand bg-white"
              style={{
                width: HANDLE,
                height: HANDLE,
                left: `calc(${c.fx * 100}% - ${HANDLE / 2}px)`,
                top: `calc(${c.fy * 100}% - ${HANDLE / 2}px)`,
                cursor: c.cursor,
                pointerEvents: "auto",
                touchAction: "none",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
