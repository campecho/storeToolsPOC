"use client";

import { useLayoutStore } from "@/store";
import { PAGE_PRESETS, formatIn, matchPreset, sizeLabel } from "@/lib/layout/presets";
import { RibbonGroup } from "./RibbonGroup";

/**
 * Layout command band (wire 2b · Layout): Page size · Orientation ·
 * Guides & bleed · Columns — live against the document from L3. Dropdown
 * pills keep the wire's face with a native select layered on top; the Guides
 * toggle governs the center/column guides (their snap role arrives in L7).
 */

const MARGIN_OPTIONS = [0.25, 0.5, 0.75, 1];
const BLEED_OPTIONS = [0, 0.125, 0.25];

export function LayoutBand() {
  const doc = useLayoutStore((s) => s.doc);
  const guidesVisible = useLayoutStore((s) => s.guidesVisible);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const setOrientation = useLayoutStore((s) => s.setOrientation);
  const setMargin = useLayoutStore((s) => s.setMargin);
  const setBleed = useLayoutStore((s) => s.setBleed);
  const setColumns = useLayoutStore((s) => s.setColumns);
  const toggleGuides = useLayoutStore((s) => s.toggleGuides);

  const { w, h } = doc.size;
  const preset = matchPreset(w, h);
  const portrait = doc.orientation === "portrait";

  return (
    <>
      <RibbonGroup label="Page size" wide>
        <div className="relative">
          <div className="flex h-[26px] w-[150px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[11px] text-[#555]">
            <span className="truncate">
              {sizeLabel(w, h)} · {formatIn(w)} × {formatIn(h)} in
            </span>
            <span className="text-[#b0b0b0]">▾</span>
          </div>
          <select
            value={preset?.id ?? ""}
            onChange={(e) => applyPreset(e.target.value)}
            data-testid="band-preset"
            aria-label="Page size preset"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {!preset && (
              <option value="" disabled>
                Custom
              </option>
            )}
            {PAGE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {formatIn(p.w)} × {formatIn(p.h)} in
              </option>
            ))}
          </select>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Orientation" wide>
        <div className="flex gap-[5px]">
          <button
            type="button"
            onClick={() => setOrientation("portrait")}
            aria-pressed={portrait}
            data-testid="band-portrait"
            aria-label="Portrait"
            className={`flex h-10 w-[34px] cursor-pointer items-center justify-center rounded-[5px] ${
              portrait ? "border-[1.5px] border-brand bg-[#FBEBEB]" : "border border-[#dcdcdc] bg-white"
            }`}
          >
            <div
              className={`h-[22px] w-4 rounded-[1px] border ${
                portrait ? "border-[#cc7a7a]" : "border-[#c4c4c4]"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setOrientation("landscape")}
            aria-pressed={!portrait}
            data-testid="band-landscape"
            aria-label="Landscape"
            className={`flex h-10 w-11 cursor-pointer items-center justify-center rounded-[5px] ${
              !portrait ? "border-[1.5px] border-brand bg-[#FBEBEB]" : "border border-[#dcdcdc] bg-white"
            }`}
          >
            <div
              className={`h-4 w-6 rounded-[1px] border ${
                !portrait ? "border-[#cc7a7a]" : "border-[#c4c4c4]"
              }`}
            />
          </button>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Guides & bleed" wide>
        <div className="flex gap-[5px]">
          <div className="relative">
            <div className="flex h-[26px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
              Margins ▾
            </div>
            <select
              value={MARGIN_OPTIONS.includes(doc.margin) ? String(doc.margin) : ""}
              onChange={(e) => setMargin(Number(e.target.value))}
              data-testid="band-margins"
              aria-label="Margins"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {!MARGIN_OPTIONS.includes(doc.margin) && (
                <option value="" disabled>
                  Custom ({formatIn(doc.margin)} in)
                </option>
              )}
              {MARGIN_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {formatIn(m)} in
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <div className="flex h-[26px] items-center rounded-[5px] border border-[#e0e0e0] bg-white px-[9px] text-[11px] text-[#666]">
              Bleed {formatIn(doc.bleed)}
            </div>
            <select
              value={BLEED_OPTIONS.includes(doc.bleed) ? String(doc.bleed) : ""}
              onChange={(e) => setBleed(Number(e.target.value))}
              data-testid="band-bleed"
              aria-label="Bleed"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {!BLEED_OPTIONS.includes(doc.bleed) && (
                <option value="" disabled>
                  Custom ({formatIn(doc.bleed)} in)
                </option>
              )}
              {BLEED_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {formatIn(b)} in
                </option>
              ))}
            </select>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Columns" wide last>
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex h-[26px] w-[60px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-2 text-[11px] text-[#555]">
              {doc.columns} <span className="text-[#b0b0b0]">▾</span>
            </div>
            <select
              value={doc.columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              data-testid="band-columns"
              aria-label="Columns"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {/* Guides toggle — the wire's red pill switch */}
          <button
            type="button"
            onClick={toggleGuides}
            role="switch"
            aria-checked={guidesVisible}
            aria-label="Guides"
            data-testid="band-guides"
            className="flex cursor-pointer items-center gap-[6px]"
          >
            <span
              className={`relative h-4 w-7 rounded-[8px] border ${
                guidesVisible ? "border-brand bg-[#FBEBEB]" : "border-[#cfcfcf] bg-white"
              }`}
            >
              <span
                className={`absolute top-[2px] h-3 w-3 rounded-full ${
                  guidesVisible ? "right-[2px] bg-brand" : "left-[2px] bg-[#b0b0b0]"
                }`}
              />
            </span>
            <span className="text-[10.5px] text-[#777]">Guides</span>
          </button>
        </div>
      </RibbonGroup>
    </>
  );
}
