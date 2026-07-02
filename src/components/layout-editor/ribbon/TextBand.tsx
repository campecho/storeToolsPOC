import { RibbonGroup } from "./RibbonGroup";

/**
 * Text command band (wire 2b · Text): Character · Styles · Spacing ·
 * Text flow. Static chrome in L2 — Character/Styles/Spacing go live against
 * a text selection in L5; Link boxes / Wrap stay inert placeholders for the
 * deferred text-flow slice.
 */

/** 26px white pill button — the band's small-control chrome. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[26px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
      {children}
    </div>
  );
}

export function TextBand() {
  return (
    <>
      <RibbonGroup label="Character">
        <div className="flex items-center gap-[5px]">
          <div className="flex h-6 w-[118px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-2 text-[11px] text-[#555]">
            Motiva Sans <span className="text-[#b0b0b0]">▾</span>
          </div>
          <div className="flex h-6 w-11 items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[7px] text-[11px] text-[#555]">
            11 <span className="text-[#b0b0b0]">▾</span>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Styles">
        <div className="flex h-[26px] w-[150px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[11px] text-[#555]">
          Paragraph · Normal <span className="text-[#b0b0b0]">▾</span>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Spacing">
        <div className="flex gap-[5px]">
          <Pill>Line 1.2 ▾</Pill>
          <Pill>Space ▾</Pill>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Text flow" last>
        <div className="flex gap-[5px]">
          <div className="flex h-[26px] items-center gap-[6px] rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
            Link boxes <span className="text-[#999]">⟶</span>
          </div>
          <Pill>Wrap ▾</Pill>
        </div>
      </RibbonGroup>
    </>
  );
}
