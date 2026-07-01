"use client";

import { ChevronUp, MessageSquare } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { statusMeta, type FeedbackItem } from "@/schema";

/**
 * One board row (wire): upvote button (56px, toggles, one vote per store,
 * pulseCount on change) · type tag + area + title + reach meta · status pill
 * and "Shipped/Fixed in vX". Clicking the row opens the detail drawer (Step 4).
 */
export function ItemRow({ item }: { item: FeedbackItem }) {
  const highlightId = useFeedbackStore((s) => s.highlightId);
  const justVotedId = useFeedbackStore((s) => s.justVotedId);
  const upvote = useFeedbackStore((s) => s.upvote);
  const openDetail = useFeedbackStore((s) => s.openDetail);

  const meta = statusMeta(item.type, item.status);
  const highlighted = item.id === highlightId;
  const isBug = item.type === "bug";

  return (
    <div
      data-testid={`board-item-${item.id}`}
      onClick={() => openDetail(item.id)}
      className="relative flex cursor-pointer gap-[15px] rounded-[10px] border bg-white px-4 py-[14px] hover:border-[#cfcfcf]"
      style={{
        borderColor: highlighted ? "#CC0000" : "#e6e6e6",
        boxShadow: highlighted ? "0 0 0 3px rgba(204,0,0,.12)" : "0 1px 3px rgba(0,0,0,.05)",
      }}
    >
      {/* upvote */}
      <button
        type="button"
        data-testid={`upvote-${item.id}`}
        onClick={(e) => {
          e.stopPropagation();
          upvote(item.id);
        }}
        className="flex w-[56px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-[9px] border py-2"
        style={{
          background: item.votedByMe ? "#CC0000" : "#fff",
          borderColor: item.votedByMe ? "#CC0000" : "#d4d4d4",
          color: item.votedByMe ? "#fff" : "#666",
        }}
      >
        <ChevronUp size={17} strokeWidth={2.3} />
        <span
          className="text-[15px] font-bold"
          style={item.id === justVotedId ? { display: "inline-block", animation: "pulseCount .6s ease" } : undefined}
        >
          {item.votes}
        </span>
      </button>

      {/* middle */}
      <div className="min-w-0 flex-1">
        <div className="mb-[5px] flex items-center gap-2">
          <span
            className="rounded-[4px] px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[.03em]"
            style={isBug ? { color: "#CC0000", background: "#FBEBEB" } : { color: "#086DD2", background: "#eef4fb" }}
          >
            {isBug ? "Bug" : "Feature request"}
          </span>
          <span className="text-[11px] text-[#999]">{item.area}</span>
        </div>
        <div className="text-[14px] font-semibold leading-[1.35] text-[#2a2a2a]">{item.title}</div>
        <div className="mt-[9px] flex items-center gap-[14px]">
          <span className="text-[11px] text-[#888]">
            {item.votes} stores · {item.districts} districts
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[#888]">
            <MessageSquare size={13} strokeWidth={1.8} className="text-[#aaa]" />
            {item.comments.length}
          </span>
          {item.mine && <span className="text-[11px] font-semibold text-brand">Raised by your store</span>}
        </div>
      </div>

      {/* right: status */}
      <div className="flex shrink-0 flex-col items-end justify-between">
        <div className="flex items-center gap-[6px] rounded-[20px] border border-[#e6e6e6] px-[10px] py-1">
          <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
          <span className="text-[11px] font-semibold text-[#555]">{meta.label}</span>
        </div>
        {item.shippedIn && (
          <span className="mt-2 text-[11px] font-semibold text-success">
            {isBug ? "Fixed" : "Shipped"} in {item.shippedIn}
          </span>
        )}
      </div>
    </div>
  );
}
