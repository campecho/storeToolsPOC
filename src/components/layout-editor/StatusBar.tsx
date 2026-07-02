import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutStore, TOOL_LABELS } from "@/store";

/**
 * Status bar (wire region 8): page nav · live tool readout · view buttons ·
 * zoom. Page nav and zoom are static until L6/L3; the spread view toggle
 * stays static until facing pages land (plan §6).
 */
export function StatusBar() {
  const tool = useLayoutStore((s) => s.tool);

  return (
    <div className="flex h-7 shrink-0 items-center gap-[14px] border-t border-[#e0e0e0] bg-[#ececec] px-3">
      <div className="flex items-center gap-[6px] text-[11px] text-[#777]">
        <ChevronLeft size={12} strokeWidth={2} className="text-[#aaa]" />
        <span>Page 1 of 1</span>
        <ChevronRight size={12} strokeWidth={2} className="text-[#aaa]" />
      </div>
      <div className="h-[14px] w-px bg-[#d4d4d4]" />
      <span className="text-[11px] text-[#777]" data-testid="status-tool">
        {TOOL_LABELS[tool]} · ready
      </span>

      <div className="flex-1" />

      {/* view: single page (active) · two-page spread (static until spreads land) */}
      <div className="flex items-center gap-2">
        <div className="h-[18px] w-[22px] rounded-[3px] border border-brand bg-brand-tint" />
        <div className="flex h-[18px] w-[22px] items-center justify-center gap-[1px] rounded-[3px] border border-[#cfcfcf] bg-white">
          <div className="h-[11px] w-[7px] border border-[#b0b0b0]" />
          <div className="h-[11px] w-[7px] border border-[#b0b0b0]" />
        </div>
      </div>
      <div className="h-[14px] w-px bg-[#d4d4d4]" />

      {/* zoom — static 100% until the true-scale canvas lands (L3) */}
      <div className="flex items-center gap-2 text-[11px] text-[#777]">
        <span className="text-[#aaa]">−</span>
        <div className="relative h-1 w-24 rounded-[2px] bg-[#d0d0d0]">
          <div className="absolute left-1/2 top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b0b0b0] bg-white" />
        </div>
        <span className="text-[#aaa]">+</span>
        <span className="min-w-[34px]">100%</span>
      </div>
    </div>
  );
}
