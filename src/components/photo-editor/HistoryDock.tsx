"use client";

import { useEffect, useRef } from "react";
import type { PhotoDocument } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";

/**
 * History dock (wire Section D, ~lines 848–858) — opens from the print strip's
 * `History · N` button as a DOCKED card anchored under the strip's right end
 * (absolute-positioned; the parent canvas column is `relative`). It is not the
 * contextual panel and not a rail task.
 *
 * The step list is the recipe made human: step 0 = "Open {name}", then every
 * op's label in order. Cursor mapping — list index s ↔ cursor s (step 0 ↔
 * cursor 0, op k ↔ cursor k+1). A step is APPLIED when s ≤ cursor, is the
 * CURRENT step when s === cursor (red left bar + tint), and is a muted redo-tail
 * step when s > cursor. Clicking a step sets the cursor to that index (the store
 * clears the crop draft / preview op itself).
 *
 * Closes on the header ✕, Escape, or a click outside the card. The outside-click
 * handler ignores the toggle button (`[data-history-toggle]`) so its own onClick
 * owns the toggle rather than fighting a close.
 */
export function HistoryDock({
  doc,
  open,
  onClose,
}: {
  doc: PhotoDocument;
  open: boolean;
  onClose: () => void;
}) {
  const setCursor = usePhotoStore((s) => s.setCursor);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (dockRef.current?.contains(t)) return;
      if (t.closest("[data-history-toggle]")) return; // let the strip button toggle
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const { recipe, cursor } = doc;
  const steps = [`Open ${doc.name}`, ...recipe.map((op) => op.label)];

  return (
    <div
      ref={dockRef}
      data-testid="photo-history-dock"
      className="absolute right-2 top-9 z-30 flex w-[210px] flex-col rounded-[8px] border border-[#e2e2e2] bg-white shadow-[0_3px_14px_rgba(0,0,0,.22)]"
    >
      <div className="flex items-center border-b border-[#efefef] px-3 py-[11px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]">History</div>
        <div className="flex-1" />
        <span className="mr-2 text-[10px] text-[#aaa]">{steps.length} steps</span>
        <button
          type="button"
          aria-label="Close history"
          onClick={onClose}
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px] border border-[#dcdcdc] text-[10px] text-[#999] hover:bg-[#f4f4f4]"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[320px] flex-1 overflow-y-auto p-2">
        {steps.map((label, s) => {
          const current = s === cursor;
          const redoTail = s > cursor;
          return (
            <button
              key={s}
              type="button"
              data-testid={`history-step-${s}`}
              onClick={() => setCursor(s)}
              aria-current={current ? "step" : undefined}
              className={`flex h-7 w-full cursor-pointer items-center px-[9px] text-left text-[11px] ${
                current
                  ? "rounded-[0_5px_5px_0] border-l-2 border-brand bg-brand-tint font-semibold text-brand-deep"
                  : redoTail
                    ? "rounded-[5px] text-[#bbb] hover:bg-[#f7f7f7]"
                    : "rounded-[5px] text-[#777] hover:bg-[#f4f4f4]"
              }`}
            >
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-[#efefef] px-3 py-[9px] text-[10px] text-[#aaa]">
        Click any step to go back to that point.
      </div>
    </div>
  );
}
