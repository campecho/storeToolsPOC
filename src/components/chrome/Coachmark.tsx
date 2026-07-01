"use client";

import { X } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { useOverlayTransition } from "@/lib/use-overlay-transition";

/**
 * First-visit coachmark pointing at the header's Give-feedback button
 * (wire: dark #1a1a1a tooltip, top 58px / right 150px, dismissible).
 * Rendered by the Home page only.
 */
export function Coachmark() {
  const open = useFeedbackStore((s) => s.coachOpen);
  const dismiss = useFeedbackStore((s) => s.dismissCoach);

  const phase = useOverlayTransition(open, 190);
  if (phase === "closed") return null;
  const closing = phase === "closing";

  return (
    <div
      className={`fixed right-[150px] top-[58px] z-40 w-[250px] rounded-[10px] bg-ink px-[15px] py-[14px] shadow-[0_12px_30px_rgba(0,0,0,.28)] ${
        closing ? "pointer-events-none animate-pop-out" : "animate-pop-in"
      }`}
    >
      <div className="absolute -top-[7px] right-[56px] h-[14px] w-[14px] rotate-45 bg-ink" />
      <div className="flex items-start justify-between gap-[10px]">
        <div className="text-[13px] font-bold text-white">Hit a snag or have an idea?</div>
        <button type="button" aria-label="Dismiss" onClick={dismiss} className="shrink-0 cursor-pointer">
          <X size={14} strokeWidth={2} className="text-[#999]" />
        </button>
      </div>
      <div className="mt-[5px] text-[12px] leading-[1.5] text-[#c8c8c8]">
        Tell us right here — it takes seconds, and stores upvote the ones that matter.
      </div>
    </div>
  );
}
