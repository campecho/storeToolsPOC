"use client";

import { Fragment } from "react";
import type { CanvasImageLayout } from "./PhotoCanvas";

/**
 * The straighten alignment grid (wire Section B "Crop & straighten" straighten
 * control). Mounts over the whole displayed image box while a straighten is being
 * previewed (`activeTool === "crop" && previewOp?.op === "straighten"`). A fine
 * 9 × 9 lattice with emphasized thirds gives the associate straight references to
 * align the horizon against while the slider drives the rotation.
 *
 * Non-interactive by design — the slider is the only entry surface in PE2 (canvas
 * drag-rotate is out of scope), so the grid is pure `pointer-events: none` chrome.
 */
export function StraightenOverlay({ layout }: { layout: CanvasImageLayout }) {
  const { x, y, w, h } = layout;
  const divisions = 9;
  const lines: React.ReactNode[] = [];

  for (let i = 1; i < divisions; i++) {
    const third = i === 3 || i === 6;
    const stroke = third ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.28)";
    const gx = x + (w * i) / divisions;
    const gy = y + (h * i) / divisions;
    lines.push(
      <Fragment key={i}>
        <line x1={gx} y1={y} x2={gx} y2={y + h} stroke={stroke} strokeWidth={1} />
        <line x1={x} y1={gy} x2={x + w} y2={gy} stroke={stroke} strokeWidth={1} />
      </Fragment>,
    );
  }

  return (
    <svg
      data-testid="photo-straighten-overlay"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      {/* framing border so the grid reads as the image box */}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={1} />
      {lines}
    </svg>
  );
}
