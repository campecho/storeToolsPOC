/**
 * Preflight inspector tab (redesign plan §2.5 / Phase 6). PROTOTYPE-ONLY:
 * static empty state — the rule engine (overflow, safe zone, bleed, hairline,
 * image resolution, missing fonts) and the live issue cards land in plan
 * Phase 6; until then the tab reads honestly as "no checks run yet".
 */
export function PreflightTab() {
  return (
    <div className="flex flex-col gap-3" data-testid="preflight-tab">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#111]">Preflight Check</span>
      </div>
      <div className="rounded-[7px] border border-[#ececec] bg-[#fafafa] p-3 text-[11.5px] leading-relaxed text-[#777]">
        Print-readiness checks — missing fonts, low-resolution images, text overflow, bleed and
        safe-zone problems — arrive later in the beta. Nothing is checked yet.
      </div>
    </div>
  );
}
