"use client";

import { Check } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { recentlyShipped, shippedAgoLabel } from "@/lib/board";

/**
 * "Recently shipped" band at the top of the board: deliveries from the last
 * 7 days, grouped so the ranked list stays a purely open queue. Each entry
 * can be acknowledged individually ("Got it" — the same gesture as the
 * shipped modal's dismissal) or all at once; acknowledged and week-old
 * entries fall off. An announcement surface — independent of the rail
 * filters and search. Rows open the item's detail like any board row.
 */
export function RecentlyShipped() {
  const items = useFeedbackStore((s) => s.items);
  const openDetail = useFeedbackStore((s) => s.openDetail);
  const ackShipped = useFeedbackStore((s) => s.ackShipped);
  const ackAllShipped = useFeedbackStore((s) => s.ackAllShipped);

  const recent = recentlyShipped(items);
  if (!recent.length) return null;

  return (
    <div
      data-testid="shipped-group"
      className="rounded-[12px] border border-[#d4e9d8] bg-[#f2f9f3] p-3 sm:p-[14px]"
    >
      <div className="mb-[10px] flex items-center gap-2 px-1">
        <Check size={15} strokeWidth={2.2} className="text-success" />
        <span className="text-[13px] font-semibold text-success-deep">Recently shipped</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={ackAllShipped}
          data-testid="shipped-clear-all"
          className="cursor-pointer text-[12px] font-semibold text-success hover:text-success-deep"
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {recent.map((item) => (
          <div
            key={item.id}
            data-testid={`shipped-row-${item.id}`}
            role="button"
            tabIndex={0}
            onClick={() => openDetail(item.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDetail(item.id);
              }
            }}
            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#e0efe3] bg-white px-3 py-3 hover:border-[#c4dfc9] sm:px-[14px]"
          >
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#d9efdc]">
              <Check size={14} strokeWidth={2.4} className="text-success" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold leading-[1.35] text-[#2a2a2a]">{item.title}</div>
              <div className="mt-[3px] text-[12px] text-[#999]">
                {item.type === "bug" ? "Fixed" : "Shipped"} in {item.shippedIn} ·{" "}
                {shippedAgoLabel(item.shippedDaysAgo ?? 0)}
              </div>
            </div>
            <button
              type="button"
              data-testid={`shipped-got-it-${item.id}`}
              onClick={(e) => {
                e.stopPropagation();
                ackShipped(item.id);
              }}
              className="shrink-0 cursor-pointer rounded-[7px] border border-[#d4d4d4] bg-white px-[14px] py-[7px] text-[12px] font-semibold text-[#555] hover:bg-[#f5f5f5]"
            >
              Got it
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
