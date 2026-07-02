import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { SectionLabel } from "./Field";

/**
 * Text inspector tab (wire region 7): Character · Paragraph · Style. Static
 * in L2 (left-align shown active, matching the wire) — the tab goes live
 * against a text selection in L5.
 */
export function TextTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Character</SectionLabel>
        <div className="mb-2 flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
          Motiva Sans <span className="text-[#b0b0b0]">▾</span>
        </div>
        <div className="flex gap-2">
          <div className="flex h-[30px] flex-1 items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
            11 pt <span className="text-[#b0b0b0]">▾</span>
          </div>
          <div className="flex gap-[5px]">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[13px] font-bold text-[#555]">
              B
            </div>
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[13px] italic text-[#555]">
              I
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Paragraph</SectionLabel>
        <div className="mb-2 flex gap-[5px]">
          <div className="flex h-[30px] flex-1 items-center justify-center rounded-[5px] border border-brand bg-[#FBEBEB]">
            <AlignLeft size={15} strokeWidth={1.5} className="text-[#9a1818]" />
          </div>
          <div className="flex h-[30px] flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white">
            <AlignCenter size={15} strokeWidth={1.5} className="text-[#777]" />
          </div>
          <div className="flex h-[30px] flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white">
            <AlignRight size={15} strokeWidth={1.5} className="text-[#777]" />
          </div>
          <div className="flex h-[30px] flex-1 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white">
            <AlignJustify size={15} strokeWidth={1.5} className="text-[#777]" />
          </div>
        </div>
        <div className="flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
          Line spacing 1.2 <span className="text-[#b0b0b0]">▾</span>
        </div>
      </div>

      <div>
        <SectionLabel>Style</SectionLabel>
        <div className="flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
          Body · Normal <span className="text-[#b0b0b0]">▾</span>
        </div>
      </div>
    </div>
  );
}
