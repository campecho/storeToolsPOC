"use client";

import { ChevronLeft, Tag, X } from "lucide-react";
import { useFeedbackStore } from "@/store";
import { SimilarItemsPanel } from "./SimilarItemsPanel";
import { CapturedContextPanel } from "./CapturedContextPanel";

/** Step "bug" / "feature" — the one-sentence form; the tool captures the rest. */
export function StepForm() {
  const step = useFeedbackStore((s) => s.reportStep);
  const store = useFeedbackStore((s) => s.store);
  const reportTitle = useFeedbackStore((s) => s.reportTitle);
  const reportDesc = useFeedbackStore((s) => s.reportDesc);
  const reportName = useFeedbackStore((s) => s.reportName);
  const setReportTitle = useFeedbackStore((s) => s.setReportTitle);
  const setReportDesc = useFeedbackStore((s) => s.setReportDesc);
  const setReportName = useFeedbackStore((s) => s.setReportName);
  const backToChoose = useFeedbackStore((s) => s.backToChoose);
  const closeReport = useFeedbackStore((s) => s.closeReport);
  const submitReport = useFeedbackStore((s) => s.submitReport);

  const isBug = step === "bug";

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-[18px] sm:px-7 sm:py-[22px]">
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            aria-label="Back"
            onClick={backToChoose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[7px] border border-[#e6e6e6] hover:bg-[#f5f5f5]"
          >
            <ChevronLeft size={14} strokeWidth={2} className="text-[#777]" />
          </button>
          <div className="text-[16px] font-bold text-ink">{isBug ? "Report a problem" : "Request a feature"}</div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={closeReport}
          className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-[#e6e6e6] hover:bg-[#f5f5f5]"
        >
          <X size={15} strokeWidth={2} className="text-[#777]" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-1 pt-5 sm:px-7">
        <div className="mb-[7px] text-[12px] font-semibold text-[#555]">
          {isBug ? "What went wrong?" : "What do you want?"}
        </div>
        <input
          value={reportTitle}
          onChange={(e) => setReportTitle(e.target.value)}
          placeholder={isBug ? "e.g. Large-format resize freezes the app" : "e.g. Save a customer’s brand colors to reuse"}
          data-testid="report-title"
          className="h-[42px] w-full rounded-[8px] border border-[#d4d4d4] px-[13px] text-[13px] text-[#333] outline-none focus:border-brand"
        />

        <SimilarItemsPanel />

        <div className="mb-[7px] mt-4 text-[12px] font-semibold text-[#555]">
          {isBug ? "Anything to add? (optional)" : "Why it would help (optional)"}
        </div>
        <textarea
          value={reportDesc}
          onChange={(e) => setReportDesc(e.target.value)}
          placeholder={isBug ? "One line on what you were doing when it broke." : "One line on the problem it solves for you."}
          data-testid="report-desc"
          className="h-[70px] w-full resize-none rounded-[8px] border border-[#d4d4d4] px-[13px] py-[10px] text-[13px] leading-[1.5] text-[#333] outline-none focus:border-brand"
        />

        {isBug ? (
          <CapturedContextPanel />
        ) : (
          <div className="mt-[14px] flex items-center gap-[9px] rounded-[9px] border border-[#eef] bg-[#f7f9fd] px-[13px] py-[11px]">
            <Tag size={15} strokeWidth={1.9} className="text-info" />
            <span className="text-[12px] text-[#555]">
              Tagged to <span className="font-bold text-info">Design editor</span> automatically — where you are right
              now.
            </span>
          </div>
        )}

        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <div className="mb-[7px] text-[12px] font-semibold text-[#555]">
              Your name <span className="font-normal text-[#aaa]">(optional)</span>
            </div>
            <input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Leave blank to post as your store only"
              className="h-10 w-full rounded-[8px] border border-[#d4d4d4] px-[13px] text-[13px] text-[#333] outline-none focus:border-brand"
            />
          </div>
        </div>
        <div className="mt-2 text-[11px] text-[#999]">
          Tracked to <span className="font-semibold text-[#666]">Store {store}</span>.
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-[#f0f0f0] px-5 py-4 sm:px-7">
        <div className="flex-1" />
        <button
          type="button"
          onClick={closeReport}
          className="flex h-10 cursor-pointer items-center rounded-[8px] border border-[#d4d4d4] px-4 text-[13px] font-semibold text-[#555] hover:bg-[#f5f5f5]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submitReport}
          data-testid="report-submit"
          className="flex h-10 cursor-pointer items-center rounded-[8px] bg-brand px-[22px] text-[13px] font-semibold text-white hover:bg-brand-press"
        >
          {isBug ? "File the problem" : "File the request"}
        </button>
      </div>
    </>
  );
}
