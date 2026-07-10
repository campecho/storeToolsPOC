"use client";

import { usePhotoStore } from "@/lib/store/photo-store";
import { bleedPx } from "@/lib/photo/bleed";
import type { CanvasImageLayout } from "./PhotoCanvas";

/**
 * Trim / bleed / safe print guides (wire Section A canvas overlay + Section C
 * fix-bleed before/after, ~735–807). A NON-INTERACTIVE overlay (pointer-events
 * none) positioned off CanvasImageLayout exactly like CropOverlay, using the
 * layout editor's dashed-guide visual language (PageSurface: red-dashed bleed,
 * blue-dashed margin/safe). Rendered by PhotoCanvas whenever a target size is set
 * and the crop tool ISN'T active (the crop overlay owns that surface) — toggle-free
 * at PE5.
 *
 * ── POC MAPPING ASSUMPTION (documented) ──
 * The image box IS the artwork. The guides map onto it in two states:
 *
 *   • BEFORE a bleedExpand op — the image edge is the TRIM line. The BLEED line is
 *     drawn OUTSIDE it (dashed), offset by `bleedPx(target.bleed, …) × scale`, and
 *     the pasteboard's overflow-hidden clips whatever spills past the canvas.
 *
 *   • AFTER a bleedExpand op is applied — the image now INCLUDES the bleed, so the
 *     image edge is the BLEED line and the TRIM sits INSET by the op's stored
 *     `px × scale` (the pixels the expansion actually added per edge).
 *
 * In both states SAFE = TRIM inset by 0.125 in, converted at the strip's effective
 * DPI (`bleedPx(0.125, …) × scale`) — a guide visual, not press geometry; the
 * server render host owns the real trim/bleed boxes (pdf-wrap.ts). This is a
 * screen approximation and is intentionally decoupled from the exact per-inch
 * math the export performs.
 */

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function inset(r: Rect, d: number): Rect {
  return { left: r.left + d, top: r.top + d, width: r.width - 2 * d, height: r.height - 2 * d };
}
function outset(r: Rect, d: number): Rect {
  return { left: r.left - d, top: r.top - d, width: r.width + 2 * d, height: r.height + 2 * d };
}

export function GuideChrome({ layout }: { layout: CanvasImageLayout }) {
  const doc = usePhotoStore((s) => s.doc);
  if (!doc || !doc.target.size) return null;

  const size = doc.target.size;
  const { x, y, w, h, scale, image } = layout;

  // The applied bleedExpand op (if any) flips the mapping (see header).
  const appliedOps = doc.recipe.slice(0, doc.cursor);
  const bleedOp = [...appliedOps].reverse().find((o) => o.op === "bleedExpand");
  const bleedApplied = bleedOp?.op === "bleedExpand" ? bleedOp : null;

  // Safe margin: 0.125 in inset from trim, at the strip's effective DPI.
  const safeCss = bleedPx(0.125, image, size) * scale;

  const imageBox: Rect = { left: x, top: y, width: w, height: h };
  let trim: Rect;
  let bleed: Rect | null = null;

  if (bleedApplied) {
    // Image edge = bleed; trim sits inset by the op's stored px.
    bleed = imageBox;
    trim = inset(imageBox, bleedApplied.px * scale);
  } else {
    // Image edge = trim; bleed drawn outside (only when a bleed is planned).
    trim = imageBox;
    if (doc.target.bleed > 0) {
      bleed = outset(imageBox, bleedPx(doc.target.bleed, image, size) * scale);
    }
  }

  const safe = inset(trim, safeCss);
  const safeVisible = safe.width > 2 && safe.height > 2;

  return (
    <div
      data-testid="photo-guide-chrome"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* BLEED — red dashed (the cut-safe outer line). */}
      {bleed && (
        <div
          data-guide="bleed"
          className="absolute"
          style={{
            left: bleed.left,
            top: bleed.top,
            width: bleed.width,
            height: bleed.height,
            border: "1.5px dashed var(--color-brand)",
          }}
        />
      )}

      {/* TRIM — the neutral solid cut line. */}
      <div
        data-guide="trim"
        className="absolute"
        style={{
          left: trim.left,
          top: trim.top,
          width: trim.width,
          height: trim.height,
          border: "1px solid #8a8a8a",
        }}
      />

      {/* SAFE — blue dashed keep-inside line (layout editor's margin colour). */}
      {safeVisible && (
        <div
          data-guide="safe"
          className="absolute"
          style={{
            left: safe.left,
            top: safe.top,
            width: safe.width,
            height: safe.height,
            border: "1px dashed var(--color-guide)",
          }}
        />
      )}

      {/* Legend card, bottom-right. */}
      <div
        data-testid="photo-guide-legend"
        className="absolute bottom-3 right-3 flex flex-col gap-[5px] rounded-[6px] border border-[#e2e2e2] bg-white/95 px-[10px] py-[7px] shadow-[0_1px_3px_rgba(0,0,0,.14)]"
      >
        <LegendRow label="Trim" swatch={<span className="block h-0 w-[16px] border-t border-solid border-[#8a8a8a]" />} />
        <LegendRow
          label="Bleed"
          swatch={<span className="block h-0 w-[16px] border-t-[1.5px] border-dashed" style={{ borderColor: "var(--color-brand)" }} />}
        />
        <LegendRow
          label="Safe"
          swatch={<span className="block h-0 w-[16px] border-t border-dashed" style={{ borderColor: "var(--color-guide)" }} />}
        />
      </div>
    </div>
  );
}

function LegendRow({ label, swatch }: { label: string; swatch: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[7px]">
      {swatch}
      <span className="text-[9.5px] text-[#888]">{label}</span>
    </div>
  );
}
