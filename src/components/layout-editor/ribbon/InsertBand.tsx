// `Image` aliased: jsx-a11y/alt-text mistakes the lucide glyph for an <img>.
import { Image as ImageIcon, Link, Shapes, Table } from "lucide-react";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Insert command band (wire 2b · Insert): Pages · Text & media ·
 * Illustrations · Links. Static chrome in L2 — Add page goes live in L6;
 * Text box / Picture arm their tools in L4; Shapes / Table / Hyperlink stay
 * inert placeholders for the deferred slices.
 */

/** 52×52 white command tile — the band's big-control chrome. */
function Tile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 rounded-[6px] border border-[#dcdcdc] bg-white text-[#555]">
      {icon}
      <span className="text-[9.5px]">{label}</span>
    </div>
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

export function InsertBand() {
  return (
    <>
      <RibbonGroup label="Pages" wide gap7>
        <div className="flex gap-[6px]">
          <Tile label="Add page" icon={<AddPageIcon />} />
          <Tile label="Masters" icon={<MastersIcon />} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Text & media" wide gap7>
        <div className="flex gap-[6px]">
          <Tile label="Text box" icon={<TextBoxIcon />} />
          <Tile label="Picture" icon={<ImageIcon size={18} strokeWidth={1.6} />} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Illustrations" wide gap7>
        <div className="flex gap-[6px]">
          <Tile label="Shapes" icon={<Shapes size={18} strokeWidth={1.6} />} />
          <Tile label="Table" icon={<Table size={18} strokeWidth={1.6} />} />
        </div>
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
