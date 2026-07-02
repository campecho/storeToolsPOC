"use client";

import { useFeedbackStore } from "@/store";
import { useOverlayTransition } from "@/lib/use-overlay-transition";
import { StepChoose } from "./StepChoose";
import { StepForm } from "./StepForm";
import { StepUpvoted } from "./StepUpvoted";
import { StepConfirm } from "./StepConfirm";

/**
 * The 4-step "Give feedback" modal (wire view 2), opened from any surface:
 * choose → bug/feature form (with live similar-items) → upvoted | confirm.
 * Wire: 660px centered panel, popIn/popOut, dimmed fadeIn/fadeOut backdrop.
 */
export function ReportModal() {
  const open = useFeedbackStore((s) => s.reportOpen);
  const step = useFeedbackStore((s) => s.reportStep);
  const closeReport = useFeedbackStore((s) => s.closeReport);

  const phase = useOverlayTransition(open, 190);
  const closing = phase === "closing";
  if (phase === "closed") return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-[rgba(20,20,20,.34)] ${closing ? "pointer-events-none animate-fade-out" : "animate-fade-in"}`}
        onClick={closeReport}
      />
      <div
        className={`fixed left-1/2 top-1/2 z-[51] flex max-h-[min(830px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-[660px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_24px_64px_rgba(0,0,0,.28)] ${
          closing ? "pointer-events-none animate-pop-out" : "animate-pop-in"
        }`}
      >
        {step === "choose" && <StepChoose />}
        {(step === "bug" || step === "feature") && <StepForm />}
        {step === "upvoted" && <StepUpvoted />}
        {step === "confirm" && <StepConfirm />}
      </div>
    </>
  );
}
