import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
} from "lucide-react";
import { SectionLabel } from "./Field";

/**
 * Align inspector tab (wire region 7): Align (left/center/right over
 * top/middle/bottom) · Distribute · Relative to. Static in L2 — the tab goes
 * live against a multi-selection in L7.
 */

/** 32px object-alignment button. */
function AlignBtn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white">
      {children}
    </div>
  );
}

export function AlignTab() {
  const icon = { size: 16, strokeWidth: 1.6, className: "text-[#666]" };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Align</SectionLabel>
        <div className="mb-[5px] flex gap-[5px]">
          <AlignBtn>
            <AlignStartVertical {...icon} />
          </AlignBtn>
          <AlignBtn>
            <AlignCenterVertical {...icon} />
          </AlignBtn>
          <AlignBtn>
            <AlignEndVertical {...icon} />
          </AlignBtn>
        </div>
        <div className="flex gap-[5px]">
          <AlignBtn>
            <AlignStartHorizontal {...icon} />
          </AlignBtn>
          <AlignBtn>
            <AlignCenterHorizontal {...icon} />
          </AlignBtn>
          <AlignBtn>
            <AlignEndHorizontal {...icon} />
          </AlignBtn>
        </div>
      </div>

      <div>
        <SectionLabel>Distribute</SectionLabel>
        <div className="flex gap-[5px]">
          <div className="flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[11px] text-[#777]">
            Horizontal
          </div>
          <div className="flex h-8 flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[11px] text-[#777]">
            Vertical
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Relative to</SectionLabel>
        <div className="flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
          Page <span className="text-[#b0b0b0]">▾</span>
        </div>
      </div>
    </div>
  );
}
