"use client";

import { Check } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { getCurrentStation } from "@/lib/identity";

/**
 * Bug-only auto-captured context (§5.1) — the tool gathered everything; the
 * associate types nothing. Fixed sample context per the wires; when real tool
 * surfaces exist they publish their live context into the store and this
 * panel reads it instead. The "Sample data" chip keeps the fake honest until
 * then — a canned capture must never read as a real one.
 */
// PROTOTYPE-ONLY: canned capture rows. CONTRACT: the row shape (label + value)
// is what real tool surfaces will publish into the store.
// ASSUMPTION: "Station POS-3 · v1.3.2" is demo copy — real station/app
// versions come with tool integration.
const CONTEXT_ROWS: [string, string][] = [
  ["Tool / mode", "Print Studio · Standard editor"],
  ["File", "Smith_BizCard_v2.pdf · 3.5 × 2 in · 300 dpi · CMYK"],
  ["Product spec", "Business cards · SKU 24704 · 0.125 in bleed"],
  ["What happened", "Resize to 4 × 3.5 in → app stopped responding"],
  ["Recent steps", "Opened file → Standard → Resize → Apply (froze)"],
  ["Environment", `Store ${getCurrentStation().id} · Station POS-3 · v1.3.2 · Jul 1, 2:14 PM`],
];

export function CapturedContextPanel() {
  const attachFile = useFeedbackStore((s) => s.attachFile);
  const toggleAttach = useFeedbackStore((s) => s.toggleAttach);

  return (
    <div className="mt-4 overflow-hidden rounded-[10px] border border-[#e6e6e6]">
      <div className="flex items-center gap-2 border-b border-[#eee] bg-[#f7f7f7] px-[14px] py-[10px]">
        <Check size={15} strokeWidth={2} className="text-success" />
        <span className="text-[12px] font-bold text-[#444]">We've already captured the context</span>
        <span
          data-testid="sample-data-badge"
          title="Demo rows — live capture arrives when the tool surfaces publish their context"
          className="rounded-full border border-[#e3d3ae] bg-[#fdf6e7] px-[7px] py-[2px] text-[10px] font-semibold text-[#8a6d1f]"
        >
          Sample data
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-[#999]">no typing needed</span>
      </div>

      <div className="flex flex-col gap-[9px] px-[14px] py-[13px]">
        {CONTEXT_ROWS.map(([key, value]) => (
          <div key={key} className="flex gap-[10px]">
            <span className="w-[118px] shrink-0 text-[11px] text-[#999]">{key}</span>
            <span className="text-[12px] font-medium text-[#444]">{value}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleAttach}
        role="checkbox"
        aria-checked={attachFile}
        className="flex w-full cursor-pointer items-center gap-[11px] border-t border-[#eee] px-[14px] py-3 text-left"
        style={{ background: attachFile ? "#fbf5f5" : "#fff" }}
      >
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px]"
          style={{
            borderColor: attachFile ? "#CC0000" : "#c4c4c4",
            background: attachFile ? "#CC0000" : "#fff",
          }}
        >
          {attachFile && <Check size={13} strokeWidth={2.6} className="text-white" />}
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold text-[#444]">Attach the customer file that misbehaved</div>
          <div className="text-[11px] text-[#999]">Smith_BizCard_v2.pdf · handled as sensitive, purged in 14 days.</div>
        </div>
      </button>
    </div>
  );
}
