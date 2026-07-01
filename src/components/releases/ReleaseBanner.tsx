"use client";

import { useFeedbackStore } from "@/store";
import { SparkStar } from "@/components/ui/SparkStar";

/** Releases banner (wire): "You asked, we delivered." with the store's impact tally. */
export function ReleaseBanner() {
  const impact = useFeedbackStore((s) => s.impact);

  return (
    <div className="mb-[26px] flex items-center gap-4 rounded-[12px] border border-[#ecd7d7] bg-brand-tint px-5 py-[18px]">
      <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] border border-brand-border bg-white">
        <SparkStar size={22} className="text-brand" />
      </div>
      <div className="flex-1">
        <div className="text-[16px] font-bold text-ink">You asked, we delivered.</div>
        <div className="mt-[2px] text-[13px] text-[#7a6a6a]">
          Feedback from your store has helped ship <span className="font-bold text-brand">{impact} improvements</span>.
        </div>
      </div>
    </div>
  );
}
