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

  const tab = (active: boolean) =>
    `rounded-[7px] px-[15px] py-[7px] text-[13px] font-semibold ${
      active ? "bg-brand text-white" : "bg-white text-[#666]"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-10 flex h-[46px] shrink-0 items-center gap-[10px] border-b border-[#ececec] bg-white px-4">
        <Link
          href="/"
          className="flex items-center gap-[5px] text-[12px] font-medium text-[#666] hover:text-brand"
        >
          <ChevronLeft size={15} strokeWidth={2} />
          Back to Print Studio
        </Link>
        <div className="mx-[6px] h-5 w-px bg-[#e6e6e6]" />
        <Link href="/feedback/board" className={tab(pathname.startsWith("/feedback/board"))}>
          The board
        </Link>
        <Link href="/feedback/releases" className={tab(pathname.startsWith("/feedback/releases"))}>
          What's new
        </Link>
        <div className="flex-1" />
        {/* Demo affordance, not a wire element: restores the pristine seed data. */}
        <button
          type="button"
          onClick={resetDemo}
          data-testid="reset-demo"
          className="cursor-pointer text-[11px] text-[#c2c2c2] hover:text-[#888]"
        >
          Reset demo data
        </button>
      </div>
      {children}
    </div>
  );
}
