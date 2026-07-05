"use client";

import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/store";
import { effectivePageSize } from "@/lib/layout/geometry";
import { PAGE_PRESETS, formatIn, getPreset, matchPreset } from "@/lib/layout/presets";
import { NumberField, SectionLabel } from "./Field";

/**
 * Page inspector tab (wire region 7, default): Product binding · Page size ·
 * Orientation · Bleed & margins — live against the document from L3. Custom
 * W/H are unrestricted print sizes (up to the large-format ceiling); the
 * preset face reads "Custom" when the dimensions match no preset. The Product
 * card's catalog link stays static until the catalog/spec-sync slice (§6).
 *
 * Page size (plan L12) carries an **Apply to** choice: "Whole document" edits
 * doc.size (every page that has no override), "This page" pins the active page
 * to its own `sizeOverride`. The size/orientation controls show — and edit —
 * whichever target is chosen; a pinned page shows a "Match document size" reset.
 */
export function PageTab() {
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const scope = useLayoutStore((s) => s.pageSizeScope);
  const setPageSizeScope = useLayoutStore((s) => s.setPageSizeScope);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const setPageSize = useLayoutStore((s) => s.setPageSize);
  const setOrientation = useLayoutStore((s) => s.setOrientation);
  const setActivePageSize = useLayoutStore((s) => s.setActivePageSize);
  const clearActivePageSize = useLayoutStore((s) => s.clearActivePageSize);
  const setBleed = useLayoutStore((s) => s.setBleed);
  const setMargin = useLayoutStore((s) => s.setMargin);
  const focusPageSize = useLayoutStore((s) => s.focusPageSize);
  const setFocusPageSize = useLayoutStore((s) => s.setFocusPageSize);

  const activePage = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
  const overridden = activePage.sizeOverride !== undefined;
  const onPage = scope === "page";
  // the size/orientation controls target — and display — the chosen scope
  const shown = onPage ? effectivePageSize(doc, activePage) : doc.size;
  const { w, h } = shown;
  const preset = matchPreset(w, h);
  const landscape = onPage ? w > h : doc.orientation === "landscape";
  const widthRef = useRef<HTMLInputElement>(null);

  // Deep-link cue (/layout?custom=1): land in the width field, ready to type.
  useEffect(() => {
    if (!focusPageSize) return;
    widthRef.current?.focus();
    widthRef.current?.select();
    setFocusPageSize(false);
  }, [focusPageSize, setFocusPageSize]);

  /** The size the chosen scope currently shows — read fresh so commits never
      stack on a stale closure between two rapid field edits. */
  const currentSize = () => {
    const st = useLayoutStore.getState();
    if (st.pageSizeScope !== "page") return st.doc.size;
    const pg = st.doc.pages.find((p) => p.id === st.activePageId);
    return effectivePageSize(st.doc, pg);
  };

  const commitSize = (nw: number, nh: number) => {
    if (onPage) setActivePageSize(nw, nh);
    else setPageSize(nw, nh);
  };

  const commitPreset = (id: string) => {
    if (!onPage) {
      applyPreset(id);
      return;
    }
    const p = getPreset(id);
    if (!p) return;
    // presets are portrait-stored — orient to match the page's current shape
    const isLandscape = currentSize().w > currentSize().h;
    setActivePageSize(isLandscape ? p.h : p.w, isLandscape ? p.w : p.h);
  };

  const commitOrientation = (next: "portrait" | "landscape") => {
    if (!onPage) {
      setOrientation(next);
      return;
    }
    const cur = currentSize();
    const lo = Math.min(cur.w, cur.h);
    const hi = Math.max(cur.w, cur.h);
    setActivePageSize(next === "portrait" ? lo : hi, next === "portrait" ? hi : lo);
  };

  const seg = (active: boolean) =>
    `flex-1 cursor-pointer rounded-[5px] py-[5px] text-center ${
      active ? "bg-white text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-[#777]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Product</SectionLabel>
        {/* PROTOTYPE-ONLY: the catalog link is inert — SKU binding lands with
            the catalog/spec-sync slice (plan §6); doc.product is already in
            the schema so bound documents render correctly today. */}
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
        {/* Apply to (plan L12): whole document, or just the active page */}
        <div className="mb-2 flex rounded-[6px] bg-[#ececec] p-[2px] text-[11.5px]">
          <button
            type="button"
            onClick={() => setPageSizeScope("document")}
            aria-pressed={!onPage}
            data-testid="size-scope-document"
            className={seg(!onPage)}
          >
            Whole document
          </button>
          <button
            type="button"
            onClick={() => setPageSizeScope("page")}
            aria-pressed={onPage}
            data-testid="size-scope-page"
            className={seg(onPage)}
          >
            This page
          </button>
        </div>
        <div className="mb-2 flex gap-2">
          <NumberField
            label="Width"
            value={w}
            onCommit={(v) => commitSize(v, currentSize().h)}
            testId="page-w"
            inputRef={widthRef}
          />
          <NumberField
            label="Height"
            value={h}
            onCommit={(v) => commitSize(currentSize().w, v)}
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
            onChange={(e) => commitPreset(e.target.value)}
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
        {/* a pinned page carries its own size — offer a reset to the doc size */}
        {overridden && (
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-[#9a9a9a]" data-testid="size-override-note">
              This page uses a custom size
            </span>
            <button
              type="button"
              onClick={clearActivePageSize}
              data-testid="size-override-clear"
              className="cursor-pointer text-info hover:underline"
            >
              Match document size
            </button>
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Orientation</SectionLabel>
        <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11.5px]">
          <button
            type="button"
            onClick={() => commitOrientation("portrait")}
            aria-pressed={!landscape}
            data-testid="orient-portrait"
            className={seg(!landscape)}
          >
            Portrait
          </button>
          <button
            type="button"
            onClick={() => commitOrientation("landscape")}
            aria-pressed={landscape}
            data-testid="orient-landscape"
            className={seg(landscape)}
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
