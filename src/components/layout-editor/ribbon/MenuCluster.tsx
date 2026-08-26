"use client";

import { Printer, Redo2, Undo2 } from "lucide-react";
import { useLayoutStore, type RibbonTab } from "@/store";
import { FileMenu } from "./FileMenu";

const INTERACTIVE_TABS: { id: RibbonTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
];

/**
 * Editor menu cluster (redesign plan §2.3): quick actions (undo/redo live,
 * print inert), then File · Home · Insert · View · Help per decision of
 * record #1. Originally the figma's standalone 33px menu bar; merged into
 * the document header by request 2026-08-26, so it renders inline (the
 * host bar supplies height and background). The old Layout/Text/Arrange
 * tabs retired — their content rehomed to the Home band groups and the
 * inspector's Page and Text tabs. The active item is red with the red
 * underline (figma v2 treatment). PROTOTYPE-ONLY: View/Help stay inert,
 * static-by-design labels, and the print action is future chrome.
 */
export function MenuCluster() {
  const ribbon = useLayoutStore((s) => s.ribbon);
  const setRibbon = useLayoutStore((s) => s.setRibbon);
  const canUndo = useLayoutStore((s) => s.past.length > 0);
  const canRedo = useLayoutStore((s) => s.future.length > 0);
  const undo = useLayoutStore((s) => s.undo);
  const redo = useLayoutStore((s) => s.redo);

  const quick =
    "flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-[#4d4d4f] disabled:cursor-default disabled:opacity-40 [&:not(:disabled)]:cursor-pointer [&:not(:disabled)]:hover:bg-[#efefef]";

  return (
    <div className="flex h-full shrink-0 items-center">
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

      <div className="flex h-full items-stretch gap-[2px]">
        <div className="flex items-center">
          <FileMenu />
        </div>
        {INTERACTIVE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRibbon(id)}
            aria-pressed={ribbon === id}
            data-testid={`ribbon-${id}`}
            className={`relative flex cursor-pointer items-center px-[14px] text-[12px] ${
              ribbon === id ? "font-semibold text-brand" : "text-[#3d3d3d]"
            }`}
          >
            {label}
            {ribbon === id && <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-brand" />}
          </button>
        ))}
        {["View", "Help"].map((label) => (
          <div key={label} className="flex items-center px-[14px] text-[12px] text-[#8f8f8f]">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
