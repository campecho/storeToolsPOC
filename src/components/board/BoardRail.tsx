"use client";

import { X } from "lucide-react";
import { useFeedbackStore } from "@/store";
import type { TypeFilter, StatusFilter, ScopeFilter } from "@/lib/board";

/**
 * Board left rail (wire: 272px, #fafafa, right border): the store-impact
 * recognition card, type/status/scope filters, and the non-ranked
 * "Stores behind v1.4" spotlight. A static sidebar at ≥lg; below lg it becomes
 * an off-canvas drawer opened from the board header's "Filters" button.
 */

const TYPE_OPTS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bug", label: "Bugs" },
  { value: "feature", label: "Requests" },
];

// No shipped filter: delivered items surface in the "Recently shipped" band
// for their first week and live permanently on the Releases surface.
const STATUS_OPTS: { value: StatusFilter; label: string; dot: string | null }[] = [
  { value: "open", label: "All open", dot: null },
  { value: "new", label: "New", dot: "#9a9a9a" },
  { value: "planned", label: "Planned", dot: "#086DD2" },
  { value: "declined", label: "Declined / closed", dot: "#bcbcbc" },
];

const SCOPE_OPTS: { value: ScopeFilter; label: string }[] = [
  { value: "all", label: "All stores (chain)" },
  { value: "region", label: "Region · Northeast" },
  { value: "district", label: "District 118" },
  { value: "mine", label: "My store #1284" },
];

// Positive, non-ranked spotlight — the store's own chip highlighted.
const TOP_STORES = ["#1190", "#0412", "#1284", "#0733", "#2051"];

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[9px] text-[11px] font-bold uppercase tracking-[.04em] text-[#5f5f5f]">{children}</div>
  );
}

export function BoardRail({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const impact = useFeedbackStore((s) => s.impact);
  const store = useFeedbackStore((s) => s.store);
  const fType = useFeedbackStore((s) => s.fType);
  const fStatus = useFeedbackStore((s) => s.fStatus);
  const fScope = useFeedbackStore((s) => s.fScope);
  const setTypeFilter = useFeedbackStore((s) => s.setTypeFilter);
  const setStatusFilter = useFeedbackStore((s) => s.setStatusFilter);
  const setScopeFilter = useFeedbackStore((s) => s.setScopeFilter);

  const chip = (active: boolean) =>
    `flex-1 cursor-pointer rounded-2xl border px-[11px] py-[6px] text-center text-[12px] font-semibold ${
      active ? "border-brand bg-brand-tint text-brand" : "border-[#dcdcdc] bg-white text-[#666]"
    }`;

  const rowChip = (active: boolean) =>
    `flex cursor-pointer items-center gap-2 rounded-[8px] px-[11px] py-2 text-left text-[12.5px] ${
      active ? "bg-brand-tint font-semibold text-brand" : "bg-transparent font-medium text-[#555]"
    }`;

  return (
    <>
      {/* backdrop for the mobile off-canvas drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-[rgba(20,20,20,.28)] lg:hidden"
          onClick={onClose}
        />
      )}
      <div
        data-testid="board-rail"
        className={`shrink-0 flex-col gap-4 overflow-auto bg-[#fafafa] lg:static lg:z-auto lg:flex lg:w-[272px] lg:max-w-none lg:animate-none lg:border-r lg:border-[#ececec] lg:p-[18px] lg:shadow-none ${
          open
            ? "flex fixed inset-y-0 left-0 z-50 w-[290px] max-w-[85vw] animate-slide-in-left border-r border-[#ececec] p-[18px] shadow-[8px_0_32px_rgba(0,0,0,.16)]"
            : "hidden"
        }`}
      >
        {/* mobile drawer header — hidden on the desktop static rail */}
        <div className="flex items-center justify-between lg:hidden">
          <span className="text-[13px] font-bold text-ink">Filters</span>
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-[#e0e0e0] bg-white hover:bg-[#f5f5f5]"
          >
            <X size={15} strokeWidth={2} className="text-[#777]" />
          </button>
        </div>

      {/* impact card */}
      <div className="rounded-[10px] border border-[#ecd7d7] bg-white p-[14px]">
        <div className="text-[11px] font-bold uppercase tracking-[.04em] text-[#b07c7c]">Your store's impact</div>
        <div className="mt-[6px] text-[26px] font-bold leading-none text-brand">{impact}</div>
        <div className="mt-[3px] text-[12px] text-[#777]">
          improvements shipped from feedback your store raised or backed.
        </div>
      </div>

      <div>
        <RailLabel>Type</RailLabel>
        <div className="flex gap-[6px]">
          {TYPE_OPTS.map((o) => (
            <button key={o.value} type="button" onClick={() => setTypeFilter(o.value)} className={chip(fType === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <RailLabel>Status</RailLabel>
        <div className="flex flex-col gap-[3px]">
          {STATUS_OPTS.map((o) => (
            <button key={o.value} type="button" onClick={() => setStatusFilter(o.value)} className={rowChip(fStatus === o.value)}>
              {o.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.dot }} />}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <RailLabel>Roll up by</RailLabel>
        <div className="flex flex-col gap-[3px]">
          {SCOPE_OPTS.map((o) => (
            <button key={o.value} type="button" onClick={() => setScopeFilter(o.value)} className={rowChip(fScope === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {/* stores behind the latest release — celebrated as participation, never a ranking */}
      <div className="rounded-[10px] border border-[#eaeaea] bg-white p-[13px]">
        <RailLabel>Stores behind v1.4</RailLabel>
        <div className="flex flex-wrap gap-[6px]">
          {TOP_STORES.map((s) => {
            const you = s === store;
            return (
              <span
                key={s}
                className="rounded-[12px] border px-2 py-[3px] text-[11px] font-semibold"
                style={
                  you
                    ? { color: "#CC0000", background: "#FBEBEB", borderColor: "#e6c4c4" }
                    : { color: "#666", background: "#f4f4f4", borderColor: "#e6e6e6" }
                }
              >
                {you ? `Store ${s} (you)` : `Store ${s}`}
              </span>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
}
