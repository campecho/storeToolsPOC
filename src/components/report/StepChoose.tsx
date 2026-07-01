"use client";

import { useRouter } from "next/navigation";
import { Lightbulb, TriangleAlert, X } from "lucide-react";
import { useFeedbackStore } from "@/store";

/** Step "choose" — Report a problem vs. Request a feature. */
export function StepChoose() {
  const router = useRouter();
  const closeReport = useFeedbackStore((s) => s.closeReport);
  const chooseType = useFeedbackStore((s) => s.chooseType);

  const browseBoard = () => {
    closeReport();
    router.push("/feedback/board");
  };

  return (
    <div className="px-7 py-[26px]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[19px] font-bold text-ink">Give feedback</div>
          <div className="mt-[3px] text-[13px] text-[#888]">One sentence from you — we capture the rest.</div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={closeReport}
          className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-[#e6e6e6] hover:bg-[#f5f5f5]"
        >
          <X size={15} strokeWidth={2} className="text-[#777]" />
        </button>
      </div>

      <div className="mt-[22px] flex gap-[14px]">
        <button
          type="button"
          onClick={() => chooseType("bug")}
          data-testid="choose-bug"
          className="flex-1 cursor-pointer rounded-[11px] border-[1.5px] border-[#e6e6e6] p-5 text-left hover:border-brand hover:bg-brand-tint"
        >
          <div className="mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[9px] bg-brand-tint">
            <TriangleAlert size={20} strokeWidth={1.8} className="text-brand" />
          </div>
          <div className="text-[15px] font-bold text-ink">Report a problem</div>
          <div className="mt-1 text-[12px] leading-[1.45] text-[#888]">
            Something broke or looks wrong. We'll attach what you were doing automatically.
          </div>
        </button>

        <button
          type="button"
          onClick={() => chooseType("feature")}
          data-testid="choose-feature"
          className="flex-1 cursor-pointer rounded-[11px] border-[1.5px] border-[#e6e6e6] p-5 text-left hover:border-brand hover:bg-brand-tint"
        >
          <div className="mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[9px] bg-info-tint">
            <Lightbulb size={20} strokeWidth={1.8} className="text-info" />
          </div>
          <div className="text-[15px] font-bold text-ink">Request a feature</div>
          <div className="mt-1 text-[12px] leading-[1.45] text-[#888]">
            An idea to make the tool better. We'll tag it to where you are.
          </div>
        </button>
      </div>

      <div onClick={browseBoard} className="mt-5 cursor-pointer text-center text-[12px] text-info">
        or browse the feedback board →
      </div>
    </div>
  );
}
