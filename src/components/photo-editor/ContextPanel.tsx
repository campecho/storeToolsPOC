"use client";

import type { PhotoTool } from "@/lib/store/photo-store";
import { AdjustPanel } from "./panels/AdjustPanel";
import { CleanupPanel } from "./panels/CleanupPanel";
import { CropPanel } from "./panels/CropPanel";
import { ExportPanel } from "./panels/ExportPanel";
import { FixForPrintPanel } from "./panels/FixForPrintPanel";
import { TextImagePanel } from "./panels/TextImagePanel";

/**
 * Contextual panel host (wire region 6). Renders only while a tool is active
 * (the shell also gates it out at the Simple level, Section E). The header
 * carries the wire's exact tool title and a ✕ that returns to the no-tool
 * state. PE9 closed the panel set — every tool has its real body now, so the
 * PE1-era "Lands with PE…" placeholder card is gone with its last consumer.
 */
const TOOL_TITLE: Record<Exclude<PhotoTool, "none">, string> = {
  crop: "Crop & straighten",
  adjust: "Adjust",
  fixprint: "Fix for print",
  text: "Text & image",
  cleanup: "Clean up",
  export: "Export",
};

export function ContextPanel({ activeTool, onClose }: { activeTool: PhotoTool; onClose: () => void }) {
  if (activeTool === "none") return null;

  return (
    <div
      data-testid="photo-panel"
      className="flex w-[268px] shrink-0 flex-col border-l border-[#ececec] bg-white"
    >
      <div className="flex shrink-0 items-center border-b border-[#efefef] px-[14px] py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]">{TOOL_TITLE[activeTool]}</div>
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
      ) : activeTool === "adjust" ? (
        <AdjustPanel />
      ) : activeTool === "fixprint" ? (
        <FixForPrintPanel />
      ) : activeTool === "text" ? (
        <TextImagePanel />
      ) : activeTool === "cleanup" ? (
        <CleanupPanel />
      ) : (
        <ExportPanel />
      )}
    </div>
  );
}
