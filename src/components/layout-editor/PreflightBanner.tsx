"use client";

import { AlertTriangle } from "lucide-react";
import { useLayoutStore } from "@/store";

/**
 * Inline preflight alert (Phase 6 — the figma's canvas banner): floats over
 * the canvas while the Preflight tab is active and errors exist, so the
 * problem reads at the point of work, not only in the panel.
 */
export function PreflightBanner() {
  const insp = useLayoutStore((s) => s.insp);
  const issues = useLayoutStore((s) => s.preflightIssues);
  const errors = issues.filter((i) => i.severity === "error").length;
  if (insp !== "preflight" || errors === 0) return null;
  const warnings = issues.length - errors;

  return (
    <div
      data-testid="preflight-banner"
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[6px] border border-[#ffccc7] bg-[#fff0f0] px-3 py-[6px] text-[11px] font-medium text-[#ff4d4f] shadow-[0_2px_8px_rgba(0,0,0,.10)]"
    >
      <AlertTriangle size={13} strokeWidth={1.9} />
      Preflight: {errors} error{errors === 1 ? "" : "s"}
      {warnings > 0 && `, ${warnings} warning${warnings === 1 ? "" : "s"}`} — review before printing.
    </div>
  );
}
