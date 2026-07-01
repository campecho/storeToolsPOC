"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useFeedbackStore } from "@/store";

/** Board-entry / recognition card — the store's impact tally plus the way into the board. */
export function BoardEntryCard() {
  const impact = useFeedbackStore((s) => s.impact);

  return (
    <div className="flex items-center gap-4 rounded-[10px] border border-dashed border-[#d8d8d8] bg-[#fbfbfb] px-[18px] py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-brand-border bg-brand-tint">
        <MessageSquare size={20} strokeWidth={1.8} className="text-brand" />
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-[#3a3a3a]">
          Feedback from your store helped ship <span className="text-brand">{impact} improvements</span>
        </div>
        <div className="mt-[2px] text-[12px] text-[#888]">
          Hit a snag or have an idea? Tell us — it takes seconds, and stores upvote the ones that matter.
        </div>
      </div>
      <Link
        href="/feedback/board"
        data-testid="open-board"
        className="cursor-pointer whitespace-nowrap text-[12px] font-semibold text-brand"
      >
        Open the board →
      </Link>
    </div>
  );
}
