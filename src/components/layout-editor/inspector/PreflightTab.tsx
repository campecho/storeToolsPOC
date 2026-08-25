"use client";

import { useLayoutStore } from "@/store";
import { Badge } from "@/components/ui/Badge";
import type { PreflightIssue } from "@/lib/layout/preflight";

/**
 * Preflight inspector tab (redesign plan Phase 6 — figma "Preflight" panel):
 * live status line, then Errors and Warnings sections of issue cards. A card
 * click locates the issue — jumps to its page and selects the object (when
 * the object's layer allows selection). The check itself runs headlessly in
 * PreflightCheck on every document change.
 */

function IssueCard({ issue }: { issue: PreflightIssue }) {
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const setSelection = useLayoutStore((s) => s.setSelection);
  const error = issue.severity === "error";

  return (
    <button
      type="button"
      data-testid={`preflight-issue-${issue.rule}`}
      onClick={() => {
        if (issue.pageId) setActivePage(issue.pageId);
        if (issue.objectId) setSelection([issue.objectId]);
      }}
      className={`w-full cursor-pointer rounded-[8px] border p-[10px] text-left ${
        error ? "border-[#a30000] bg-err-tint" : "border-warn-border bg-warn-tint"
      }`}
    >
      <div className={`text-[11.5px] font-bold ${error ? "text-[#a30000]" : "text-warn"}`}>
        {issue.title}
      </div>
      <div className="mt-1 text-[10.5px] leading-relaxed text-[#4d4d4f]">{issue.detail}</div>
      <div className="mt-[6px] inline-block rounded-[4px] bg-[#f0f0f0] px-[6px] py-[1px] text-[9.5px] text-[#757575]">
        {issue.location}
      </div>
    </button>
  );
}

export function PreflightTab() {
  const issues = useLayoutStore((s) => s.preflightIssues);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="flex flex-col gap-3" data-testid="preflight-tab">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#111]">Preflight Check</span>
        <span className="text-[10px] text-[#9a9a9a]">live</span>
      </div>

      {issues.length === 0 ? (
        <div
          data-testid="preflight-clean"
          className="rounded-[7px] border border-ok bg-ok-tint p-3 text-[11.5px] leading-relaxed text-ok"
        >
          No issues found — the document is print-ready as far as the live checks can tell.
        </div>
      ) : (
        <>
          <div
            data-testid="preflight-status"
            className="flex items-center gap-[7px] text-[11.5px] font-semibold text-brand"
          >
            <span className="h-2 w-2 rounded-full bg-brand" />
            {issues.length} issue{issues.length === 1 ? "" : "s"} found · {errors.length} error
            {errors.length === 1 ? "" : "s"}
          </div>

          {errors.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="error">{errors.length}</Badge>
                <span className="text-[11px] font-bold text-[#1d161d]">
                  Errors ({errors.length})
                </span>
              </div>
              {errors.map((i) => (
                <IssueCard key={i.id} issue={i} />
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="warn">{warnings.length}</Badge>
                <span className="text-[11px] font-bold text-[#1d161d]">
                  Warnings ({warnings.length})
                </span>
              </div>
              {warnings.map((i) => (
                <IssueCard key={i.id} issue={i} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
