import { Field, SectionLabel } from "./Field";

/**
 * Page inspector tab (wire region 7, default): Product binding · Page size ·
 * Orientation · Bleed & margins. Static in L1 — every control goes live
 * against the document model in L3; the Product card's catalog link stays
 * static until the catalog/spec-sync slice (plan §6).
 */
export function PageTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Product</SectionLabel>
        <div className="flex flex-col gap-[6px] rounded-[7px] border border-[#ececec] px-[11px] py-[10px]">
          <div className="text-[12px] text-[#555]">Custom size — not bound to a SKU</div>
          <div className="cursor-pointer text-[11px] text-info">
            Choose a product to make it born-correct →
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Page size</SectionLabel>
        <div className="mb-2 flex gap-2">
          <Field label="Width" value="8.5 in" />
          <Field label="Height" value="11 in" />
        </div>
        <div className="flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
          Letter <span className="text-[#b0b0b0]">▾</span>
        </div>
      </div>

      <div>
        <SectionLabel>Orientation</SectionLabel>
        <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11.5px]">
          <div className="flex-1 rounded-[5px] bg-white py-[5px] text-center text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]">
            Portrait
          </div>
          <div className="flex-1 py-[5px] text-center text-[#777]">Landscape</div>
        </div>
      </div>

      <div>
        <SectionLabel>Bleed & margins</SectionLabel>
        <div className="flex gap-2">
          <Field label="Bleed" value="0.125 in" />
          <Field label="Margin" value="0.5 in" />
        </div>
      </div>
    </div>
  );
}
