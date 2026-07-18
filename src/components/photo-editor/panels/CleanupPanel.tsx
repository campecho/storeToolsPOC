"use client";

import { Bandage, Eraser, Eye, Scissors, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePhotoStore } from "@/lib/store/photo-store";

/**
 * Clean up panel (wire Section B "Clean up", PE9). Mounts in the ContextPanel body
 * while the Clean up tool is active — it replaces the "Lands with PE9" placeholder.
 *
 * ONE tool is live: **Remove object** (the brush → server classical-fill → preview
 * loop, CleanupBrushOverlay + PreviewApproveBar). Its three siblings and the
 * "Fix an AI-generated file" card are drawn-but-inert, model-gated affordances
 * (the suite's disabled-control convention — opacity-70, cursor-not-allowed, an
 * honest title) so the surface reads true without promising work the model service
 * hasn't shipped. The brush-size slider writes the session `cleanupBrushSize`
 * (effective-image px) the overlay brushes with.
 */

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";
const COMING = "Coming with the model service";

const BRUSH_MIN = 8;
const BRUSH_MAX = 120;

/** The four cleanup tools. Only Remove object is live at PE9; the rest are
    model-gated (the classical fill is a stand-in, the model swaps in behind the
    SAME erase-op + PreviewApproveBar contract). */
const TOOLS: { id: string; testId: string; label: string; icon: LucideIcon; live: boolean }[] = [
  { id: "remove", testId: "photo-cleanup-tool-remove", label: "Remove object", icon: Eraser, live: true },
  { id: "spot", testId: "photo-cleanup-tool-spot", label: "Spot heal", icon: Bandage, live: false },
  { id: "redeye", testId: "photo-cleanup-tool-redeye", label: "Red-eye", icon: Eye, live: false },
  { id: "background", testId: "photo-cleanup-tool-background", label: "Remove background", icon: Scissors, live: false },
];

export function CleanupPanel() {
  const cleanupBrushSize = usePhotoStore((s) => s.cleanupBrushSize);
  const setCleanupBrushSize = usePhotoStore((s) => s.setCleanupBrushSize);

  return (
    <div data-testid="photo-cleanup-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[15px]">
        {/* TOOL — 2×2 grid; Remove object live + pre-selected, the rest model-gated. */}
        <div>
          <div className={`${WF_H} mb-2`}>Tool</div>
          <div className="grid grid-cols-2 gap-[6px]">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={t.testId}
                  disabled={!t.live}
                  aria-pressed={t.live}
                  title={t.live ? undefined : COMING}
                  className={`flex h-[52px] flex-col items-center justify-center gap-[4px] rounded-[6px] text-[11px] ${
                    t.live
                      ? "cursor-default border-[1.5px] border-brand bg-brand-tint font-semibold text-brand-deep"
                      : "cursor-not-allowed border border-[#dcdcdc] bg-white text-[#999] opacity-70"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.7} className={t.live ? "text-brand" : "text-[#aaa]"} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* BRUSH SIZE — writes the session cleanupBrushSize (effective-image px). */}
        <div>
          <div className="mb-[9px] flex items-baseline justify-between">
            <div className={WF_H}>Brush size</div>
            <span className="text-[11px] text-[#999]">{cleanupBrushSize} px</span>
          </div>
          <input
            type="range"
            data-testid="photo-cleanup-brush-size"
            min={BRUSH_MIN}
            max={BRUSH_MAX}
            step={2}
            value={cleanupBrushSize}
            onChange={(e) => setCleanupBrushSize(Number(e.target.value))}
            aria-label="Brush size"
            className="h-1 w-full cursor-pointer accent-brand"
          />
        </div>

        {/* EXPLAINER — how the loop works (verbatim copy). */}
        <div className="rounded-[8px] border border-[#e6e6e6] bg-[#fafafa] p-[11px]">
          <div className="flex items-start gap-[8px]">
            <div className="mt-[1px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-white shadow-[0_1px_3px_rgba(0,0,0,.10)]">
              <Sparkles size={14} strokeWidth={1.8} className="text-brand" />
            </div>
            <div className="text-[11.5px] leading-relaxed text-[#666]">
              Brush over what you want gone — it&rsquo;s filled from the surroundings. You always see
              a preview before it applies.
            </div>
          </div>
        </div>

        {/* Honest stand-in line (muted). */}
        <div className="text-[10.5px] leading-relaxed text-[#999]">
          Basic cleanup for now — it removes small marks; a smarter fixer is coming.
        </div>

        {/* Model-gated: Fix an AI-generated file (dashed, inert). */}
        <button
          type="button"
          data-testid="photo-cleanup-fix-ai"
          disabled
          title={COMING}
          className="flex cursor-not-allowed flex-col items-start gap-[3px] rounded-[8px] border border-dashed border-[#d3d3d3] bg-white p-[11px] text-left opacity-70"
        >
          <span className="text-[12px] font-semibold text-[#666]">Fix an AI-generated file</span>
          <span className="text-[10.5px] leading-relaxed text-[#999]">
            One click: normalize resolution, format, and color mode.
          </span>
        </button>

        {/* Footer note. */}
        <div className="text-[10.5px] leading-relaxed text-[#999]">
          Heavy work runs on the server — the canvas never freezes.
        </div>
      </div>
    </div>
  );
}
