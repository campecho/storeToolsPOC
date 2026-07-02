"use client";

import { Bell, MessageSquare, Search } from "lucide-react";
import { useFeedbackStore, selectUnreadCount } from "@/store";

/**
 * Persistent app header — present on every surface so "Give feedback" is the
 * suite-wide entry point (wire: 52px, #f0f0f0, bottom border #e0e0e0).
 * The bell shows the unread badge; its dropdown lands in Step 6.
 */
export function AppHeader() {
  const store = useFeedbackStore((s) => s.store);
  const openReport = useFeedbackStore((s) => s.openReport);
  const toggleNotif = useFeedbackStore((s) => s.toggleNotif);
  const unread = useFeedbackStore(selectUnreadCount);

  return (
    <header className="relative z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-[#e0e0e0] bg-[#f0f0f0] px-3 sm:gap-[14px] sm:px-4">
      <div className="flex shrink-0 items-center gap-2">
        <div className="rounded-[3px] bg-brand px-2 py-1 text-[13px] font-bold text-white">Staples</div>
        <span className="text-[14px] font-bold text-[#333]">Print Studio</span>
      </div>

      {/* PROTOTYPE-ONLY: inert global-search face (a span, deliberately not an
          input) and the avatar circle below — file/product search and the
          associate menu are future suite surfaces. Collapses below md; the
          spacer keeps the right-hand controls pinned to the edge on phones. */}
      <div className="flex flex-1 justify-center">
        <div className="hidden h-8 w-full max-w-[440px] items-center gap-2 rounded-[6px] border border-[#d6d6d6] bg-white px-3 md:flex">
          <Search size={15} strokeWidth={1.9} className="text-[#9a9a9a]" />
          <span className="truncate text-[12px] text-[#9a9a9a]">Open a file or pick a product…</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden text-[12px] text-[#777] sm:inline">Store {store}</span>

        <button
          type="button"
          onClick={openReport}
          data-testid="give-feedback"
          aria-label="Give feedback"
          className="flex cursor-pointer items-center gap-[7px] rounded-[7px] border border-brand-border-soft bg-white px-[9px] py-[6px] hover:bg-brand-tint sm:px-[11px]"
        >
          <MessageSquare size={15} strokeWidth={1.8} className="text-brand" />
          <span className="hidden text-[12px] font-semibold text-brand sm:inline">Give feedback</span>
        </button>

        <button
          type="button"
          aria-label="Notifications"
          data-testid="notif-bell"
          onClick={toggleNotif}
          className="relative flex h-[33px] w-[33px] cursor-pointer items-center justify-center rounded-[7px] border border-[#e0e0e0] bg-white hover:bg-[#f6f6f6]"
        >
          <Bell size={17} strokeWidth={1.8} className="text-[#555]" />
          {unread > 0 && (
            <span className="absolute -right-[6px] -top-[6px] flex h-[17px] min-w-[17px] items-center justify-center rounded-[9px] border-2 border-[#f0f0f0] bg-brand px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>

        <div className="h-7 w-7 rounded-full bg-[#d3d3d3]" />
      </div>
    </header>
  );
}
