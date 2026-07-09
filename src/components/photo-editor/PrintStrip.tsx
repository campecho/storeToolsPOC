"use client";

import { Clock } from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";
import { effectiveDims } from "@/lib/photo/geometry";

/**
 * Print-correctness strip (wire region 4), pinned above the canvas. The pixel
 * dims segment reflects the EFFECTIVE image (the master with the applied recipe,
 * ops[0..cursor)) so it tracks crops/rotates live under undo/redo. The
 * target/DPI/bleed segments render as honest PE5 placeholders (the live
 * effective-resolution math and target picker land with Fix for print). The
 * right-pinned `History · N` button (N = cursor + 1, the Open step counts)
 * toggles the docked history panel. The color note reads from the source color
 * space (deviation #6 default logic).
 */
export function PrintStrip({
  doc,
  historyOpen,
  onToggleHistory,
}: {
  doc: PhotoDocument;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  const { source, target, recipe, cursor } = doc;
  const eff = effectiveDims({ w: source.width, h: source.height }, recipe.slice(0, cursor));
  const targetLabel = target.size ? `${target.size.w} × ${target.size.h} in` : "not set";
  const colorNote = source.colorSpace === "cmyk" ? "CMYK · GRACoL at export" : "sRGB · converted for press at export";

  return (
    <div
      data-testid="photo-print-strip"
      className="flex h-9 shrink-0 items-center gap-[11px] border-b border-[#e6e6e6] bg-white px-[14px] text-[11.5px]"
    >
      <span data-testid="photo-strip-dims" className="whitespace-nowrap text-[#777]">
        {Math.round(eff.w)} × {Math.round(eff.h)} px
      </span>

      <Divider />

      <span className="whitespace-nowrap font-semibold text-[#555]">Target: {targetLabel}</span>
      <span
        title="Target sizes arrive with Fix for print (PE5)"
        className="cursor-not-allowed whitespace-nowrap text-[11px] text-[#086DD2] opacity-60"
      >
        Change ▾
      </span>

      <Divider />

      {/* DPI check chip — PE5 brings the live green/amber/red math; until a print
          size is chosen there is nothing to check, so a muted neutral chip. */}
      <span
        data-testid="photo-dpi-chip"
        className="whitespace-nowrap rounded-[10px] border border-[#e0e0e0] bg-[#f4f4f4] px-[9px] py-[2px] text-[10.5px] font-semibold text-[#999]"
      >
        Pick a print size to check DPI
      </span>

      <Divider />

      <span className="whitespace-nowrap text-[#999]">Bleed: not set</span>
      <span
        title="Bleed tools arrive with Fix for print (PE5)"
        className="cursor-not-allowed whitespace-nowrap text-[11px] font-semibold text-brand opacity-60"
      >
        Add →
      </span>

      <Divider />

      <span className="whitespace-nowrap text-[#999]">{colorNote}</span>

      <div className="flex-1" />

      <button
        type="button"
        data-testid="photo-history"
        data-history-toggle=""
        onClick={onToggleHistory}
        aria-expanded={historyOpen}
        title="Show edit history"
        className={`flex h-6 cursor-pointer items-center gap-[6px] rounded-[5px] border px-[9px] text-[11px] ${
          historyOpen
            ? "border-brand bg-[#fff7f7] text-brand-deep"
            : "border-[#dcdcdc] bg-white text-[#666] hover:border-[#c8c8c8]"
        }`}
      >
        <Clock size={12} strokeWidth={1.7} className={historyOpen ? "text-brand" : "text-[#777]"} />
        History · {cursor + 1}
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-[#e6e6e6]" />;
}
