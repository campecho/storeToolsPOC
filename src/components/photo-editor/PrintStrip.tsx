"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import {
  dpiChipCopy,
  dpiVerdict,
  effectiveDims,
  effectiveDpi,
  printSizeLabel,
  type DpiVerdict,
} from "@/lib/photo/geometry";
import { PRINT_SIZES } from "@/lib/photo/sizes";

/**
 * Print-correctness strip (wire region 4, handoff Section A ~113–134 / Section C
 * ~735–807), pinned above the canvas — LIVE at PE5.
 *
 * Segments, left→right (each separated by a 1px divider):
 *   • pixel dims — the EFFECTIVE image (master + applied recipe, ops[0..cursor)),
 *     so it tracks crops/rotates/bleed live under undo/redo;
 *   • Target — "not set" or the print size + product label, with a "Change ▾"
 *     dropdown of PRINT_SIZES (+ "No target size") wired to setTarget;
 *   • DPI check chip — green/amber/red with the wire's exact size-qualified copy
 *     (dpiChipCopy) once a target is set, else the neutral "Pick a print size to
 *     check DPI"; amber gains "Fix →", red "Upscale →" — both open Fix for print
 *     (advisory, NEVER blocking — no export gating anywhere);
 *   • Bleed — the applied bleedExpand's amount with a ✓, else "not set" + "Add →";
 *   • colour note — the export intent, with the one-click Convert-to-CMYK
 *     affordance (dev #6, beyond the wires) and a revert link back to sRGB;
 *   • right-pinned `History · N` button (N = cursor + 1 — the Open step counts).
 *
 * setTarget / setIntent are DOCUMENT MUTATIONS (not history ops) — picking a size
 * or flipping intent updates the strip, the DPI chip, the guides, and the panel
 * live without touching the recipe cursor (store §3.4).
 */

interface ChipPalette {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

const CHIP_PALETTE: Record<DpiVerdict, ChipPalette> = {
  green: { bg: "#EEF6EF", border: "#cfe3d2", text: "#357040", dot: "#4c9a5c" },
  amber: { bg: "#FCF3E6", border: "#ecd9b8", text: "#9a6a1a", dot: "#c98a2b" },
  red: { bg: "#FBEBEB", border: "#f0c9c9", text: "#9a1818", dot: "#CC0000" },
};

/** Inches without trailing zeros — 0.125 → "0.125", 0.1 → "0.1". */
function fmtInches(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** "not set" or "4 × 6 in" / "3.5 × 2 in · Business card" — the product label is
    appended only when it adds information beyond the bare size (our POC presets
    label 4×6 "4 × 6" but Business card "Business card"). */
function targetLabel(target: PhotoDocument["target"]): string {
  if (!target.size) return "not set";
  const sizeLabel = printSizeLabel(target.size);
  const product = target.product?.label;
  return product && product !== sizeLabel ? `${sizeLabel} in · ${product}` : `${sizeLabel} in`;
}

export function PrintStrip({
  doc,
  historyOpen,
  onToggleHistory,
}: {
  doc: PhotoDocument;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  const setTarget = usePhotoStore((s) => s.setTarget);
  const setIntent = usePhotoStore((s) => s.setIntent);
  const setActiveTool = usePhotoStore((s) => s.setActiveTool);

  const [menuOpen, setMenuOpen] = useState(false);
  const targetWrapRef = useRef<HTMLDivElement>(null);

  // Close the target dropdown on any outside click / Escape (StrictMode-safe —
  // listeners install only while open and are removed on close/unmount).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!targetWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const { source, target, recipe, cursor } = doc;
  const appliedOps = recipe.slice(0, cursor);
  const eff = effectiveDims({ w: source.width, h: source.height }, appliedOps);

  // DPI: computed only when a target size is set; the verdict picks the palette
  // AND the copy so colour and words always agree.
  const dpi = target.size ? effectiveDpi(eff, target.size) : null;
  const verdict = dpi != null ? dpiVerdict(dpi) : null;

  // Bleed: applied when a bleedExpand op sits in the applied slice.
  const bleedOp = [...appliedOps].reverse().find((o) => o.op === "bleedExpand");
  const bleedApplied = bleedOp?.op === "bleedExpand" ? bleedOp : null;

  const isCmyk = target.intent === "cmyk";
  const colorNote = isCmyk ? "CMYK · GRACoL at export" : "sRGB · converted for press at export";

  return (
    <div
      data-testid="photo-print-strip"
      className="relative flex h-9 shrink-0 items-center gap-[11px] border-b border-[#e6e6e6] bg-white px-[14px] text-[11.5px]"
    >
      <span data-testid="photo-strip-dims" className="whitespace-nowrap text-[#777]">
        {Math.round(eff.w)} × {Math.round(eff.h)} px
      </span>

      <Divider />

      {/* TARGET + Change ▾ dropdown. */}
      <div ref={targetWrapRef} className="relative flex items-center gap-[11px]">
        <span className="whitespace-nowrap font-semibold text-[#555]">
          Target: {targetLabel(target)}
        </span>
        <button
          type="button"
          data-testid="photo-target-change"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="cursor-pointer whitespace-nowrap text-[11px] text-[#086DD2] hover:text-brand"
        >
          Change ▾
        </button>

        {menuOpen && (
          <div
            role="listbox"
            data-testid="photo-target-menu"
            className="absolute left-0 top-[calc(100%+4px)] z-20 w-[220px] rounded-[7px] border border-[#e0e0e0] bg-white py-1 shadow-[0_3px_14px_rgba(0,0,0,.16)]"
          >
            {PRINT_SIZES.map((preset) => {
              const active = target.product?.sku === preset.sku;
              return (
                <button
                  key={preset.sku}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-testid={`photo-target-size-${preset.sku}`}
                  onClick={() => {
                    setTarget({
                      size: preset.inches,
                      product: { sku: preset.sku, label: preset.label },
                      bleed: preset.bleed,
                    });
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-[11px] py-[5px] text-left text-[11.5px] hover:bg-[#f6f6f6] ${
                    active ? "font-semibold text-brand-deep" : "text-[#555]"
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-[10.5px] text-[#999]">
                    {printSizeLabel(preset.inches)} in
                  </span>
                </button>
              );
            })}
            <div className="my-1 h-px bg-[#eee]" />
            <button
              type="button"
              role="option"
              aria-selected={target.size === null}
              data-testid="photo-target-size-none"
              onClick={() => {
                setTarget({ size: null, product: null, bleed: 0 });
                setMenuOpen(false);
              }}
              className={`flex w-full px-[11px] py-[5px] text-left text-[11.5px] hover:bg-[#f6f6f6] ${
                target.size === null ? "font-semibold text-brand-deep" : "text-[#777]"
              }`}
            >
              No target size
            </button>
          </div>
        )}
      </div>

      <Divider />

      {/* DPI CHECK CHIP — live green/amber/red once a target is set. */}
      {dpi != null && verdict ? (
        <DpiChip
          dpi={dpi}
          verdict={verdict}
          copy={dpiChipCopy(dpi, verdict, printSizeLabel(target.size!))}
          onFix={() => setActiveTool("fixprint")}
        />
      ) : (
        <span
          data-testid="photo-dpi-chip"
          data-verdict="none"
          className="whitespace-nowrap rounded-[10px] border border-[#e0e0e0] bg-[#f4f4f4] px-[9px] py-[2px] text-[10.5px] font-semibold text-[#999]"
        >
          Pick a print size to check DPI
        </span>
      )}

      <Divider />

      {/* BLEED. */}
      {bleedApplied ? (
        <span
          data-testid="photo-bleed-state"
          className="flex items-center gap-[4px] whitespace-nowrap font-semibold text-[#357040]"
        >
          Bleed: {fmtInches(bleedApplied.amount)} in
          <span aria-hidden>✓</span>
        </span>
      ) : (
        <span className="flex items-center gap-[6px]">
          <span className="whitespace-nowrap text-[#999]">Bleed: not set</span>
          <button
            type="button"
            data-testid="photo-bleed-add"
            onClick={() => setActiveTool("fixprint")}
            className="cursor-pointer whitespace-nowrap text-[11px] font-semibold text-brand hover:text-brand-press"
          >
            Add →
          </button>
        </span>
      )}

      <Divider />

      {/* COLOUR NOTE + one-click intent affordance (dev #6). */}
      <span className="flex items-center gap-[7px]">
        <span className="whitespace-nowrap text-[#999]">{colorNote}</span>
        {isCmyk
          ? source.colorSpace === "rgb" && (
              <button
                type="button"
                data-testid="photo-revert-srgb"
                onClick={() => setIntent("srgb")}
                title="Export in screen sRGB instead"
                className="cursor-pointer whitespace-nowrap text-[11px] text-[#086DD2] hover:text-brand"
              >
                sRGB ←
              </button>
            )
          : (
              <button
                type="button"
                data-testid="photo-convert-cmyk"
                onClick={() => setIntent("cmyk")}
                title="Convert to the shop's GRACoL press profile at export"
                className="cursor-pointer whitespace-nowrap text-[11px] font-semibold text-brand hover:text-brand-press"
              >
                Convert to CMYK (GRACoL) →
              </button>
            )}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        data-testid="photo-history"
        data-history-toggle=""
        onClick={onToggleHistory}
        aria-expanded={historyOpen}
        title="Show edit history"
        className={`flex h-6 cursor-pointer items-center gap-[6px] rounded-[5px] border px-[9px] text-[11px] ${
          historyOpen
            ? "border-brand bg-[#fff7f7] text-brand-deep"
            : "border-[#dcdcdc] bg-white text-[#666] hover:border-[#c8c8c8]"
        }`}
      >
        <Clock size={12} strokeWidth={1.7} className={historyOpen ? "text-brand" : "text-[#777]"} />
        History · {cursor + 1}
      </button>
    </div>
  );
}

/** The green/amber/red DPI chip with the wire's palette + dot; amber/red carry an
    underlined click-through into Fix for print (advisory, never blocking). */
function DpiChip({
  dpi,
  verdict,
  copy,
  onFix,
}: {
  dpi: number;
  verdict: DpiVerdict;
  copy: string;
  onFix: () => void;
}) {
  const p = CHIP_PALETTE[verdict];
  const action = verdict === "amber" ? "Fix →" : verdict === "red" ? "Upscale →" : null;
  return (
    <span
      data-testid="photo-dpi-chip"
      data-verdict={verdict}
      data-dpi={dpi}
      className="flex items-center gap-[6px] whitespace-nowrap rounded-[10px] border px-[9px] py-[2px] text-[10.5px] font-semibold"
      style={{ background: p.bg, borderColor: p.border, color: p.text }}
    >
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: p.dot }}
      />
      {copy}
      {action && (
        <button
          type="button"
          data-testid="photo-dpi-fix"
          onClick={onFix}
          className="cursor-pointer font-bold underline"
          style={{ color: p.text }}
        >
          {action}
        </button>
      )}
    </span>
  );
}

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-[#e6e6e6]" />;
}
