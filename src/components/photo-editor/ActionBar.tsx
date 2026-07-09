"use client";

import { Columns2, Frame, Maximize2, MoreHorizontal, RefreshCw, Redo2, Sparkles, Undo2 } from "lucide-react";
import type { PhotoDocument } from "@/lib/schema/photo";
import type { PhotoTool } from "@/lib/store/photo-store";

/**
 * Action bar (wire region 2). Left: undo/redo (wired to the recipe cursor —
 * disabled at bounds), Auto-enhance and Compare (both PE4, rendered disabled
 * with honest tranche tooltips). Right, under the uppercase "Quick fixes"
 * label: Fix bleed / Fit to size / Convert format — these NAVIGATE (plan §1.1):
 * Fix bleed + Fit to size open Fix for print, Convert format opens Export. The
 * `⋯` overflow is inert.
 */
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
  const canUndo = doc.cursor > 0;
  const canRedo = doc.cursor < doc.recipe.length;

  const iconBtn = "flex h-7 w-[30px] items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white";

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
        disabled
        title="Auto-enhance lands with the adjust tranche (PE4)"
        className="flex h-7 cursor-not-allowed items-center gap-[6px] rounded-[5px] border border-[#dcdcdc] bg-white px-[10px] text-[12px] text-[#555] opacity-60"
      >
        <Sparkles size={13} strokeWidth={1.6} className="text-brand" />
        Auto-enhance
      </button>
      <button
        type="button"
        disabled
        title="Compare lands with the adjust tranche (PE4)"
        className="flex h-7 cursor-not-allowed items-center gap-[6px] rounded-[5px] border border-[#dcdcdc] bg-white px-[10px] text-[12px] text-[#555] opacity-60"
      >
        <Columns2 size={13} strokeWidth={1.6} className="text-[#666]" />
        Compare <span className="text-[10px] text-[#aaa]">hold</span>
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
