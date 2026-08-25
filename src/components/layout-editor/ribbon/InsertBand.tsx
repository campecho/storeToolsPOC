"use client";

import { useEffect, useRef, useState } from "react";
// `Image` aliased: jsx-a11y/alt-text mistakes the lucide glyph for an <img>.
import { FolderOpen, Image as ImageIcon, Link, Shapes, Table } from "lucide-react";
import { useLayoutStore } from "@/store";
import { AssetsPane } from "../panel/AssetsPane";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Insert command band (wire 2b · Insert): Pages · Text & media ·
 * Illustrations · Links. Text box / Picture arm their tools (plan L4);
 * Add page inserts after the active page (plan L6).
 * PROTOTYPE-ONLY: the Masters, Shapes, Table, and Hyperlink tiles are inert
 * placeholders for deferred slices (plan §6) — visible so the ceiling reads
 * as reachable, static until their slices land.
 */

/** 52×52 white command tile — the band's big-control chrome. */
function Tile({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  testId?: string;
}) {
  const cls =
    "flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 rounded-[6px] border border-[#dcdcdc] bg-white text-[#555]";
  if (!onClick) {
    return (
      <div className={cls}>
        {icon}
        <span className="text-[9.5px]">{label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`${cls} cursor-pointer hover:border-[#c9c9c9] hover:bg-[#fafafa]`}
    >
      {icon}
      <span className="text-[9.5px]">{label}</span>
    </button>
  );
}

/** Page-with-plus glyph (no lucide equivalent without a folded corner). */
function AddPageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

/** Two side-by-side master pages — the wire's A/B spread glyph. */
function MastersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="4" width="8" height="16" rx="1" />
      <rect x="13" y="4" width="8" height="16" rx="1" />
    </svg>
  );
}

/** Frame with text lines — a text box, distinct from the palette's serif T. */
function TextBoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="12.5" x2="14" y2="12.5" />
    </svg>
  );
}

/**
 * Assets library, rehomed behind Insert (redesign decision of record #3 —
 * the left Assets pane retired with the old side-panel strip in Phase 3):
 * the tile toggles a popover hosting the same import/place library.
 */
function AssetsTile() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <Tile
        label="Assets"
        icon={<FolderOpen size={18} strokeWidth={1.6} />}
        onClick={() => setOpen((v) => !v)}
        testId="insert-assets"
      />
      {open && (
        <div
          data-testid="assets-popover"
          className="absolute left-0 top-[58px] z-30 flex max-h-[420px] w-[240px] flex-col overflow-y-auto rounded-[8px] border border-[#dddddd] bg-white p-2 shadow-[0_4px_16px_rgba(0,0,0,.16)]"
        >
          <AssetsPane />
        </div>
      )}
    </div>
  );
}

export function InsertBand() {
  const setTool = useLayoutStore((s) => s.setTool);
  const addPage = useLayoutStore((s) => s.addPage);

  return (
    <>
      <RibbonGroup label="Pages" wide gap7>
        <Tile label="Add page" icon={<AddPageIcon />} onClick={addPage} testId="insert-addpage" />
        <Tile label="Masters" icon={<MastersIcon />} />
      </RibbonGroup>

      <RibbonGroup label="Text & media" wide gap7>
        {/* arm the matching tools (plan L4) — the tool strip shows the armed state */}
        <Tile
          label="Text box"
          icon={<TextBoxIcon />}
          onClick={() => setTool("text")}
          testId="insert-textbox"
        />
        <Tile
          label="Picture"
          icon={<ImageIcon size={18} strokeWidth={1.6} />}
          onClick={() => setTool("pic")}
          testId="insert-picture"
        />
        <AssetsTile />
      </RibbonGroup>

      <RibbonGroup label="Illustrations" wide gap7>
        <Tile label="Shapes" icon={<Shapes size={18} strokeWidth={1.6} />} />
        <Tile label="Table" icon={<Table size={18} strokeWidth={1.6} />} />
      </RibbonGroup>

      <RibbonGroup label="Links" wide last>
        <div className="flex h-[26px] items-center gap-[7px] rounded-[5px] border border-[#e0e0e0] bg-white px-[10px] text-[11px] text-[#666]">
          <Link size={13} strokeWidth={1.7} className="text-[#777]" />
          Hyperlink
        </div>
      </RibbonGroup>
    </>
  );
}
