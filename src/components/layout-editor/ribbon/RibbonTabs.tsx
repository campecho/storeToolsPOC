"use client";

import { Printer, Redo2, Undo2 } from "lucide-react";
import { useLayoutStore, type RibbonTab } from "@/store";
import { FileMenu } from "./FileMenu";

const INTERACTIVE_TABS: { id: RibbonTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
];

/**
 * Editor menu bar (redesign plan §2.3 — figma 33px bar on #f0f0f0): quick
 * actions (undo/redo live, print inert), then File · Home · Insert · View ·
 * Help per decision of record #1. The old Layout/Text/Arrange tabs retired —
 * their content rehomed to the Home band groups and the inspector's Page and
 * Text tabs. The active item is red with the red underline (figma v2
 * treatment). PROTOTYPE-ONLY: View/Help stay inert, static-by-design labels,
 * and the print action is future chrome.
 */
export function RibbonTabs() {
  const ribbon = useLayoutStore((s) => s.ribbon);
  const setRibbon = useLayoutStore((s) => s.setRibbon);
  const canUndo = useLayoutStore((s) => s.past.length > 0);
  const canRedo = useLayoutStore((s) => s.future.length > 0);
  const undo = useLayoutStore((s) => s.undo);
  const redo = useLayoutStore((s) => s.redo);

  const quick =
    "flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-[#4d4d4f] disabled:cursor-default disabled:opacity-40 [&:not(:disabled)]:cursor-pointer [&:not(:disabled)]:hover:bg-[#e4e4e4]";

  return (
    <div className="flex h-[33px] shrink-0 items-center border-b border-[#e4e4e4] bg-chrome-menu px-[6px]">
      <div className="flex items-center gap-[2px] pr-2">
        <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" data-testid="menu-undo" className={quick}>
          <Undo2 size={15} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" data-testid="menu-redo" className={quick}>
          <Redo2 size={15} strokeWidth={1.8} />
        </button>
        {/* PROTOTYPE-ONLY: print is a future suite action */}
        <span className="flex h-[26px] w-[26px] items-center justify-center text-[#b0b0b0]" title="Coming later in the beta">
          <Printer size={15} strokeWidth={1.8} />
        </span>
      </div>

      <div className="flex h-full items-end gap-[2px]">
        <FileMenu />
        {INTERACTIVE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRibbon(id)}
            aria-pressed={ribbon === id}
            data-testid={`ribbon-${id}`}
            className={`relative cursor-pointer px-[14px] pb-2 pt-[7px] text-[12px] ${
              ribbon === id ? "font-semibold text-brand" : "text-[#3d3d3d]"
            }`}
          >
            {label}
            {ribbon === id && <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-brand" />}
          </button>
        ))}
        {["View", "Help"].map((label) => (
          <div key={label} className="px-[14px] pb-2 pt-[7px] text-[12px] text-[#8f8f8f]">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
