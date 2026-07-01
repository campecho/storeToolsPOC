"use client";

import { ChevronUp, MessageSquare } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { statusMeta } from "@/schema";

/**
 * Board placeholder — enough of the ranked list (votes-desc, type tags, status
 * pills, upvote toggle, new-item highlight) to complete the Step 2 flows.
 * The full board — left rail with impact card, type/status/scope filters,
 * store spotlight, search, and the detail drawer — lands in Step 3.
 */
export default function BoardPage() {
  const items = useFeedbackStore((s) => s.items);
  const highlightId = useFeedbackStore((s) => s.highlightId);
  const justVotedId = useFeedbackStore((s) => s.justVotedId);
  const upvote = useFeedbackStore((s) => s.upvote);

  const ranked = [...items].sort((a, b) => b.votes - a.votes);

  return (
    <div className="mx-auto w-full max-w-[900px] flex-1 p-[26px]">
      <div className="mb-1 text-[17px] font-bold text-ink">What stores are asking for</div>
      <div className="mb-4 text-[12px] text-[#999]">
        {ranked.length} items · All stores · ranked by store votes
        <span className="ml-2 text-[11px] text-[#bbb]">(full board with filters &amp; detail lands in Step 3)</span>
      </div>

      <div className="flex flex-col gap-[10px] pb-8">
        {ranked.map((item) => {
          const meta = statusMeta(item.type, item.status);
          const highlighted = item.id === highlightId;
          return (
            <div
              key={item.id}
              data-testid={`board-item-${item.id}`}
              className="flex items-center gap-[14px] rounded-[10px] border bg-white p-3"
              style={{
                borderColor: highlighted ? "#CC0000" : "#e6e6e6",
                boxShadow: highlighted ? "0 0 0 3px rgba(204,0,0,.12)" : "0 1px 3px rgba(0,0,0,.05)",
              }}
            >
              <button
                type="button"
                onClick={() => upvote(item.id)}
                data-testid={`upvote-${item.id}`}
                className="flex w-[56px] shrink-0 cursor-pointer flex-col items-center rounded-[8px] border py-[7px]"
                style={{
                  background: item.votedByMe ? "#CC0000" : "#fff",
                  borderColor: item.votedByMe ? "#CC0000" : "#d4d4d4",
                  color: item.votedByMe ? "#fff" : "#666",
                }}
              >
                <ChevronUp size={15} strokeWidth={2.2} />
                <span
                  className="text-[13px] font-bold"
                  style={item.id === justVotedId ? { display: "inline-block", animation: "pulseCount .6s ease" } : undefined}
                >
                  {item.votes}
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="mb-[3px] flex items-center gap-2">
                  <span
                    className="rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold uppercase tracking-[.04em]"
                    style={
                      item.type === "bug"
                        ? { color: "#CC0000", background: "#FBEBEB" }
                        : { color: "#086DD2", background: "#eef4fb" }
                    }
                  >
                    {item.type === "bug" ? "Bug" : "Feature request"}
                  </span>
                  <span className="text-[11px] text-[#999]">{item.area}</span>
                </div>
                <div className="text-[14px] font-semibold text-[#333]">{item.title}</div>
                <div className="mt-[3px] flex items-center gap-3 text-[11px] text-[#999]">
                  <span>
                    {item.votes} stores · {item.districts} districts
                  </span>
                  {item.comments.length > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare size={11} strokeWidth={2} />
                      {item.comments.length}
                    </span>
                  )}
                  {item.mine && <span className="font-semibold text-brand">Raised by your store</span>}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-[6px]">
                <span className="flex items-center gap-2 rounded-[20px] border border-[#e0e0e0] px-[10px] py-1 text-[11px] font-semibold text-[#555]">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                  {meta.label}
                </span>
                {item.shippedIn && (
                  <span className="text-[11px] font-semibold text-success">
                    {item.type === "bug" ? "Fixed" : "Shipped"} in {item.shippedIn}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
