"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, MessageSquare, Search } from "lucide-react";
import { useFeedbackStore, selectUnreadCount } from "@/store";

/**
 * Suite top navigation (redesign plan §2.1 — figma "Top Navigation" on
 * Staples red; slimmed to 50px, divider strokes dropped, and rearranged to
 * the 2026-08-26 mock: mark + wordmark, search on the left, tabs on the
 * right — full white with a white underline on the active tab — then the
 * store label). Tabs per decision of record #4: all five render, the three
 * without surfaces stay non-navigable (aria-disabled). Feedback +
 * notifications keep their functions (no-dropped-functions rule) even
 * though the mock's crop ends at the store label.
 */
const SUITE_TABS: { label: string; href: Route | null; testId: string; caret?: boolean }[] = [
  { label: "Publisher", href: "/layout", testId: "suite-publisher" },
  { label: "Bench", href: null, testId: "suite-bench" },
  { label: "Photo Editor", href: "/photo", testId: "suite-photo" },
  { label: "Layouts", href: null, testId: "suite-layouts", caret: true },
  { label: "Recent Jobs", href: null, testId: "suite-recent" },
];

/** The mock's logo mark — a rounded frame open at the bottom. */
function LogoMark() {
  return (
    <svg width="21" height="15" viewBox="0 0 21 15" fill="none" aria-hidden="true">
      <path
        d="M2.5 14V7a4.5 4.5 0 0 1 4.5-4.5h7A4.5 4.5 0 0 1 18.5 7v7"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const store = useFeedbackStore((s) => s.store);
  const openReport = useFeedbackStore((s) => s.openReport);
  const toggleNotif = useFeedbackStore((s) => s.toggleNotif);
  const unread = useFeedbackStore(selectUnreadCount);

  return (
    <header className="relative z-20 flex h-[50px] shrink-0 items-center gap-2 bg-brand px-3 sm:gap-3 sm:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-[9px]" aria-label="PrintStudio home">
        <LogoMark />
        <span className="text-[16px] font-bold text-white">PrintStudio</span>
      </Link>

      {/* PROTOTYPE-ONLY: inert global-search face (a span, deliberately not an
          input) — product/template/order search is a future suite surface. */}
      <div className="hidden h-[30px] w-full max-w-[460px] shrink items-center gap-2 rounded-full bg-white px-[14px] md:flex">
        <Search size={15} strokeWidth={1.9} className="shrink-0 text-[#9a9a9a]" />
        <span className="truncate text-[12.5px] text-[#757575]">
          Search products, templates, orders — or paste a file link
        </span>
      </div>

      <div className="min-w-0 flex-1" />

      <nav className="hidden h-full items-stretch md:flex" aria-label="Suite">
        {SUITE_TABS.map(({ label, href, testId, caret }) => {
          const active = href !== null && pathname.startsWith(href);
          if (href === null) {
            return (
              <span
                key={label}
                data-testid={testId}
                aria-disabled="true"
                title="Coming later in the beta"
                className="flex cursor-not-allowed items-center gap-[4px] whitespace-nowrap px-3 text-[13.5px] font-medium text-white lg:px-[15px]"
              >
                {label}
                {caret && <ChevronDown size={12} strokeWidth={2.2} className="mt-[1px]" />}
              </span>
            );
          }
          return (
            <Link
              key={label}
              href={href}
              data-testid={testId}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center whitespace-nowrap px-3 text-[13.5px] text-white lg:px-[15px] ${
                active ? "font-bold" : "font-medium hover:bg-white/10"
              }`}
            >
              {label}
              {active && <div className="absolute bottom-0 left-3 right-3 h-[3px] bg-white" />}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* PROTOTYPE-ONLY: location suffix is the figma literal — the station
            identity only carries a store number today. */}
        <span className="hidden text-[13px] text-white lg:inline">
          <span className="font-bold">Store {store}</span> (Natick, MA)
        </span>

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
