"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { filterItems, scopeLabel } from "@/lib/board";
import { useFlip } from "@/lib/use-flip";
import { BoardRail } from "@/components/board/BoardRail";
import { ItemRow } from "@/components/board/ItemRow";
import { DetailDrawer } from "@/components/detail/DetailDrawer";

/**
 * The board (wire view 3) — the population-wide, ranked list: left rail with
 * recognition + filters, main column with search and the votes-ranked items.
 * Rows glide on reorder ("items reorder gently as backing shifts").
 */
export default function BoardPage() {
  const items = useFeedbackStore((s) => s.items);
  const store = useFeedbackStore((s) => s.store);
  const fType = useFeedbackStore((s) => s.fType);
  const fStatus = useFeedbackStore((s) => s.fStatus);
  const fScope = useFeedbackStore((s) => s.fScope);
  const query = useFeedbackStore((s) => s.query);
  const setQuery = useFeedbackStore((s) => s.setQuery);
  const setTypeFilter = useFeedbackStore((s) => s.setTypeFilter);
  const setStatusFilter = useFeedbackStore((s) => s.setStatusFilter);
  const setScopeFilter = useFeedbackStore((s) => s.setScopeFilter);
  const maybeAutoCelebrate = useFeedbackStore((s) => s.maybeAutoCelebrate);

  // First board landing per session auto-plays the celebrate queue (§5.6).
  useEffect(() => {
    maybeAutoCelebrate();
  }, [maybeAutoCelebrate]);

  const ranked = filterItems(items, { fType, fStatus, fScope, query });
  const flipRef = useFlip();

  const clearFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setScopeFilter("all");
    setQuery("");
  };

  return (
    <div className="flex min-h-0 flex-1">
      <BoardRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-[14px] border-b border-[#f0f0f0] px-[22px] pb-3 pt-4">
          <div className="flex-1">
            <div className="text-[17px] font-bold text-ink">What stores are asking for</div>
            <div data-testid="board-subline" className="mt-[2px] text-[12px] text-[#888]">
              {ranked.length} items · {scopeLabel(fScope, store)} · ranked by store votes
            </div>
          </div>
          <div className="flex h-[34px] w-[280px] items-center gap-2 rounded-[7px] border border-[#d6d6d6] bg-white px-[11px] focus-within:border-brand">
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
            <ItemRow key={item.id} item={item} flipRef={flipRef(item.id)} />
          ))}
          {ranked.length === 0 && (
            <div
              data-testid="board-empty"
              className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-[#e0e0e0] bg-[#fbfbfb] px-6 py-10 text-center"
            >
              <div className="text-[14px] font-semibold text-[#555]">Nothing matches this view</div>
              <div className="text-[12px] text-[#999]">Try different words, or widen the filters.</div>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 cursor-pointer text-[12px] font-semibold text-brand"
              >
                Clear search & filters
              </button>
            </div>
          )}
        </div>
      </div>

      <DetailDrawer />
    </div>
  );
}
