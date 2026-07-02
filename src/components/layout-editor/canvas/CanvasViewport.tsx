/**
 * Rulers + pasteboard + publication page (wire regions 5–6). L1 is the static
 * at-rest view: gradient-tick rulers and a Letter page proxy with bleed
 * outline, margin box, center guides, corner marks, and the guide legend.
 * L3 replaces the proxy with the true-scale PageSurface driven by the
 * document model, and makes rulers/zoom live.
 */
export function CanvasViewport() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* top ruler row: corner box + horizontal ruler */}
      <div className="flex h-[18px] shrink-0">
        <div className="w-[18px] shrink-0 border-b border-r border-[#e0e0e0] bg-[#ededed]" />
        <div className="flex-1 border-b border-[#e0e0e0] bg-[#ededed] [background-image:repeating-linear-gradient(90deg,#c4c4c4_0,#c4c4c4_1px,transparent_1px,transparent_24px)]" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left ruler */}
        <div className="w-[18px] shrink-0 border-r border-[#e0e0e0] bg-[#ededed] [background-image:repeating-linear-gradient(0deg,#c4c4c4_0,#c4c4c4_1px,transparent_1px,transparent_24px)]" />

        {/* pasteboard */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-pasteboard">
          <div className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[11px] text-[#7a7a7a]">
            Untitled publication · Letter 8.5 × 11 in · 100%
          </div>

          {/* publication page — static Letter proxy (the wire's 428×554 stand-in) */}
          <div
            data-testid="publication-page"
            className="relative h-[554px] w-[428px] bg-white shadow-[0_3px_16px_rgba(0,0,0,.22)] [outline:1.5px_dashed_var(--color-brand)] [outline-offset:9px]"
          >
            {/* margin / safe area */}
            <div className="absolute inset-[26px] border border-dashed border-guide" />
            {/* center guides */}
            <div className="absolute bottom-[26px] left-1/2 top-[26px] w-px bg-guide opacity-50" />
            <div className="absolute left-[26px] right-[26px] top-1/2 h-px bg-guide opacity-[.35]" />
            {/* bleed corner marks */}
            <div className="absolute -left-[15px] -top-[15px] h-[9px] w-[9px] border-l border-t border-bleed-mark" />
            <div className="absolute -right-[15px] -top-[15px] h-[9px] w-[9px] border-r border-t border-bleed-mark" />
            <div className="absolute -bottom-[15px] -left-[15px] h-[9px] w-[9px] border-b border-l border-bleed-mark" />
            <div className="absolute -bottom-[15px] -right-[15px] h-[9px] w-[9px] border-b border-r border-bleed-mark" />
          </div>

          {/* guide legend */}
          <div className="absolute bottom-[14px] right-4 flex flex-col gap-[6px] rounded-[7px] border border-[#e2e2e2] bg-white px-[11px] py-2">
            <div className="flex items-center gap-[7px]">
              <div className="w-4 border-t-[1.5px] border-dashed border-brand" />
              <span className="text-[10px] text-[#888]">Bleed 0.125 in</span>
            </div>
            <div className="flex items-center gap-[7px]">
              <div className="w-4 border-t border-dashed border-guide" />
              <span className="text-[10px] text-[#888]">Margin 0.5 in</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
