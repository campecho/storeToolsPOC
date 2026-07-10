"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import type { AdjustParam } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { adjustLabel, collectAdjustState } from "@/lib/photo/adjust-math";
import { useAutoEnhance } from "../useAutoEnhance";

/**
 * Adjust panel (wire Section B "Adjust", ~lines 270–294). Mounts in the
 * ContextPanel body while the Adjust tool is active.
 *
 * Auto-enhance primary (red-tinted, wired live via useAutoEnhance) leads;
 * **Light** group — Brightness / Contrast / Exposure / Highlights / Shadows;
 * **Color** group — Saturation / **Warmth** (schema param `temperature`, display
 * label "Warmth"); a collapsed **More · levels, curves, sharpen, noise** row with
 * a `PRO` badge, rendered collapsed-INERT exactly as drawn (deviation #2).
 *
 * SLIDER SEMANTICS (binding, plan §3.4): adjust ops are ABSOLUTE SETPOINTS. Each
 * slider's value is BOUND to the current state — value[param] =
 * collectAdjustState(applied slice)[param] — so a slider sits at wherever the
 * recipe left that parameter (auto-enhance's chosen values, a prior manual set).
 * This is the DELIBERATE OPPOSITE of CropPanel's Straighten slider, which is a
 * delta-entry control that lives at 0 and resets after each commit. Here dragging
 * previews live via setPreviewOp and release commits ONE coalesced op that
 * REPLACES the trailing same-param adjust op (never stacks a drag).
 */

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";

const LIGHT: { param: AdjustParam; label: string }[] = [
  { param: "brightness", label: "Brightness" },
  { param: "contrast", label: "Contrast" },
  { param: "exposure", label: "Exposure" },
  { param: "highlights", label: "Highlights" },
  { param: "shadows", label: "Shadows" },
];

const COLOR: { param: AdjustParam; label: string }[] = [
  { param: "saturation", label: "Saturation" },
  // Schema param is `temperature`; the wire's display label is "Warmth".
  { param: "temperature", label: "Warmth" },
];

/** Signed readout with a real minus (U+2212): "+12", "0", "−20". */
function formatSigned(v: number): string {
  const n = Math.round(v);
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function AdjustPanel() {
  const doc = usePhotoStore((s) => s.doc);
  const autoEnhance = useAutoEnhance();

  // The bound setpoints: the applied slice folded to one absolute AdjustState
  // (last-wins; autoEnhance is the base). Recomputed only when the document
  // (recipe/cursor) moves — a live drag is local to the row, below.
  const state = useMemo(
    () => (doc ? collectAdjustState(doc.recipe.slice(0, doc.cursor)) : null),
    [doc],
  );

  if (!doc || !state) return null;

  return (
    <div data-testid="photo-adjust-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[14px]">
        {/* AUTO-ENHANCE — primary, red-tinted; live via the shared hook. */}
        <div>
          <button
            type="button"
            data-testid="adjust-auto-enhance"
            onClick={autoEnhance.run}
            disabled={autoEnhance.busy}
            title="One click — histogram stretch + white balance. Always undoable."
            className={`flex h-[34px] w-full items-center justify-center gap-[7px] rounded-[6px] border-[1.5px] border-brand bg-brand-tint text-[12.5px] font-semibold text-brand-deep ${
              autoEnhance.busy ? "cursor-wait opacity-80" : "cursor-pointer hover:bg-[#f7dede]"
            }`}
          >
            {autoEnhance.busy ? (
              <>
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                Enhancing…
              </>
            ) : autoEnhance.balanced ? (
              <>
                <Check size={14} strokeWidth={2.2} />
                Already looks balanced
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={1.6} />
                Auto-enhance
              </>
            )}
          </button>
          <div className="mt-[5px] text-[10.5px] text-[#999]">One click — always undoable.</div>
        </div>

        {/* LIGHT */}
        <div>
          <div className={`${WF_H} mb-[10px]`}>Light</div>
          <div className="flex flex-col gap-[11px]">
            {LIGHT.map((row) => (
              <AdjustSlider key={row.param} param={row.param} label={row.label} value={state[row.param]} />
            ))}
          </div>
        </div>

        {/* COLOR */}
        <div>
          <div className={`${WF_H} mb-[10px]`}>Color</div>
          <div className="flex flex-col gap-[11px]">
            {COLOR.map((row) => (
              <AdjustSlider key={row.param} param={row.param} label={row.label} value={state[row.param]} />
            ))}
          </div>
        </div>

        {/* MORE — collapsed, inert (deviation #2). Pro controls were never
            wireframed beyond the Section-E miniature, so the row keeps the
            ceiling visible without pretending to work. */}
        <button
          type="button"
          data-testid="adjust-more-pro"
          disabled
          title="Pro controls return with a future wireframe pass"
          className="flex h-[30px] cursor-not-allowed items-center justify-between rounded-[5px] border border-[#dcdcdc] bg-white px-[9px] text-[11px] text-[#666] opacity-90"
        >
          <span>More · levels, curves, sharpen, noise</span>
          <span className="flex items-center gap-[6px]">
            <span className="rounded-[3px] border border-[#ddd] px-[4px] py-[1px] text-[9px] font-bold text-[#999]">
              PRO
            </span>
            <span className="text-[#b0b0b0]">▾</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * One bound adjust slider. `value` is the committed setpoint; `dragVal` overlays
 * it live while the pointer/keys are down. On release commit ONE coalesced op
 * (skipped if the value never actually moved). Double-clicking the LABEL resets
 * that one parameter to 0 (also coalesced) — a small, discoverable affordance.
 */
function AdjustSlider({
  param,
  label,
  value,
}: {
  param: AdjustParam;
  label: string;
  value: number;
}) {
  const setPreviewOp = usePhotoStore((s) => s.setPreviewOp);
  const pushOp = usePhotoStore((s) => s.pushOp);
  const [dragVal, setDragVal] = useState<number | null>(null);

  const shown = dragVal ?? value;

  const onChange = (v: number) => {
    setDragVal(v);
    setPreviewOp({ op: "adjust", param, value: v, label: adjustLabel(param, v) });
  };

  const commit = () => {
    if (dragVal === null) return;
    const v = dragVal;
    setDragVal(null);
    setPreviewOp(null);
    // A drag that ended back at the committed value is not a real edit.
    if (v !== value) {
      pushOp({ op: "adjust", param, value: v, label: adjustLabel(param, v) }, { coalesce: true });
    }
  };

  const reset = () => {
    setDragVal(null);
    setPreviewOp(null);
    if (value !== 0) {
      pushOp({ op: "adjust", param, value: 0, label: adjustLabel(param, 0) }, { coalesce: true });
    }
  };

  return (
    <div>
      <div className="mb-[5px] flex items-center justify-between text-[11px] text-[#666]">
        <span
          onDoubleClick={reset}
          title="Double-click to reset to 0"
          className="cursor-pointer select-none"
        >
          {label}
        </span>
        <span className="text-[#999]">{formatSigned(shown)}</span>
      </div>
      <input
        type="range"
        data-testid={`adjust-${param}`}
        min={-100}
        max={100}
        step={1}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        aria-label={label}
        className="h-1 w-full cursor-pointer accent-brand"
      />
    </div>
  );
}
