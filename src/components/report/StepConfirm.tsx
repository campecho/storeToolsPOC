"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useFeedbackStore } from "@/store";

/** Step "confirm" — filed, tracked to the store, auto-followed. */
export function StepConfirm() {
  const router = useRouter();
  const store = useFeedbackStore((s) => s.store);
  const newItemId = useFeedbackStore((s) => s.newItemId);
  const closeReport = useFeedbackStore((s) => s.closeReport);
  const setHighlight = useFeedbackStore((s) => s.setHighlight);

  const seeOnBoard = () => {
    setHighlight(newItemId);
    closeReport();
    router.push("/feedback/board");
  };

  return (
    <div className="px-6 py-10 text-center sm:px-[34px]">
      <div className="relative mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-full bg-success-tint">
        <div className="absolute inset-0 animate-ring-expand rounded-full border-2 border-success" />
        <Check size={30} strokeWidth={2.4} className="text-success" />
      </div>
      <div className="text-[18px] font-bold text-ink">Filed. Tracked to Store {store}.</div>
      <div className="mx-auto mt-2 max-w-[430px] text-[13px] leading-[1.5] text-[#777]">
        It's on the board now and following automatically — you'll get a ping on every status change.
      </div>
      <div className="mt-[22px] flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={closeReport}
          className="flex h-[42px] cursor-pointer items-center rounded-[8px] border border-[#d4d4d4] px-[18px] text-[13px] font-semibold text-[#555] hover:bg-[#f5f5f5]"
        >
          Back to my work
        </button>
        <button
          type="button"
          onClick={seeOnBoard}
          data-testid="confirm-see-board"
          className="flex h-[42px] cursor-pointer items-center rounded-[8px] bg-brand px-[22px] text-[13px] font-semibold text-white hover:bg-brand-press"
        >
          See it on the board
        </button>
      </div>
    </div>
  );
}
