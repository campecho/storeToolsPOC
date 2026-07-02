"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutStore, TOOL_LABELS } from "@/store";
import { clampZoom, ZOOM_MAX, ZOOM_MIN } from "@/lib/layout/geometry";

/**
 * Status bar (wire region 8): page nav · live tool + selection readout ·
 * view buttons · zoom · reset (the reset affordance is additive, per plan
 * §3.2's component map). Draw tools hint "drag to draw", Select reports the
 * selection, Table is honest about being deferred (plan L4). Page nav is
 * live (◀ Page N of M ▶, plan L6) and reads "Master X" with the arrows
 * parked while a master is being edited; the spread view toggle stays
 * static until facing pages land (§6).
 */
function statusText(tool: ReturnType<typeof useLayoutStore.getState>["tool"], count: number) {
  if (tool === "select") {
    return count ? `Select tool · ${count} object${count > 1 ? "s" : ""}` : "Select tool · ready";
  }
  if (tool === "rect" || tool === "ellipse" || tool === "line" || tool === "pic" || tool === "text") {
    return `${TOOL_LABELS[tool]} · drag to draw`;
  }
  if (tool === "table") return "Table tool · coming later in the beta";
  return `${TOOL_LABELS[tool]} · ready`;
}

export function StatusBar() {
  const tool = useLayoutStore((s) => s.tool);
  const selectedCount = useLayoutStore((s) => s.selectedIds.length);
  const zoom = useLayoutStore((s) => s.zoom);
  const pages = useLayoutStore((s) => s.doc.pages);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const masterLabel = useLayoutStore((s) =>
    s.masterEditingId ? s.doc.masters.find((m) => m.id === s.masterEditingId)?.label : undefined,
  );
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const zoomIn = useLayoutStore((s) => s.zoomIn);
  const zoomOut = useLayoutStore((s) => s.zoomOut);
  const setZoom = useLayoutStore((s) => s.setZoom);
  const resetDoc = useLayoutStore((s) => s.resetDoc);

  const pageIndex = Math.max(
    pages.findIndex((p) => p.id === activePageId),
    0,
  );
  const inMaster = masterLabel !== undefined;
  const navBtn = (enabled: boolean) =>
    enabled ? "cursor-pointer text-[#aaa] hover:text-[#666]" : "text-[#d8d8d8]";
  const prevOk = !inMaster && pageIndex > 0;
  const nextOk = !inMaster && pageIndex < pages.length - 1;

  return (
    <div className="flex h-7 shrink-0 items-center gap-[14px] border-t border-[#e0e0e0] bg-[#ececec] px-3">
      <div className="flex items-center gap-[6px] text-[11px] text-[#777]">
        <button
          type="button"
          data-testid="page-prev"
          aria-label="Previous page"
          disabled={!prevOk}
          onClick={() => prevOk && setActivePage(pages[pageIndex - 1].id)}
          className={navBtn(prevOk)}
        >
          <ChevronLeft size={12} strokeWidth={2} />
        </button>
        <span data-testid="page-indicator">
          {inMaster ? `Master ${masterLabel}` : `Page ${pageIndex + 1} of ${pages.length}`}
        </span>
        <button
          type="button"
          data-testid="page-next"
          aria-label="Next page"
          disabled={!nextOk}
          onClick={() => nextOk && setActivePage(pages[pageIndex + 1].id)}
          className={navBtn(nextOk)}
        >
          <ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>
      <div className="h-[14px] w-px bg-[#d4d4d4]" />
      <span className="text-[11px] text-[#777]" data-testid="status-tool">
        {statusText(tool, selectedCount)}
      </span>

      <div className="flex-1" />

      {/* PROTOTYPE-ONLY: view toggles — single page (active) · two-page
          spread, inert until facing pages land (plan §6) */}
      <div className="flex items-center gap-2">
        <div className="h-[18px] w-[22px] rounded-[3px] border border-brand bg-brand-tint" />
        <div className="flex h-[18px] w-[22px] items-center justify-center gap-[1px] rounded-[3px] border border-[#cfcfcf] bg-white">
          <div className="h-[11px] w-[7px] border border-[#b0b0b0]" />
          <div className="h-[11px] w-[7px] border border-[#b0b0b0]" />
        </div>
      </div>
      <div className="h-[14px] w-px bg-[#d4d4d4]" />

      {/* zoom — live against the viewport (L3) */}
      <div className="flex items-center gap-2 text-[11px] text-[#777]">
        <button
          type="button"
          onClick={zoomOut}
          data-testid="zoom-out"
          aria-label="Zoom out"
          className="cursor-pointer text-[#aaa] hover:text-[#666]"
        >
          −
        </button>
        <input
          type="range"
          min={ZOOM_MIN * 100}
          max={ZOOM_MAX * 100}
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(clampZoom(Number(e.target.value) / 100))}
          data-testid="zoom-slider"
          aria-label="Zoom"
          className="h-1 w-24 cursor-pointer appearance-none rounded-[2px] bg-[#d0d0d0] [&::-moz-range-thumb]:h-[11px] [&::-moz-range-thumb]:w-[11px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#b0b0b0] [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-[11px] [&::-webkit-slider-thumb]:w-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#b0b0b0] [&::-webkit-slider-thumb]:bg-white"
        />
        <button
          type="button"
          onClick={zoomIn}
          data-testid="zoom-in"
          aria-label="Zoom in"
          className="cursor-pointer text-[#aaa] hover:text-[#666]"
        >
          +
        </button>
        <span className="min-w-[34px]" data-testid="zoom-percent">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="h-[14px] w-px bg-[#d4d4d4]" />
      <button
        type="button"
        onClick={resetDoc}
        data-testid="editor-reset"
        title="Start over — clears the saved publication"
        className="cursor-pointer text-[11px] text-[#999] hover:text-brand"
      >
        Reset
      </button>
    </div>
  );
}
