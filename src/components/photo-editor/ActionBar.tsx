"use client";

import { useRef } from "react";
import {
  Check,
  Columns2,
  Frame,
  Loader2,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  Redo2,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import type { PhotoTool } from "@/lib/store/photo-store";
import { useAutoEnhance } from "./useAutoEnhance";

/**
 * Action bar (wire region 2). Left: undo/redo (recipe-cursor bounds), Auto-enhance
 * (PE4 — LIVE via the shared useAutoEnhance hook), and Compare.
 *
 * COMPARE is now dual-mode (PE4), disambiguated by press duration measured from a
 * pointerdown timestamp against COMPARE_HOLD_MS (300 ms):
 *   • quick CLICK (< 300 ms)  → toggles SPLIT VIEW (store.splitView; aria-pressed,
 *     active red tint). No peek flashes on a click — the peek only begins if the
 *     press crosses the threshold.
 *   • press-and-HOLD (≥ 300 ms) → the original peek: `comparing` flips true while
 *     held and clears on release, with NO split-view toggle.
 * A timer arms the visible peek at the threshold; the release path reads the
 * timestamp to decide click-vs-hold.
 *
 * Right, under the uppercase "Quick fixes" label: Fix bleed / Fit to size /
 * Convert format NAVIGATE (Fix bleed + Fit to size → Fix for print, Convert
 * format → Export). The `⋯` overflow is inert.
 */

/** Press-duration threshold splitting a Compare click (toggle split view) from a
    hold (peek the original). */
const COMPARE_HOLD_MS = 300;

export function ActionBar({
  doc,
  onUndo,
  onRedo,
  onSelectTool,
}: {
  doc: PhotoDocument;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTool: (tool: PhotoTool) => void;
}) {
  const setComparing = usePhotoStore((s) => s.setComparing);
  const splitView = usePhotoStore((s) => s.splitView);
  const setSplitView = usePhotoStore((s) => s.setSplitView);
  const autoEnhance = useAutoEnhance();

  // Compare press bookkeeping: the pointerdown timestamp, the peek-arming timer,
  // and whether the peek actually engaged (so release knows it was a hold).
  const press = useRef<{ t: number; timer: number | null; peeking: boolean } | null>(null);

  const canUndo = doc.cursor > 0;
  const canRedo = doc.cursor < doc.recipe.length;

  const iconBtn = "flex h-7 w-[30px] items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white";

  const onComparePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const timer = window.setTimeout(() => {
      // Crossed the hold threshold → begin the peek.
      setComparing(true);
      if (press.current) press.current.peeking = true;
    }, COMPARE_HOLD_MS);
    press.current = { t: Date.now(), timer, peeking: false };
  };

  const endComparePress = () => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    if (p.timer != null) clearTimeout(p.timer);
    if (p.peeking || Date.now() - p.t >= COMPARE_HOLD_MS) {
      // It was a hold-peek — release it, never toggle.
      setComparing(false);
    } else {
      // A quick click toggles split view.
      setSplitView(!splitView);
    }
  };

  const cancelComparePress = () => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    if (p.timer != null) clearTimeout(p.timer);
    setComparing(false);
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[#e6e6e6] bg-[#fafafa] px-3">
      <div className="flex gap-[5px]">
        <button
          type="button"
          data-testid="photo-undo"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? "Undo" : "Nothing to undo"}
          className={`${iconBtn} ${canUndo ? "cursor-pointer text-[#555] hover:bg-[#f4f4f4]" : "cursor-not-allowed opacity-40"}`}
        >
          <Undo2 size={14} strokeWidth={1.7} className="text-[#555]" />
        </button>
        <button
          type="button"
          data-testid="photo-redo"
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? "Redo" : "Nothing to redo"}
          className={`${iconBtn} ${canRedo ? "cursor-pointer text-[#555] hover:bg-[#f4f4f4]" : "cursor-not-allowed opacity-40"}`}
        >
          <Redo2 size={14} strokeWidth={1.7} className="text-[#555]" />
        </button>
      </div>

      <div className="h-5 w-px bg-[#e2e2e2]" />

      <button
        type="button"
        data-testid="photo-auto-enhance"
        onClick={autoEnhance.run}
        disabled={autoEnhance.busy}
        title="Auto-enhance — histogram stretch + white balance, one undoable step"
        className={`flex h-7 items-center gap-[6px] rounded-[5px] border border-[#dcdcdc] bg-white px-[10px] text-[12px] text-[#555] ${
          autoEnhance.busy ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-[#f4f4f4]"
        }`}
      >
        {autoEnhance.busy ? (
          <>
            <Loader2 size={13} strokeWidth={2} className="animate-spin text-[#666]" />
            Enhancing…
          </>
        ) : autoEnhance.balanced ? (
          <>
            <Check size={13} strokeWidth={2.2} className="text-brand" />
            Already balanced
          </>
        ) : (
          <>
            <Sparkles size={13} strokeWidth={1.6} className="text-brand" />
            Auto-enhance
          </>
        )}
      </button>
      <button
        type="button"
        data-testid="photo-compare"
        aria-pressed={splitView}
        title="Click for split view · hold to peek the original"
        onPointerDown={onComparePointerDown}
        onPointerUp={endComparePress}
        onPointerCancel={cancelComparePress}
        className={`flex h-7 cursor-pointer items-center gap-[6px] rounded-[5px] border px-[10px] text-[12px] ${
          splitView
            ? "border-brand bg-brand-tint text-brand-deep"
            : "border-[#dcdcdc] bg-white text-[#555] hover:bg-[#f4f4f4]"
        }`}
      >
        <Columns2 size={13} strokeWidth={1.6} className={splitView ? "text-brand-deep" : "text-[#666]"} />
        Compare <span className={`text-[10px] ${splitView ? "text-brand-muted" : "text-[#aaa]"}`}>hold</span>
      </button>

      <div className="flex-1" />

      <span className="mr-[2px] text-[10px] font-bold uppercase tracking-[0.04em] text-[#a6a6a6]">Quick fixes</span>

      <QuickFix
        testId="photo-quick-fixbleed"
        label="Fix bleed"
        title="Fix bleed — opens Fix for print"
        onClick={() => onSelectTool("fixprint")}
        icon={<Maximize2 size={13} strokeWidth={1.7} className="text-brand" />}
      />
      <QuickFix
        testId="photo-quick-fit"
        label="Fit to size"
        title="Fit to size — opens Fix for print"
        onClick={() => onSelectTool("fixprint")}
        icon={<Frame size={13} strokeWidth={1.7} className="text-brand" />}
      />
      <QuickFix
        testId="photo-quick-convert"
        label="Convert format"
        title="Convert format — opens Export"
        onClick={() => onSelectTool("export")}
        icon={<RefreshCw size={13} strokeWidth={1.7} className="text-brand" />}
      />

      <div className="h-5 w-px bg-[#e2e2e2]" />

      <button
        type="button"
        disabled
        title="More actions — coming later"
        className="flex h-7 w-[30px] cursor-not-allowed items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white text-[#777] opacity-60"
      >
        <MoreHorizontal size={16} strokeWidth={1.7} />
      </button>
    </div>
  );
}

function QuickFix({
  testId,
  label,
  title,
  onClick,
  icon,
}: {
  testId: string;
  label: string;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      onClick={onClick}
      className="flex h-[30px] cursor-pointer items-center gap-[7px] rounded-[5px] border border-[#d6d6d6] bg-white px-3 text-[12px] font-semibold text-[#444] hover:border-brand hover:bg-[#fff7f7]"
    >
      {icon}
      {label}
    </button>
  );
}
