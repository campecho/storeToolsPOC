"use client";

import { useLayoutStore } from "@/store";
import { PillButton } from "@/components/ui/PillButton";
import { formatIn, sizeLabel } from "@/lib/layout/presets";
import { SectionLabel } from "./Field";

/**
 * Master Properties (redesign plan Phase 8 — the figma "Masters" frame's
 * contextual right panel): shown by the Page tab while a master is being
 * edited and nothing is selected. Template name edits live (renameMaster);
 * the canvas footprint reads the document — masters always draw at the
 * document size, so the card states it rather than pretending to edit it.
 */
export function MasterPropertiesTab() {
  const doc = useLayoutStore((s) => s.doc);
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const renameMaster = useLayoutStore((s) => s.renameMaster);
  const duplicateMaster = useLayoutStore((s) => s.duplicateMaster);

  const master = doc.masters.find((m) => m.id === masterEditingId);
  if (!master) return null;
  const bound = doc.pages.filter((p) => p.masterId === master.id).length;

  return (
    <div className="flex flex-col gap-4" data-testid="master-properties">
      <div className="text-[13px] font-semibold text-[#111]">Master Properties</div>

      <div>
        <SectionLabel>Template name</SectionLabel>
        <input
          value={master.label}
          onChange={(e) => renameMaster(master.id, e.target.value)}
          data-testid="master-name"
          aria-label="Master name"
          className="w-full rounded-[4px] border border-[#cccccc] px-2 py-[6px] text-[12px] text-[#111] outline-none focus:border-info"
        />
      </div>

      <div>
        <SectionLabel>Canvas footprint</SectionLabel>
        <div className="rounded-[7px] bg-[#f9f9f9] p-3 text-[11.5px] leading-relaxed text-[#555]">
          <div className="font-semibold text-[#333]">
            {sizeLabel(doc.size.w, doc.size.h)} ({formatIn(doc.size.w)} × {formatIn(doc.size.h)} in)
          </div>
          <div className="capitalize">{doc.orientation} layout mode</div>
          <div className="mt-1 text-[10.5px] text-[#8f8f8f]">
            Masters always draw at the document size; margins follow the document&rsquo;s{" "}
            {formatIn(doc.margin)} in setting.
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Applied to</SectionLabel>
        <div className="text-[11.5px] text-[#555]" data-testid="master-bound-count">
          {bound === 0 ? "No pages yet" : `${bound} page${bound === 1 ? "" : "s"}`} — bind pages
          from the Pages panel&rsquo;s Master pages view.
        </div>
      </div>

      <PillButton size="sm" data-testid="master-duplicate" onClick={() => duplicateMaster(master.id)}>
        Duplicate this master
      </PillButton>
    </div>
  );
}
