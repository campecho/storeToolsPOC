"use client";

import { useFeedbackStore } from "@/store";
import { similarItems } from "@/lib/similar";
import { statusMeta } from "@/schema";

/**
 * Live "similar items" while typing — consolidation at the source (§5.4a).
 * One tap on "Back this" upvotes the existing item instead of filing a duplicate.
 */
export function SimilarItemsPanel() {
  const items = useFeedbackStore((s) => s.items);
  const title = useFeedbackStore((s) => s.reportTitle);
  const upvoteFromSimilar = useFeedbackStore((s) => s.upvoteFromSimilar);

  const similar = similarItems(items, title);
  if (!similar.length) return null;

  const headline =
    similar.length === 1
      ? "1 related item already open — back it instead of filing a duplicate"
      : `${similar.length} related items already open — some backed by many stores`;

  return (
    <div data-testid="similar-panel" className="mt-3 rounded-[9px] border border-[#f0d9d9] bg-[#fdf6f6] p-[13px]">
      <div className="mb-[10px] text-[12px] font-bold text-brand-deep">{headline}</div>
      <div className="flex flex-col gap-[7px]">
        {similar.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-[11px] rounded-[8px] border border-[#eee] bg-white px-[11px] py-[9px]"
          >
            <div className="w-10 shrink-0 text-center">
              <div className="text-[14px] font-bold text-[#555]">{item.votes}</div>
              <div className="text-[9px] text-[#aaa]">stores</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold leading-[1.35] text-[#333]">{item.title}</div>
              <div className="mt-[2px] text-[11px] text-[#999]">
                {item.area} · {statusMeta(item.type, item.status).label}
              </div>
            </div>
            <button
              type="button"
              onClick={() => upvoteFromSimilar(item.id)}
              className="shrink-0 cursor-pointer rounded-[7px] bg-brand px-3 py-[7px] text-[12px] font-semibold text-white hover:bg-brand-press"
            >
              Back this
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
