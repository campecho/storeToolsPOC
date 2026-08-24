"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useLayoutStore } from "@/store";
import { effectivePageSize } from "@/lib/layout/geometry";
import { sizeLabel } from "@/lib/layout/presets";
import { formatLen } from "@/lib/layout/units";

/**
 * Document header (redesign plan §2.2 — figma "Secondary navigation", 54px
 * white bar): back link, centered doc identity, autosave status. The figma
 * shows the name as static text; it stays an input so rename keeps working
 * (no-dropped-functions rule). The experience switch retired with this bar —
 * it was disabled placeholder chrome the redesign does not carry.
 */
export function TitleBar() {
  const name = useLayoutStore((s) => s.doc.name);
  // the hint reflects the visible page — its per-page override, else the doc
  // size (plan L12); a master being edited shows the document size
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const unit = useLayoutStore((s) => s.unit);
  const setName = useLayoutStore((s) => s.setName);

  const size = masterEditingId
    ? doc.size
    : effectivePageSize(doc, doc.pages.find((p) => p.id === activePageId));

  return (
    <div className="flex h-[54px] shrink-0 items-center gap-3 border-b border-[#dddddd] bg-white px-[14px]">
      <Link
        href="/"
        data-testid="editor-back"
        className="flex shrink-0 items-center gap-[5px] text-[12px] font-medium text-[#666] hover:text-brand"
      >
        <ChevronLeft size={15} strokeWidth={2} />
        Back
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-[9px]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="doc-name"
          aria-label="Publication name"
          className="w-[190px] truncate rounded-[3px] bg-transparent px-1 text-center text-[13.5px] font-semibold text-[#111] outline-none hover:bg-[#f4f4f4] focus:bg-white focus:ring-1 focus:ring-[#d0d0d0]"
        />
        <span className="shrink-0 text-[12px] text-[#9a9a9a]" data-testid="size-hint">
          · {sizeLabel(size.w, size.h)} · {formatLen(size.w, unit)} × {formatLen(size.h, unit)} {unit}
        </span>
      </div>

      {/* PROTOTYPE-ONLY: static autosave face — wired to the storage layer in
          plan Phase 7. */}
      <div
        data-testid="autosave-indicator"
        className="flex shrink-0 items-center gap-[9px] text-[12px] text-[#757575]"
      >
        <span className="hidden sm:inline">Autosaved 10:24</span>
        <Badge variant="ok">Saved</Badge>
      </div>
    </div>
  );
}
