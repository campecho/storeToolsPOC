"use client";

import { Loader2 } from "lucide-react";
import { usePhotoStore } from "@/lib/store/photo-store";
import type { PhotoTool } from "@/lib/store/photo-store";

/**
 * Status bar (wire region 7). Left: the per-tool status string (verbatim from
 * the wire's script status map) — overridden by "Opening…" during the intake
 * round-trip, and by a no-photo prompt before a file is open. Center: the
 * autosave note. Right: a full-res-render progress chip (while store.rendering,
 * PE3 export), the proxy note, and the computed fit-zoom readout.
 */
const STATUS: Record<PhotoTool, string> = {
  none: "No tool active · drag to pan, pick a task on the left",
  crop: "Crop · drag the handles — rule-of-thirds shown",
  adjust: "Adjust · sliders preview live on the proxy",
  fixprint: "Fix for print · trim and bleed guides shown",
  text: "Text & image · drag, scale, rotate on the image",
  cleanup: "Clean up · brush over the area to remove",
  export: "Export · full-res render is queued server-side",
};

export function StatusBar({
  activeTool,
  opening,
  zoomPct,
  hasDoc,
}: {
  activeTool: PhotoTool;
  opening: boolean;
  zoomPct: number | null;
  hasDoc: boolean;
}) {
  // Read the render flag straight from the store so the shell doesn't have to
  // thread a prop through (StatusBar is already a client component).
  const rendering = usePhotoStore((s) => s.rendering);

  const left = opening ? "Opening…" : hasDoc ? STATUS[activeTool] : "No photo open · drop a photo or browse to begin";

  return (
    <div
      data-testid="photo-status-bar"
      className="flex h-7 shrink-0 items-center gap-[14px] border-t border-[#e0e0e0] bg-[#ececec] px-3"
    >
      <span data-testid="photo-status" className="text-[11px] text-[#777]">
        {left}
      </span>

      {hasDoc && (
        <>
          <div className="h-[14px] w-px bg-[#d4d4d4]" />
          <span className="text-[11px] text-[#999]">Autosaved · edits are steps, nothing bakes until export</span>
          <div className="flex-1" />
          {rendering && (
            <span
              data-testid="photo-rendering-chip"
              className="flex items-center gap-[6px] rounded-full border border-brand-border bg-brand-tint px-[9px] py-[2px] text-[11px] font-medium text-brand-deep"
            >
              <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
              Rendering full resolution…
            </span>
          )}
          <span className="text-[11px] text-[#999]">Editing a screen proxy · full res renders on export</span>
          <div className="h-[14px] w-px bg-[#d4d4d4]" />
          <span data-testid="photo-zoom" className="min-w-[36px] text-[11px] text-[#777]">
            {zoomPct == null ? "—" : `${zoomPct}%`}
          </span>
        </>
      )}
    </div>
  );
}
