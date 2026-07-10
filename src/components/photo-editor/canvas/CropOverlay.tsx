"use client";

import { useRef, useState } from "react";
import type { PixelRect } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { effectiveDpi, moveCropRect, resizeCropRect, type CropHandle } from "@/lib/photo/geometry";
import { CROP_PRESETS } from "@/lib/photo/sizes";
import type { CanvasImageLayout } from "./PhotoCanvas";

/**
 * Crop chrome (wire Section A "CROP overlay", ~lines 145–165). Mounts inside the
 * PhotoCanvas container while the Crop tool is active and a `cropDraft` exists.
 * It renders the wire's dimmed mask outside the draft rect, a rule-of-thirds
 * grid, a light shape outline, eight pointer-capture handles, a drag-inside move
 * region, and a floating size/DPI chip — all writing back through `setCropDraft`.
 *
 * Geometry: the draft rect is in effective-MASTER pixels; `layout` gives the
 * displayed image box (CSS px) and the display scale (CSS px per effective-master
 * px). Screen deltas convert to master px by dividing by that scale, and the
 * rect math is delegated to `resizeCropRect` / `moveCropRect` so the overlay and
 * the geometry lib never disagree. Chrome is neutral (white/dark per the wire's
 * grayscale) — the active red belongs to the rail/panel, not here.
 */

type Drag =
  | { kind: "move"; startX: number; startY: number; startRect: PixelRect }
  | { kind: "resize"; handle: CropHandle; startX: number; startY: number; startRect: PixelRect };

const HANDLES: { id: CropHandle; fx: number; fy: number; cursor: string }[] = [
  { id: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { id: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

/** The nominal aspect (w/h) driving a locked drag, matching CropPanel exactly:
    Free → null; Original → the current effective-image aspect; else the preset.
    `resizeCropRect` auto-orients (tries ratio and 1/ratio), so the nominal value
    is all it needs. */
function ratioForId(id: string, image: { w: number; h: number }): number | null {
  if (id === "free") return null;
  if (id === "original") return image.h > 0 ? image.w / image.h : null;
  const preset = CROP_PRESETS.find((p) => p.id === id);
  return preset?.ratio ?? null;
}

export function CropOverlay({ layout }: { layout: CanvasImageLayout }) {
  const doc = usePhotoStore((s) => s.doc);
  const cropDraft = usePhotoStore((s) => s.cropDraft);
  const setCropDraft = usePhotoStore((s) => s.setCropDraft);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<null | "move" | CropHandle>(null);

  if (!doc || !cropDraft) return null;

  const { x, y, w, h, scale, image } = layout;
  const rect = cropDraft.rect;
  const shape = cropDraft.shape;
  const ratio = ratioForId(cropDraft.ratioId, image);

  // Draft rect in CSS px within the container.
  const rx = x + rect.x * scale;
  const ry = y + rect.y * scale;
  const rw = rect.w * scale;
  const rh = rect.h * scale;
  const roundedR = 0.08 * Math.min(rw, rh);

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    // CSS delta → effective-master px.
    const dx = (e.clientX - g.startX) / scale;
    const dy = (e.clientY - g.startY) / scale;
    const nextRect =
      g.kind === "move"
        ? moveCropRect(g.startRect, dx, dy, image)
        : resizeCropRect(g.startRect, g.handle, dx, dy, ratio, image);
    setCropDraft({ ...cropDraft, rect: nextRect });
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setActive(null);
  };

  const startResize = (handle: CropHandle) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", handle, startX: e.clientX, startY: e.clientY, startRect: rect };
    setActive(handle);
  };

  const startMove = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { kind: "move", startX: e.clientX, startY: e.clientY, startRect: rect };
    setActive("move");
  };

  // Floating chip: draft dims in effective-master px, plus DPI once a print target
  // is set (null in PE2 — the branch lights up in PE5). Below-right of the rect,
  // flipping inside when it would clip past the image box bottom.
  const size = doc.target.size;
  const dpi = size ? effectiveDpi({ w: rect.w, h: rect.h }, size) : null;
  const chipText = `${Math.round(rect.w)} × ${Math.round(rect.h)} px${dpi ? ` · ${dpi} DPI` : ""}`;
  const chipFlipUp = ry + rh + 8 + 24 > y + h;
  const chipTop = chipFlipUp ? ry + rh - 26 : ry + rh + 8;
  const chipLeft = Math.min(rx + rw, x + w);

  const shapeStroke = (stroke: string, width: number) =>
    shape === "circle" ? (
      <ellipse
        cx={rx + rw / 2}
        cy={ry + rh / 2}
        rx={rw / 2}
        ry={rh / 2}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
      />
    ) : (
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        rx={shape === "rounded" ? roundedR : 0}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
      />
    );

  const moveCursor = active === "move" ? "grabbing" : "grab";

  return (
    <div
      data-testid="photo-crop-overlay"
      className="pointer-events-none absolute inset-0"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Mask + rule-of-thirds + shape outline — visual only. */}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        style={{ pointerEvents: "none" }}
        aria-hidden
      >
        <defs>
          <mask id="photo-crop-mask">
            <rect x={x} y={y} width={w} height={h} fill="white" />
            {shape === "circle" ? (
              <ellipse cx={rx + rw / 2} cy={ry + rh / 2} rx={rw / 2} ry={rh / 2} fill="black" />
            ) : (
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                rx={shape === "rounded" ? roundedR : 0}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="rgba(23,23,23,.34)"
          mask="url(#photo-crop-mask)"
        />
        {/* rule-of-thirds */}
        <g stroke="rgba(255,255,255,.6)" strokeWidth={1}>
          <line x1={rx + rw / 3} y1={ry} x2={rx + rw / 3} y2={ry + rh} />
          <line x1={rx + (2 * rw) / 3} y1={ry} x2={rx + (2 * rw) / 3} y2={ry + rh} />
          <line x1={rx} y1={ry + rh / 3} x2={rx + rw} y2={ry + rh / 3} />
          <line x1={rx} y1={ry + (2 * rh) / 3} x2={rx + rw} y2={ry + (2 * rh) / 3} />
        </g>
        {/* outline: dark halo then light stroke for contrast on any image */}
        {shapeStroke("rgba(0,0,0,.28)", 3)}
        {shapeStroke("#ffffff", 1.5)}
      </svg>

      {/* Drag-inside-to-move region. */}
      <div
        data-testid="crop-move-region"
        className="absolute"
        style={{
          left: rx,
          top: ry,
          width: rw,
          height: rh,
          pointerEvents: "auto",
          cursor: moveCursor,
        }}
        onPointerDown={startMove}
      />

      {/* Eight handles — white squares with a subtle border and a padded hit box. */}
      {HANDLES.map((hnd) => (
        <div
          key={hnd.id}
          data-testid={`crop-handle-${hnd.id}`}
          className="absolute flex items-center justify-center"
          style={{
            left: rx + hnd.fx * rw,
            top: ry + hnd.fy * rh,
            width: 16,
            height: 16,
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
            cursor: hnd.cursor,
            touchAction: "none",
          }}
          onPointerDown={startResize(hnd.id)}
        >
          <span
            className="block"
            style={{
              width: 10,
              height: 10,
              background: "#ffffff",
              border: "1px solid #777",
              borderRadius: 2,
              boxShadow: "0 0 0 1px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.28)",
            }}
          />
        </div>
      ))}

      {/* Floating size / DPI chip. */}
      <div
        data-testid="crop-chip"
        className="pointer-events-none absolute whitespace-nowrap rounded-[5px] border border-[#e2e2e2] bg-white px-[9px] py-[3px] text-[10px] text-[#666] shadow-[0_1px_3px_rgba(0,0,0,.14)]"
        style={{ left: chipLeft, top: chipTop, transform: "translateX(-100%)" }}
      >
        {chipText}
      </div>
    </div>
  );
}
