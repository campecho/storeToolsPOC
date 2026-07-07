"use client";

import { useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { useLayoutStore } from "@/store";

/**
 * Import status banner (plan P1 follow-up). The `.pub` import records whether
 * it ran live or in fixture (demo) mode, but that used to be invisible in the
 * UI — a fixture fallback looked identical to a real conversion, which reads
 * as "the tool is broken." This surfaces it:
 *  - fixture mode → an unmissable amber banner ("this is sample content, not
 *    your file") with the reason and the fix;
 *  - live mode with degradations → a quiet info line ("N items need review")
 *    pointing at the report (the full panel is P4).
 * Dismissible; clears when a new document loads (importReport resets).
 */
export function ImportBanner() {
  const report = useLayoutStore((s) => s.importReport);
  const togglePanelTab = useLayoutStore((s) => s.togglePanelTab);
  const [dismissed, setDismissed] = useState(false);

  if (!report || dismissed) return null;

  if (report.mode === "fixture") {
    return (
      <div
        data-testid="import-fixture-banner"
        className="flex shrink-0 items-start gap-2 border-b border-[#e5c07b] bg-[#fdf6e3] px-4 py-2 text-[12px] text-[#7a5b00]"
      >
        <AlertTriangle size={15} strokeWidth={2} className="mt-[1px] shrink-0 text-[#b8860b]" />
        <div className="flex-1 leading-relaxed">
          <span className="font-semibold">Demo mode — this is sample content, not your file.</span>{" "}
          The Publisher converter (<code className="rounded bg-[#f2e6c4] px-1">libmspub-tools</code>) isn&rsquo;t
          available on this server, so the importer served a built-in demo publication. Run the Docker image (which
          bundles the converter), or install <code className="rounded bg-[#f2e6c4] px-1">libmspub-tools</code> where
          the app runs. Check <code className="rounded bg-[#f2e6c4] px-1">GET /api/import</code> for the exact reason.
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          data-testid="import-banner-dismiss"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-[2px] text-[#b8860b] hover:bg-[#f2e6c4]"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    );
  }

  const { converted, degraded, flagged } = report.fidelity;
  const total = converted + degraded + flagged;
  const needsReview = degraded + flagged;

  // Empty conversion (real find in the corpus: master-page-only templates —
  // libmspub can't read master pages). An empty canvas with no explanation is
  // the same silent-confusion trap as invisible fixture mode, so say why.
  if (total === 0) {
    const why =
      report.notes.find((n) => n.message.includes("master pages"))?.message ??
      "no drawable page content was found in this publication";
    return (
      <div
        data-testid="import-empty-banner"
        className="flex shrink-0 items-start gap-2 border-b border-[#e5c07b] bg-[#fdf6e3] px-4 py-2 text-[12px] text-[#7a5b00]"
      >
        <AlertTriangle size={15} strokeWidth={2} className="mt-[1px] shrink-0 text-[#b8860b]" />
        <div className="flex-1 leading-relaxed">
          <span className="font-semibold">
            Imported {report.source.filename}, but there&rsquo;s nothing to show.
          </span>{" "}
          {why}.
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          data-testid="import-banner-dismiss"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-[2px] text-[#b8860b] hover:bg-[#f2e6c4]"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    );
  }

  if (needsReview === 0) return null;

  return (
    <div
      data-testid="import-review-banner"
      className="flex shrink-0 items-center gap-2 border-b border-[#cfe0f5] bg-[#f2f7fd] px-4 py-[6px] text-[12px] text-[#1c4e80]"
    >
      <Info size={14} strokeWidth={2} className="shrink-0 text-[#086dd2]" />
      <div className="flex-1 leading-relaxed">
        Imported <span className="font-semibold">{report.source.filename}</span> — {converted} converted,{" "}
        {needsReview} need review (fonts remapped, some elements simplified). Nothing was dropped silently.
      </div>
      <button
        type="button"
        data-testid="import-view-report"
        onClick={() => togglePanelTab("import")}
        className="shrink-0 cursor-pointer rounded-[5px] border border-[#b7d2f0] bg-white px-[8px] py-[2px] text-[11px] font-semibold text-[#1c4e80] hover:bg-[#eaf2fc]"
      >
        View report
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="import-banner-dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-[2px] text-[#086dd2] hover:bg-[#e2edfa]"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
