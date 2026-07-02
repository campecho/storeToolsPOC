import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Clipboard,
  Copy,
  List,
  Scissors,
  Search,
} from "lucide-react";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Home command band (wire 2b · Home): Clipboard · Font · Paragraph · Styles ·
 * Editing. All controls are static chrome in L1 — Font/Paragraph go live
 * against a selection in L5.
 */

/** 26×24 white icon button — the band's small-control chrome. */
function IconBtn({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`flex h-6 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[#555] ${
        wide ? "w-[30px]" : "w-[26px]"
      }`}
    >
      {children}
    </div>
  );
}

export function HomeBand() {
  return (
    <>
      <RibbonGroup label="Clipboard">
        <div className="flex items-center gap-[6px]">
          <div className="flex h-[54px] w-[46px] flex-col items-center justify-center gap-1 rounded-[6px] border border-[#dcdcdc] bg-white text-[#555]">
            <Clipboard size={18} strokeWidth={1.6} />
            <span className="text-[10px]">Paste</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex h-6 items-center gap-[5px] rounded-[5px] border border-[#e0e0e0] bg-white px-[7px] text-[10.5px] text-[#666]">
              <Scissors size={12} strokeWidth={1.7} className="text-[#777]" />
              Cut
            </div>
            <div className="flex h-6 items-center gap-[5px] rounded-[5px] border border-[#e0e0e0] bg-white px-[7px] text-[10.5px] text-[#666]">
              <Copy size={12} strokeWidth={1.7} className="text-[#777]" />
              Copy
            </div>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Font">
        <div className="flex items-center gap-[5px]">
          <div className="flex h-6 w-[118px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-2 text-[11px] text-[#555]">
            Motiva Sans <span className="text-[#b0b0b0]">▾</span>
          </div>
          <div className="flex h-6 w-11 items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[7px] text-[11px] text-[#555]">
            11 <span className="text-[#b0b0b0]">▾</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn>
            <span className="text-[12px] font-bold">B</span>
          </IconBtn>
          <IconBtn>
            <span className="text-[12px] italic">I</span>
          </IconBtn>
          <IconBtn>
            <span className="text-[12px] underline">U</span>
          </IconBtn>
          {/* Font color — static swatch; color editing is deferred (plan §6). */}
          <IconBtn wide>
            <span className="flex flex-col items-center leading-none">
              <span className="text-[11px] font-bold">A</span>
              <span className="mt-[1px] h-[3px] w-[15px] rounded-[1px] bg-brand" />
            </span>
          </IconBtn>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Paragraph">
        <div className="flex items-center gap-1">
          <IconBtn>
            <AlignLeft size={15} strokeWidth={1.5} className="text-[#666]" />
          </IconBtn>
          <IconBtn>
            <AlignCenter size={15} strokeWidth={1.5} className="text-[#666]" />
          </IconBtn>
          <IconBtn>
            <AlignRight size={15} strokeWidth={1.5} className="text-[#666]" />
          </IconBtn>
          <IconBtn>
            <AlignJustify size={15} strokeWidth={1.5} className="text-[#666]" />
          </IconBtn>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn>
            <List size={15} strokeWidth={1.5} className="text-[#666]" />
          </IconBtn>
          <IconBtn>
            <span className="text-[9px] font-bold text-[#666]">1.</span>
          </IconBtn>
          <IconBtn>
            <span className="text-[12px] text-[#666]">¶</span>
          </IconBtn>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Styles">
        <div className="flex h-[26px] w-[130px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[11px] text-[#555]">
          Body · Normal <span className="text-[#b0b0b0]">▾</span>
        </div>
        <div className="flex gap-[5px]">
          <div className="flex h-[22px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-2 text-[11px] font-bold text-[#555]">
            Heading
          </div>
          <div className="flex h-[22px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-2 text-[10px] text-[#888]">
            + New
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Editing" last>
        <div className="flex flex-col gap-1">
          <div className="flex h-6 items-center gap-[6px] rounded-[5px] border border-[#e0e0e0] bg-white px-2 text-[10.5px] text-[#666]">
            <Search size={12} strokeWidth={1.8} className="text-[#777]" />
            Find
          </div>
          <div className="flex h-6 items-center rounded-[5px] border border-[#e0e0e0] bg-white px-2 text-[10.5px] text-[#666]">
            Replace…
          </div>
        </div>
      </RibbonGroup>
    </>
  );
}
