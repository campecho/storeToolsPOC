"use client";

import { Search } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { filterItems, scopeLabel } from "@/lib/board";
import { BoardRail } from "@/components/board/BoardRail";
import { ItemRow } from "@/components/board/ItemRow";

/**
 * The board (wire view 3) — the population-wide, ranked list: left rail with
 * recognition + filters, main column with search and the votes-ranked items.
 * The item detail drawer lands in Step 4.
 */
export default function BoardPage() {
  const items = useFeedbackStore((s) => s.items);
  const store = useFeedbackStore((s) => s.store);
  const fType = useFeedbackStore((s) => s.fType);
  const fStatus = useFeedbackStore((s) => s.fStatus);
  const fScope = useFeedbackStore((s) => s.fScope);
  const query = useFeedbackStore((s) => s.query);
  const setQuery = useFeedbackStore((s) => s.setQuery);

  const ranked = filterItems(items, { fType, fStatus, fScope, query });

  return (
    <div className="flex min-h-0 flex-1">
      <BoardRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-[14px] border-b border-[#f0f0f0] px-[22px] pb-3 pt-4">
          <div className="flex-1">
            <div className="text-[17px] font-bold text-ink">What stores are asking for</div>
            <div data-testid="board-subline" className="mt-[2px] text-[12px] text-[#888]">
              {ranked.length} open items · {scopeLabel(fScope, store)} · ranked by store votes
            </div>
          </div>
          <div className="flex h-[34px] w-[280px] items-center gap-2 rounded-[7px] border border-[#d6d6d6] bg-white px-[11px]">
            <Search size={15} strokeWidth={1.9} className="shrink-0 text-[#9a9a9a]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search feedback…"
              data-testid="board-search"
              className="w-full border-none bg-transparent text-[12px] text-[#444] outline-none"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-[10px] overflow-auto px-[22px] pb-[26px] pt-[14px]">
          {ranked.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
