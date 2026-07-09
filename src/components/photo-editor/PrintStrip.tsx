"use client";

import { Clock } from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";

/**
 * Print-correctness strip (wire region 4), pinned above the canvas. Live pixel
 * dims from the doc; the target/DPI/bleed segments render as honest PE5
 * placeholders (the live effective-resolution math and target picker land with
 * Fix for print), and the right-pinned History button is disabled until the
 * geometry & history tranche (PE2). The color note reads from the source color
 * space (deviation #6 default logic).
 */
export function PrintStrip({ doc }: { doc: PhotoDocument }) {
  const { source, target, cursor } = doc;
  const targetLabel = target.size ? `${target.size.w} × ${target.size.h} in` : "not set";
  const colorNote = source.colorSpace === "cmyk" ? "CMYK · GRACoL at export" : "sRGB · converted for press at export";

  return (
    <div
      data-testid="photo-print-strip"
      className="flex h-9 shrink-0 items-center gap-[11px] border-b border-[#e6e6e6] bg-white px-[14px] text-[11.5px]"
    >
      <span data-testid="photo-strip-dims" className="whitespace-nowrap text-[#777]">
        {source.width} × {source.height} px
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
        disabled
        title="History opens with the geometry & history tranche (PE2)"
        className="flex h-6 cursor-not-allowed items-center gap-[6px] rounded-[5px] border border-[#dcdcdc] bg-white px-[9px] text-[11px] text-[#666] opacity-60"
      >
        <Clock size={12} strokeWidth={1.7} className="text-[#777]" />
        History · {cursor}
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-[#e6e6e6]" />;
}
