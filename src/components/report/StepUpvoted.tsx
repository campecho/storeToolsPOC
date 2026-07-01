"use client";

import { useRouter } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { useFeedbackStore } from "@/store";

/** Step "upvoted" — the store backed an existing item instead of filing a duplicate. */
export function StepUpvoted() {
  const router = useRouter();
  const store = useFeedbackStore((s) => s.store);
  const upvotedId = useFeedbackStore((s) => s.upvotedId);
  const items = useFeedbackStore((s) => s.items);
  const closeReport = useFeedbackStore((s) => s.closeReport);

  const upvotedTitle = items.find((i) => i.id === upvotedId)?.title ?? "";

  const seeOnBoard = () => {
    closeReport();
    router.push("/feedback/board");
  };

  return (
    <div className="px-[34px] py-10 text-center">
      <div className="relative mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand-tint">
        <div className="absolute inset-0 animate-ring-expand rounded-full border-2 border-brand" />
        <ChevronUp size={28} strokeWidth={2.4} className="text-brand" />
      </div>
      <div className="text-[18px] font-bold text-ink">Your store's backing is in.</div>
      <div className="mx-auto mt-2 max-w-[420px] text-[13px] leading-[1.5] text-[#777]">
        Added Store {store} to <span className="font-semibold text-[#444]">"{upvotedTitle}"</span>. You'll be notified
        when its status changes.
      </div>
      <button
        type="button"
        onClick={seeOnBoard}
        className="mt-[22px] inline-flex h-[42px] cursor-pointer items-center rounded-[8px] bg-brand px-[22px] text-[13px] font-semibold text-white hover:bg-brand-press"
      >
        See it on the board
      </button>
    </div>
  );
}
