import { RibbonGroup } from "./RibbonGroup";

/**
 * Layout command band (wire 2b · Layout): Page size · Orientation ·
 * Guides & bleed · Columns. Static chrome in L2 — every control goes live
 * against the document model in L3 (the Guides toggle governs column guides
 * from L3, snapping from L7).
 */

/** 26px white pill button — the band's small-control chrome. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[26px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
      {children}
    </div>
  );
}

export function LayoutBand() {
  return (
    <>
      <RibbonGroup label="Page size" wide>
        <div className="flex h-[26px] w-[150px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[11px] text-[#555]">
          Letter · 8.5 × 11 in <span className="text-[#b0b0b0]">▾</span>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Orientation" wide>
        <div className="flex gap-[5px]">
          {/* portrait — active (mini page proxy inside) */}
          <div className="flex h-10 w-[34px] items-center justify-center rounded-[5px] border-[1.5px] border-brand bg-[#FBEBEB]">
            <div className="h-[22px] w-4 rounded-[1px] border border-[#cc7a7a]" />
          </div>
          {/* landscape */}
          <div className="flex h-10 w-11 items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white">
            <div className="h-4 w-6 rounded-[1px] border border-[#c4c4c4]" />
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Guides & bleed" wide>
        <div className="flex gap-[5px]">
          <Pill>Margins ▾</Pill>
          <Pill>Bleed 0.125</Pill>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Columns" wide last>
        <div className="flex items-center gap-2">
          <div className="flex h-[26px] w-[60px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-2 text-[11px] text-[#555]">
            1 <span className="text-[#b0b0b0]">▾</span>
          </div>
          {/* Guides toggle — shown on (the wire's red pill switch) */}
          <div className="flex items-center gap-[6px]">
            <div className="relative h-4 w-7 rounded-[8px] border border-brand bg-[#FBEBEB]">
              <div className="absolute right-[2px] top-[2px] h-3 w-3 rounded-full bg-brand" />
            </div>
            <span className="text-[10.5px] text-[#777]">Guides</span>
          </div>
        </div>
      </RibbonGroup>
    </>
  );
}
