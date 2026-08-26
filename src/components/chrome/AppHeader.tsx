"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bell, MessageSquare, Search } from "lucide-react";
import { useFeedbackStore, selectUnreadCount } from "@/store";

/**
 * Suite top navigation (redesign plan §2.1 — figma "Top Navigation" on
 * Staples red; slimmed to 50px and divider strokes dropped by request).
 * Tabs per decision of record #4: all five render, the three without
 * surfaces stay disabled. Feedback + notifications keep their functions
 * (no-dropped-functions rule) restyled for the red bar.
 */
const SUITE_TABS: { label: string; href: Route | null; testId: string }[] = [
  { label: "Publisher", href: "/layout", testId: "suite-publisher" },
  { label: "Bench", href: null, testId: "suite-bench" },
  { label: "Photo Editor", href: "/photo", testId: "suite-photo" },
  { label: "Layouts", href: null, testId: "suite-layouts" },
  { label: "Recent Jobs", href: null, testId: "suite-recent" },
];

export function AppHeader() {
  const pathname = usePathname();
  const store = useFeedbackStore((s) => s.store);
  const openReport = useFeedbackStore((s) => s.openReport);
  const toggleNotif = useFeedbackStore((s) => s.toggleNotif);
  const unread = useFeedbackStore(selectUnreadCount);

  return (
    <header className="relative z-20 flex h-[50px] shrink-0 items-center gap-2 bg-brand px-3 sm:gap-3 sm:px-4">
      <Link href="/" className="flex shrink-0 items-center" aria-label="PrintStudio home">
        <span className="text-[15px] font-bold text-white">PrintStudio</span>
      </Link>

      <nav className="hidden h-full items-stretch md:flex" aria-label="Suite">
        {SUITE_TABS.map(({ label, href, testId }) => {
          const active = href !== null && pathname.startsWith(href);
          if (href === null) {
            return (
              <span
                key={label}
                data-testid={testId}
                aria-disabled="true"
                title="Coming later in the beta"
                className="flex cursor-not-allowed items-center px-3 text-[12.5px] text-white/60 lg:px-4"
              >
                {label}
              </span>
            );
          }
          return (
            <Link
              key={label}
              href={href}
              data-testid={testId}
              aria-current={active ? "page" : undefined}
              className={`flex items-center px-3 text-[12.5px] text-white lg:px-4 ${
                active ? "bg-brand-press font-semibold" : "hover:bg-brand-press/60"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* PROTOTYPE-ONLY: inert global-search face (a span, deliberately not an
          input) — product/template/order search is a future suite surface. */}
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="hidden h-8 w-full max-w-[500px] items-center gap-2 rounded-[6px] bg-white px-3 md:flex">
          <Search size={15} strokeWidth={1.9} className="shrink-0 text-[#9a9a9a]" />
          <span className="truncate text-[12px] text-[#757575]">
            Search products, templates, orders — or paste a file link
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* PROTOTYPE-ONLY: location suffix is the figma literal — the station
            identity only carries a store number today. */}
        <span className="hidden text-[12px] text-white/90 lg:inline">Store {store} (Natick, MA)</span>

        <button
          type="button"
          onClick={openReport}
          data-testid="give-feedback"
          aria-label="Give feedback"
          className="flex cursor-pointer items-center gap-[7px] rounded-[7px] bg-white/15 px-[9px] py-[6px] hover:bg-white/25 sm:px-[11px]"
        >
          <MessageSquare size={15} strokeWidth={1.8} className="text-white" />
          <span className="hidden text-[12px] font-semibold text-white sm:inline">Give feedback</span>
        </button>

        <button
          type="button"
          aria-label="Notifications"
          data-testid="notif-bell"
          onClick={toggleNotif}
          className="relative flex h-[33px] w-[33px] cursor-pointer items-center justify-center rounded-[7px] bg-white/15 hover:bg-white/25"
        >
          <Bell size={17} strokeWidth={1.8} className="text-white" />
          {unread > 0 && (
            <span className="absolute -right-[6px] -top-[6px] flex h-[17px] min-w-[17px] items-center justify-center rounded-[9px] border-2 border-brand bg-white px-1 text-[10px] font-bold text-brand">
              {unread}
            </span>
          )}
        </button>

        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand"
          aria-hidden="true"
        >
          OP
        </span>
      </div>
    </header>
  );
}
