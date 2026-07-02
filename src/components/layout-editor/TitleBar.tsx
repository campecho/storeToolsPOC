import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Editor title bar (wire region 1). Deviation #1 (plan §2): the persistent
 * suite header above already carries the Staples badge, store label, and the
 * global actions — so this bar swaps the wire's duplicated chrome and window
 * controls for a back link, keeping the doc name, size hint, experience
 * switch, and help glyph.
 */
export function TitleBar() {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#e0e0e0] bg-[#f0f0f0] px-[14px]">
      <Link
        href="/"
        data-testid="editor-back"
        className="flex shrink-0 items-center gap-[5px] text-[12px] font-medium text-[#666] hover:text-brand"
      >
        <ChevronLeft size={15} strokeWidth={2} />
        Back
      </Link>
      <div className="h-5 w-px shrink-0 bg-[#dcdcdc]" />

      {/* Doc name + size hint are static until the document model lands (L3). */}
      <div className="flex min-w-0 items-center gap-[9px]">
        <span className="truncate text-[13px] font-semibold text-[#333]">Untitled publication</span>
        <span className="shrink-0 text-[12px] text-[#9a9a9a]">· Letter · 8.5 × 11 in</span>
      </div>

      <div className="flex-1" />

      {/* Experience levels (design doc §3.3) — surface-only, never the file.
          Standard-only until plan step L8; Simple/Pro render disabled. */}
      <div
        data-testid="experience-switch"
        className="flex shrink-0 items-center rounded-[6px] bg-[#e7e7e7] p-[2px] text-[11px] text-[#777]"
      >
        <span className="cursor-not-allowed rounded-[4px] px-[11px] py-[3px] opacity-60" title="Coming later in the beta">
          Simple
        </span>
        <span className="rounded-[4px] bg-white px-[11px] py-[3px] text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]">
          Standard
        </span>
        <span className="cursor-not-allowed rounded-[4px] px-[11px] py-[3px] opacity-60" title="Coming later in the beta">
          Pro
        </span>
      </div>

      <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#b6b6b6] text-[11px] text-[#9a9a9a]">
        ?
      </div>
    </div>
  );
}
