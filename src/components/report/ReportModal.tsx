"use client";

import { useFeedbackStore } from "@/store";
import { StepChoose } from "./StepChoose";
import { StepForm } from "./StepForm";
import { StepUpvoted } from "./StepUpvoted";
import { StepConfirm } from "./StepConfirm";

/**
 * The 4-step "Give feedback" modal (wire view 2), opened from any surface:
 * choose → bug/feature form (with live similar-items) → upvoted | confirm.
 * Wire: 660px centered panel, popIn, dimmed fadeIn backdrop.
 */
export function ReportModal() {
  const open = useFeedbackStore((s) => s.reportOpen);
  const step = useFeedbackStore((s) => s.reportStep);
  const closeReport = useFeedbackStore((s) => s.closeReport);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 animate-fade-in bg-[rgba(20,20,20,.34)]"
        onClick={closeReport}
      />
      <div className="fixed left-1/2 top-1/2 z-[51] flex max-h-[min(830px,calc(100vh-40px))] w-[660px] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_24px_64px_rgba(0,0,0,.28)]">
        {step === "choose" && <StepChoose />}
        {(step === "bug" || step === "feature") && <StepForm />}
        {step === "upvoted" && <StepUpvoted />}
        {step === "confirm" && <StepConfirm />}
      </div>
    </>
  );
}
