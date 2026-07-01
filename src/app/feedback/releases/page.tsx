"use client";

import { Star } from "lucide-react";
import { useFeedbackStore } from "@/store";

/**
 * Releases placeholder — the banner plus a bare version list so the sub-bar tab
 * has a destination. The full What's new surface (release cards with features,
 * fixes, credits, and item cross-links) lands in Step 5.
 */
export default function ReleasesPage() {
  const impact = useFeedbackStore((s) => s.impact);
  const releases = useFeedbackStore((s) => s.releases);

  return (
    <div className="mx-auto w-full max-w-[760px] flex-1 p-[26px]">
      <div className="mb-5 flex items-center gap-[14px] rounded-[12px] border border-brand-border bg-brand-tint px-[20px] py-[18px]">
        <Star size={22} strokeWidth={1.8} className="shrink-0 text-brand" />
        <div>
          <div className="text-[16px] font-bold text-ink">You asked, we delivered.</div>
          <div className="mt-[2px] text-[12px] text-[#8a6262]">
            Feedback from your store has helped ship <span className="font-bold text-brand">{impact} improvements</span>.
          </div>
        </div>
      </div>

      <div className="mb-4 text-[11px] text-[#bbb]">(full release cards land in Step 5)</div>

      <div className="flex flex-col gap-3 pb-8">
        {releases.map((r) => (
          <div key={r.version} className="flex items-baseline gap-3 rounded-[10px] border border-[#eaeaea] bg-white p-4">
            <span className="rounded-[6px] bg-ink px-2 py-[3px] text-[11px] font-bold text-white">{r.version}</span>
            <span className="text-[12px] text-[#999]">{r.date}</span>
            <span className="text-[14px] font-semibold text-[#333]">{r.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
