"use client";

import { PagesPane } from "../pages/PagesPane";

/**
 * Left panel (redesign plan §2.5 — figma Pages panel, 189px): pages and
 * masters only. The old vertical Pages/Assets/Layers/Review tab strip
 * retired in Phase 3 — Layers and the import Review moved to the right
 * inspector, Assets to Insert → Assets (decision of record #3).
 */
export function SidePanel() {
  return (
    <div
      data-testid="side-panel"
      className="flex w-[189px] shrink-0 flex-col border-r border-[#ececec] bg-white"
    >
      <PagesPane />
    </div>
  );
}
