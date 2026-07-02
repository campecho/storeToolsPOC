"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useFeedbackStore } from "@/store";

/**
 * Tracker sub-bar (wire: 46px, white, bottom border #ececec) — shown on the
 * board & releases only. Active tab = red fill; back link returns Home.
 */
export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const resetDemo = useFeedbackStore((s) => s.resetDemo);
  // Explicit navigation closes an open drawer (prototype go() behavior) —
  // otherwise returning to the board silently re-opens a stale detail.
  const closeDetail = useFeedbackStore((s) => s.closeDetail);

  const tab = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-[7px] px-[13px] py-[7px] text-[13px] font-semibold sm:px-[15px] ${
      active ? "bg-brand text-white" : "bg-white text-[#666]"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar relative z-10 flex h-[46px] shrink-0 items-center gap-2 overflow-x-auto border-b border-[#ececec] bg-white px-3 sm:gap-[10px] sm:px-4">
        <Link
          href="/"
          onClick={closeDetail}
          aria-label="Back to Print Studio"
          className="flex shrink-0 items-center gap-[5px] text-[12px] font-medium text-[#666] hover:text-brand"
        >
          <ChevronLeft size={15} strokeWidth={2} />
          <span className="hidden sm:inline">Back to Print Studio</span>
        </Link>
        <div className="mx-[6px] hidden h-5 w-px bg-[#e6e6e6] sm:block" />
        <Link
          href="/feedback/board"
          onClick={closeDetail}
          className={tab(pathname.startsWith("/feedback/board"))}
        >
          The board
        </Link>
        <Link
          href="/feedback/releases"
          onClick={closeDetail}
          className={tab(pathname.startsWith("/feedback/releases"))}
        >
          What's new
        </Link>
        <div className="min-w-[8px] flex-1" />
        {/* Demo affordance, not a wire element: restores the pristine seed data. */}
        <button
          type="button"
          onClick={resetDemo}
          data-testid="reset-demo"
          className="shrink-0 cursor-pointer whitespace-nowrap text-[11px] text-[#c2c2c2] hover:text-[#888]"
        >
          Reset demo data
        </button>
      </div>
      {children}
    </div>
  );
}
