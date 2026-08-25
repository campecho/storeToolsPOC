"use client";

import { useLayoutStore } from "@/store";
import { PillButton } from "@/components/ui/PillButton";

/**
 * Master-editing banner (redesign plan Phase 8 — the figma "Masters" frame's
 * amber bar): floats over the canvas while a master is being edited, names
 * the blast radius (how many pages bind this master), and offers the way
 * back. The store's editing-surface indirection already routes every tool at
 * the master; this is the visible mode indicator the figma adds.
 */
export function MasterBanner() {
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const master = useLayoutStore((s) =>
    s.masterEditingId ? s.doc.masters.find((m) => m.id === s.masterEditingId) : undefined,
  );
  const boundPages = useLayoutStore((s) =>
    s.masterEditingId
      ? s.doc.pages.filter((p) => p.masterId === s.masterEditingId).length
      : 0,
  );
  const setMasterEditing = useLayoutStore((s) => s.setMasterEditing);

  if (!masterEditingId || !master) return null;

  return (
    <div
      data-testid="master-banner"
      className="absolute left-1/2 top-3 z-10 flex max-w-[92%] -translate-x-1/2 items-center gap-3 rounded-[6px] border border-[#ffe58f] bg-[#fffbe6] px-3 py-[6px] shadow-[0_2px_8px_rgba(0,0,0,.10)]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#faad14]" />
      <span className="min-w-0 truncate text-[11.5px] text-[#7a5b00]">
        <span className="font-semibold">Editing Master Page Mode: Master {master.label}</span>
        {" — "}
        {boundPages === 0
          ? "no document pages bind this master yet."
          : `changes here apply to ${boundPages === 1 ? "the 1 document page" : `all ${boundPages} document pages`} bound to Master ${master.label}.`}
      </span>
      <PillButton
        size="sm"
        data-testid="master-return"
        onClick={() => setMasterEditing(null)}
        className="!border-[#d19400] !bg-[#faad14] !text-white hover:!bg-[#e09c12]"
      >
        Return to Document
      </PillButton>
    </div>
  );
}
