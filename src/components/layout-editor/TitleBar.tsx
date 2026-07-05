"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useLayoutStore } from "@/store";
import { effectivePageSize } from "@/lib/layout/geometry";
import { sizeLabel } from "@/lib/layout/presets";
import { formatLen } from "@/lib/layout/units";

/**
 * Editor title bar (wire region 1). Deviation #1 (plan §2): the persistent
 * suite header above already carries the Staples badge, store label, and the
 * global actions — so this bar swaps the wire's duplicated chrome and window
 * controls for a back link, keeping the doc name, size hint, experience
 * switch, and help glyph. Name and hint are live against the document (L3).
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
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#e0e0e0] bg-[#f0f0f0] px-[14px]">
      <Link
        href="/"
        data-testid="editor-back"
        className="flex shrink-0 items-center gap-[5px] text-[12px] font-medium text-[#666] hover:text-brand"
      >
        <ChevronLeft size={15} strokeWidth={2} />
        Back
      </Link>
      <div className="h-5 w-px shrink-0 bg-[#dcdcdc]" />

      <div className="flex min-w-0 items-center gap-[9px]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="doc-name"
          aria-label="Publication name"
          className="w-[190px] truncate rounded-[3px] bg-transparent px-1 text-[13px] font-semibold text-[#333] outline-none hover:bg-[#e9e9e9] focus:bg-white focus:ring-1 focus:ring-[#d0d0d0]"
        />
        <span className="shrink-0 text-[12px] text-[#9a9a9a]" data-testid="size-hint">
          · {sizeLabel(size.w, size.h)} · {formatLen(size.w, unit)} × {formatLen(size.h, unit)} {unit}
        </span>
      </div>

      <div className="flex-1" />

      {/* Experience levels (design doc §3.3) — surface-only, never the file.
          Two levels since plan v1.3 (Pro dropped); Simple renders disabled
          until switching lands in plan step L14. */}
      <div
        data-testid="experience-switch"
        className="flex shrink-0 items-center rounded-[6px] bg-[#e7e7e7] p-[2px] text-[11px] text-[#777]"
      >
        <span className="cursor-not-allowed rounded-[4px] px-[11px] py-[3px] opacity-60" title="Coming later in the beta">
          Simple
        </span>
        <span className="rounded-[4px] bg-white px-[11px] py-[3px] text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]">
          Standard
        </span>
      </div>

      <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#b6b6b6] text-[11px] text-[#9a9a9a]">
        ?
      </div>
    </div>
  );
}
