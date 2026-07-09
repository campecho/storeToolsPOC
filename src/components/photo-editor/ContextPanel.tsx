"use client";

import { Crop, Download, Eraser, Printer, SlidersHorizontal, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PhotoTool } from "@/lib/store/photo-store";
import { CropPanel } from "./panels/CropPanel";
import { ExportPanel } from "./panels/ExportPanel";

/**
 * Contextual panel host (wire region 6). Renders only while a tool is active
 * (the shell also gates it out at the Simple level, Section E). The header
 * carries the wire's exact tool title and a ✕ that returns to the no-tool
 * state. Each tool's body is an honest placeholder card naming the tranche the
 * real panel lands with (PE2–PE9) — styled like the suite's existing "coming"
 * affordances rather than silently missing.
 */
const TOOL_INFO: Record<
  Exclude<PhotoTool, "none">,
  { title: string; line: string; tranche: string; icon: LucideIcon }
> = {
  crop: {
    title: "Crop & straighten",
    line: "Crop, straighten, set an aspect ratio, rotate and flip.",
    tranche: "PE2",
    icon: Crop,
  },
  adjust: {
    title: "Adjust",
    line: "Auto-enhance plus light and color sliders, live on the proxy.",
    tranche: "PE4",
    icon: SlidersHorizontal,
  },
  fixprint: {
    title: "Fix for print",
    line: "Bleed, fit-to-size, and effective-resolution checks.",
    tranche: "PE5",
    icon: Printer,
  },
  text: {
    title: "Text & image",
    line: "Add text and logo overlays with on-canvas handles.",
    tranche: "PE6",
    icon: Type,
  },
  cleanup: {
    title: "Clean up",
    line: "Brush over marks and small objects to remove them.",
    tranche: "PE9",
    icon: Eraser,
  },
  export: {
    title: "Export",
    line: "Render a print-ready file at full resolution on the server.",
    tranche: "PE3",
    icon: Download,
  },
};

export function ContextPanel({ activeTool, onClose }: { activeTool: PhotoTool; onClose: () => void }) {
  if (activeTool === "none") return null;
  const info = TOOL_INFO[activeTool];
  const Icon = info.icon;

  return (
    <div
      data-testid="photo-panel"
      className="flex w-[268px] shrink-0 flex-col border-l border-[#ececec] bg-white"
    >
      <div className="flex shrink-0 items-center border-b border-[#efefef] px-[14px] py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]">{info.title}</div>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="photo-panel-close"
          aria-label="Close panel"
          onClick={onClose}
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px] border border-[#dcdcdc] text-[10px] text-[#999] hover:bg-[#f4f4f4]"
        >
          ✕
        </button>
      </div>

      {activeTool === "crop" ? (
        <CropPanel />
      ) : activeTool === "export" ? (
        <ExportPanel />
      ) : (
        <div className="flex-1 overflow-hidden p-4">
          <div className="rounded-[8px] border border-[#e6e6e6] bg-[#fafafa] p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-white shadow-[0_1px_4px_rgba(0,0,0,.10)]">
              <Icon size={20} strokeWidth={1.7} className="text-[#666]" />
            </div>
            <div className="mt-3 text-[13px] font-semibold text-[#333]">{info.title}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-[#777]">{info.line}</div>
            <div className="mt-3 inline-flex items-center rounded-full border border-[#e0e0e0] bg-white px-[9px] py-[2px] text-[10.5px] font-semibold text-[#8a8a8a]">
              Lands with {info.tranche}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
