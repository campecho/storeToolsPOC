import { BoardEntryCard } from "./BoardEntryCard";

/**
 * Right column of Home — "Pick a product": 4×3 placeholder product grid
 * (gray media rectangles per the wires) with the board-entry/recognition
 * card pushed to the bottom.
 */

const PRODUCTS = [
  "Business cards",
  "Flyers",
  "Documents",
  "Postcards",
  "Rack cards",
  "Posters",
  "Signs",
  "Banners",
  "Labels",
  "Stickers & decals",
  "Booklets",
  "Envelopes",
];

export function ProductColumn() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-[26px]">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-[10px]">
          <div className="text-[11px] font-bold uppercase tracking-[.05em] text-[#5f5f5f]">Pick a product</div>
          <span className="text-[11px] text-[#aaa]">Sorted by most used</span>
        </div>
        <div className="flex items-center gap-[14px]">
          <div className="flex cursor-pointer items-center gap-[7px] rounded-[6px] border border-brand bg-white px-[11px] py-[5px]">
            <div className="h-3 w-3 rounded-full border-[1.5px] border-brand" />
            <span className="text-[12px] font-semibold text-brand">Recent projects</span>
            <span className="text-[11px] text-brand">▾</span>
          </div>
          <span className="cursor-pointer text-[12px] text-info">Browse all templates →</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {PRODUCTS.map((label) => (
          <div key={label} className="overflow-hidden rounded-[8px] border border-[#e6e6e6]">
            <div className="h-20 bg-[#e4e4e4]" />
            <div className="px-[10px] py-2 text-[12px] font-medium text-[#444]">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <BoardEntryCard />
    </div>
  );
}
