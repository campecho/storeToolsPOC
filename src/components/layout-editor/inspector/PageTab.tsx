"use client";

import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/store";
import { PAGE_PRESETS, formatIn, matchPreset } from "@/lib/layout/presets";
import { NumberField, SectionLabel } from "./Field";

/**
 * Page inspector tab (wire region 7, default): Product binding · Page size ·
 * Orientation · Bleed & margins — live against the document from L3. Custom
 * W/H are unrestricted print sizes (up to the large-format ceiling); the
 * preset face reads "Custom" when the dimensions match no preset. The Product
 * card's catalog link stays static until the catalog/spec-sync slice (§6).
 */
export function PageTab() {
  const doc = useLayoutStore((s) => s.doc);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const setPageSize = useLayoutStore((s) => s.setPageSize);
  const setOrientation = useLayoutStore((s) => s.setOrientation);
  const setBleed = useLayoutStore((s) => s.setBleed);
  const setMargin = useLayoutStore((s) => s.setMargin);
  const focusPageSize = useLayoutStore((s) => s.focusPageSize);
  const setFocusPageSize = useLayoutStore((s) => s.setFocusPageSize);

  const { w, h } = doc.size;
  const preset = matchPreset(w, h);
  const widthRef = useRef<HTMLInputElement>(null);

  // Deep-link cue (/layout?custom=1): land in the width field, ready to type.
  useEffect(() => {
    if (!focusPageSize) return;
    widthRef.current?.focus();
    widthRef.current?.select();
    setFocusPageSize(false);
  }, [focusPageSize, setFocusPageSize]);

  const seg = (active: boolean) =>
    `flex-1 cursor-pointer rounded-[5px] py-[5px] text-center ${
      active ? "bg-white text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-[#777]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Product</SectionLabel>
        <div className="flex flex-col gap-[6px] rounded-[7px] border border-[#ececec] px-[11px] py-[10px]">
          <div className="text-[12px] text-[#555]">
            {doc.product ? doc.product.label : "Custom size — not bound to a SKU"}
          </div>
          <div className="cursor-pointer text-[11px] text-info">
            Choose a product to make it born-correct →
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Page size</SectionLabel>
        <div className="mb-2 flex gap-2">
          <NumberField
            label="Width"
            value={w}
            onCommit={(v) => setPageSize(v, useLayoutStore.getState().doc.size.h)}
            testId="page-w"
            inputRef={widthRef}
          />
          <NumberField
            label="Height"
            value={h}
            onCommit={(v) => setPageSize(useLayoutStore.getState().doc.size.w, v)}
            testId="page-h"
          />
        </div>
        {/* preset picker — wire face, native select on top for the menu */}
        <div className="relative">
          <div className="flex h-[30px] items-center justify-between rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555]">
            {preset?.label ?? "Custom"} <span className="text-[#b0b0b0]">▾</span>
          </div>
          <select
            value={preset?.id ?? ""}
            onChange={(e) => applyPreset(e.target.value)}
            data-testid="preset-select"
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
      </div>

      <div>
        <SectionLabel>Orientation</SectionLabel>
        <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11.5px]">
          <button
            type="button"
            onClick={() => setOrientation("portrait")}
            aria-pressed={doc.orientation === "portrait"}
            data-testid="orient-portrait"
            className={seg(doc.orientation === "portrait")}
          >
            Portrait
          </button>
          <button
            type="button"
            onClick={() => setOrientation("landscape")}
            aria-pressed={doc.orientation === "landscape"}
            data-testid="orient-landscape"
            className={seg(doc.orientation === "landscape")}
          >
            Landscape
          </button>
        </div>
      </div>

      <div>
        <SectionLabel>Bleed & margins</SectionLabel>
        <div className="flex gap-2">
          <NumberField label="Bleed" value={doc.bleed} onCommit={setBleed} testId="page-bleed" />
          <NumberField
            label="Margin"
            value={doc.margin}
            onCommit={setMargin}
            testId="page-margin"
          />
        </div>
      </div>
    </div>
  );
}
