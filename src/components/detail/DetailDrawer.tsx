"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronUp, Flag, X } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { buildDetail } from "@/lib/detail";
import { useOverlayTransition } from "@/lib/use-overlay-transition";
import { StatusTimeline } from "./StatusTimeline";
import { PreservedReports } from "./PreservedReports";
import { CommentsList } from "./CommentsList";

/**
 * Item detail drawer (wire view 4) — slides in from the right over a dimmed
 * backdrop and slides back out on close: status timeline, shipped/declined
 * cards, description, big vote + follow actions, preserved per-store reports,
 * and comments.
 */
export function DetailDrawer() {
  const router = useRouter();
  const detailId = useFeedbackStore((s) => s.detailId);
  const items = useFeedbackStore((s) => s.items);
  const store = useFeedbackStore((s) => s.store);
  const closeDetail = useFeedbackStore((s) => s.closeDetail);
  const upvote = useFeedbackStore((s) => s.upvote);
  const toggleFollow = useFeedbackStore((s) => s.toggleFollow);

  const phase = useOverlayTransition(detailId != null, 230);
  const closing = phase === "closing";

  // Retain the last-open item so the exit animation has content to render.
  const [lastId, setLastId] = useState<number | null>(null);
  useEffect(() => {
    if (detailId != null) setLastId(detailId);
  }, [detailId]);

  const renderId = detailId ?? lastId;
  const item = renderId == null ? undefined : items.find((i) => i.id === renderId);
  if (phase === "closed" || !item) return null;

  const detail = buildDetail(item, store);
  const isBug = item.type === "bug";
  const voted = item.votedByMe;

  const seeRelease = () => {
    closeDetail();
    router.push("/feedback/releases");
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-[rgba(20,20,20,.28)] ${closing ? "pointer-events-none animate-fade-out" : "animate-fade-in"}`}
        onClick={closeDetail}
      />
      <aside
        data-testid="detail-drawer"
        className={`fixed right-0 top-0 z-[41] flex h-[100dvh] w-full max-w-[452px] flex-col bg-white shadow-[-8px_0_32px_rgba(0,0,0,.16)] sm:w-[452px] ${closing ? "pointer-events-none animate-slide-out" : "animate-slide-in"}`}
      >
        {/* header */}
        <div className="flex items-start gap-3 border-b border-[#eee] px-4 py-4 sm:px-[22px] sm:py-[18px]">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="rounded-[4px] px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[.03em]"
                style={isBug ? { color: "#CC0000", background: "#FBEBEB" } : { color: "#086DD2", background: "#eef4fb" }}
              >
                {isBug ? "Bug" : "Feature request"}
              </span>
              <span className="text-[11px] text-[#999]">{item.area}</span>
            </div>
            <div className="text-[16px] font-bold leading-[1.35] text-ink">{item.title}</div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closeDetail}
            className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-[#e6e6e6] hover:bg-[#f5f5f5]"
          >
            <X size={15} strokeWidth={2} className="text-[#777]" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-auto px-4 py-5 sm:px-[22px]">
          <StatusTimeline trail={detail.trail} />

          {item.shippedIn && (
            <button
              type="button"
              onClick={seeRelease}
              data-testid="detail-see-release"
              className="mb-4 flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] border border-success-border bg-[#f1f9f2] px-[14px] py-3 text-left"
            >
              <Check size={18} strokeWidth={2} className="text-success" />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-success-deep">
                  {isBug ? "Fixed" : "Shipped"} in {item.shippedIn}
                </div>
                <div className="text-[11px] text-[#6a8a70]">See the release note →</div>
              </div>
            </button>
          )}

          {item.declineReason && (
            <div className="mb-4 rounded-[9px] border border-[#eee] bg-[#fafafa] px-[14px] py-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[.03em] text-[#999]">
                Why we're not doing this
              </div>
              <div className="text-[12px] leading-[1.5] text-[#666]">{item.declineReason}</div>
            </div>
          )}

          <div className="mb-5 text-[13px] leading-[1.6] text-[#555]">{item.desc}</div>

          {/* vote + follow */}
          <div className="mb-[22px] flex gap-[10px]">
            <button
              type="button"
              data-testid="detail-upvote"
              onClick={() => upvote(item.id)}
              className={`flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[8px] border text-[13px] font-semibold ${
                voted ? "border-brand bg-brand text-white" : "border-[#d4d4d4] bg-white text-[#666]"
              }`}
            >
              <ChevronUp size={16} strokeWidth={2.3} />
              {voted ? "Backed by your store · tap to remove" : "Add your store's vote"}
            </button>
            <button
              type="button"
              data-testid="detail-follow"
              onClick={() => toggleFollow(item.id)}
              className={`flex h-[42px] w-[120px] cursor-pointer items-center justify-center gap-[7px] rounded-[8px] border text-[13px] font-semibold ${
                item.followed ? "border-brand bg-brand-tint text-brand" : "border-[#d4d4d4] bg-white text-[#666]"
              }`}
            >
              <Flag size={15} strokeWidth={1.9} />
              {item.followed ? "Following" : "Follow"}
            </button>
          </div>

          <PreservedReports backedLine={detail.backedLine} reports={detail.reportsList} />
          <CommentsList comments={detail.commentsList} />
        </div>
      </aside>
    </>
  );
}
