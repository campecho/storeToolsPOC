"use client";

import { useEffect, useMemo, useState } from "react";
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from "lucide-react";
import type { PixelRect } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { aspectRectFor, effectiveDims, straightenLabel } from "@/lib/photo/geometry";
import { CROP_PRESETS, cropLabel } from "@/lib/photo/sizes";

/**
 * Crop & straighten panel (wire Section B, ~lines 222–266). Mounts in the
 * ContextPanel body while the crop tool is active.
 *
 * The panel owns a session `cropDraft` on the store ({ rect, ratioId, shape });
 * the canvas overlay agent renders and drags the same draft. On mount the draft
 * is initialised to the full effective image / "free" / "rect" if none exists —
 * the store clears it on tool exit / undo / redo / setCursor, so re-entering the
 * tool re-initialises it here.
 *
 * STRAIGHTEN is a delta-entry control, NOT a value bound to the recipe: it lives
 * at 0, previews live while dragging, and on release commits ONE straighten op
 * (coalesced — a trailing straighten is replaced, not stacked) then resets to 0.
 * The committed angle lives in the recipe (visible in the history dock); the
 * slider is only an entry surface.
 */

type CropShape = "rect" | "rounded" | "circle";

/** One-decimal readout with a real minus (U+2212), mirroring straightenLabel's
    number format ("0.0°", "−1.2°"). */
function formatDegrees(deg: number): string {
  return `${deg.toFixed(1).replace("-", "−")}°`;
}

/** True when a draft rect covers the whole effective image (no crop pending). */
function isFullRect(rect: PixelRect, eff: { w: number; h: number }): boolean {
  const eps = 0.5;
  return (
    Math.abs(rect.x) < eps &&
    Math.abs(rect.y) < eps &&
    Math.abs(rect.w - eff.w) < eps &&
    Math.abs(rect.h - eff.h) < eps
  );
}

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";

export function CropPanel() {
  const doc = usePhotoStore((s) => s.doc);
  const cropDraft = usePhotoStore((s) => s.cropDraft);
  const setCropDraft = usePhotoStore((s) => s.setCropDraft);
  const setPreviewOp = usePhotoStore((s) => s.setPreviewOp);
  const pushOp = usePhotoStore((s) => s.pushOp);

  // Local straighten entry value (delta control) — resets to 0 after each commit
  // and on remount (re-entering the tool starts fresh).
  const [straighten, setStraighten] = useState(0);

  // Effective image = the master with the applied recipe (ops[0..cursor)) — the
  // coordinate space the crop draft lives in.
  const effImage = useMemo(() => {
    if (!doc) return { w: 0, h: 0 };
    return effectiveDims(
      { w: doc.source.width, h: doc.source.height },
      doc.recipe.slice(0, doc.cursor),
    );
  }, [doc]);

  // Initialise the draft to the full effective image on mount if the store has
  // none. Idempotent (StrictMode double-invoke sees the draft already set).
  useEffect(() => {
    const s = usePhotoStore.getState();
    if (!s.doc || s.cropDraft) return;
    const eff = effectiveDims(
      { w: s.doc.source.width, h: s.doc.source.height },
      s.doc.recipe.slice(0, s.doc.cursor),
    );
    s.setCropDraft({ rect: aspectRectFor(eff, null), ratioId: "free", shape: "rect" });
  }, []);

  if (!doc) return null;

  const activeShape: CropShape = cropDraft?.shape ?? "rect";
  const activeRatioId = cropDraft?.ratioId ?? "free";
  const activePreset = CROP_PRESETS.find((p) => p.id === activeRatioId);

  /** Reset the draft to the current full effective image (reads fresh store
      state so it is correct after a just-pushed geometry op). */
  function reinitDraftToFull() {
    const s = usePhotoStore.getState();
    if (!s.doc) return;
    const eff = effectiveDims(
      { w: s.doc.source.width, h: s.doc.source.height },
      s.doc.recipe.slice(0, s.doc.cursor),
    );
    s.setCropDraft({ rect: aspectRectFor(eff, null), ratioId: "free", shape: "rect" });
  }

  function onAspect(preset: (typeof CROP_PRESETS)[number]) {
    let ratio: number | null;
    if (preset.id === "free") ratio = null;
    else if (preset.id === "original") ratio = effImage.h === 0 ? null : effImage.w / effImage.h;
    else ratio = preset.ratio;
    setCropDraft({
      rect: aspectRectFor(effImage, ratio),
      ratioId: preset.id,
      // Keep the current shape (Circle is only forced from the Shape segment).
      shape: activeShape,
    });
  }

  function onShape(shape: CropShape) {
    if (shape === "circle") {
      // Circle forces a 1:1 draft in the same update.
      setCropDraft({ rect: aspectRectFor(effImage, 1), ratioId: "1-1", shape: "circle" });
      return;
    }
    // Rectangle / Rounded keep the current rect + ratio.
    setCropDraft({
      rect: cropDraft?.rect ?? aspectRectFor(effImage, null),
      ratioId: activeRatioId,
      shape,
    });
  }

  function onStraightenChange(v: number) {
    setStraighten(v);
    setPreviewOp({ op: "straighten", degrees: v, label: straightenLabel(v) });
  }

  function commitStraighten() {
    // A release at 0 (a click without a drag, or a drag back to centre) is not a
    // real edit — just clear the preview.
    if (straighten === 0) {
      setPreviewOp(null);
      return;
    }
    pushOp({ op: "straighten", degrees: straighten, label: straightenLabel(straighten) }, { coalesce: true });
    setPreviewOp(null);
    setStraighten(0);
  }

  function onRotate(dir: -1 | 1) {
    pushOp({
      op: "rotate",
      quarterTurns: dir,
      label: dir === -1 ? "Rotate 90° left" : "Rotate 90° right",
    });
    // Geometry changed under the draft — restart it against the new dimensions.
    reinitDraftToFull();
  }

  function onFlip(axis: "horizontal" | "vertical") {
    pushOp({
      op: "flip",
      axis,
      label: axis === "horizontal" ? "Flip horizontal" : "Flip vertical",
    });
    reinitDraftToFull();
  }

  function onApply() {
    if (!cropDraft) return;
    pushOp({
      op: "crop",
      rect: cropDraft.rect,
      ratio: activePreset && activePreset.kind !== "free" ? activePreset.label : null,
      shape: cropDraft.shape,
      label: activePreset ? cropLabel(activePreset) : "Crop",
    });
    // The crop is in the recipe now; start a fresh draft on the cropped image.
    reinitDraftToFull();
  }

  const applyDisabled =
    !cropDraft || (isFullRect(cropDraft.rect, effImage) && cropDraft.shape === "rect");

  return (
    <div data-testid="photo-crop-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[15px]">
        {/* ASPECT */}
        <div>
          <div className={`${WF_H} mb-2`}>Aspect</div>
          <div className="grid grid-cols-2 gap-[6px]">
            {CROP_PRESETS.map((preset) => {
              const active = activeRatioId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`crop-aspect-${preset.id}`}
                  aria-pressed={active}
                  onClick={() => onAspect(preset)}
                  className={`flex h-7 cursor-pointer items-center justify-center rounded-[5px] text-[11.5px] ${
                    active
                      ? "border-[1.5px] border-brand bg-brand-tint font-semibold text-brand-deep"
                      : "border border-[#dcdcdc] bg-white text-[#555] hover:border-[#c8c8c8]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {/* Catalog picker — inert (deviation #5). */}
          <button
            type="button"
            data-testid="crop-catalog"
            disabled
            title="Catalog sizes arrive with the spec-sync slice"
            className="mt-[6px] flex h-7 w-full cursor-not-allowed items-center justify-between rounded-[5px] border border-[#dcdcdc] bg-white px-[9px] text-[11.5px] text-[#999] opacity-70"
          >
            Product size from catalog…
            <span className="text-[#b0b0b0]">▾</span>
          </button>
        </div>

        {/* SHAPE */}
        <div>
          <div className={`${WF_H} mb-2`}>Shape</div>
          <div className="flex rounded-[6px] bg-[#ececec] p-[2px] text-[11px]">
            {(
              [
                ["rect", "Rectangle"],
                ["rounded", "Rounded"],
                ["circle", "Circle"],
              ] as const
            ).map(([shape, label]) => {
              const active = activeShape === shape;
              return (
                <button
                  key={shape}
                  type="button"
                  data-testid={`crop-shape-${shape}`}
                  aria-pressed={active}
                  onClick={() => onShape(shape)}
                  className={`flex-1 cursor-pointer rounded-[5px] py-1 text-center ${
                    active
                      ? "bg-white text-[#333] shadow-[0_1px_2px_rgba(0,0,0,.12)]"
                      : "text-[#777] hover:text-[#555]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* STRAIGHTEN */}
        <div>
          <div className="mb-[9px] flex items-baseline justify-between">
            <div className={WF_H}>Straighten</div>
            <span className="text-[11px] text-[#999]">{formatDegrees(straighten)}</span>
          </div>
          <div className="flex items-center gap-[9px]">
            <input
              type="range"
              data-testid="crop-straighten-slider"
              min={-15}
              max={15}
              step={0.1}
              value={straighten}
              onChange={(e) => onStraightenChange(parseFloat(e.target.value))}
              onPointerUp={commitStraighten}
              onKeyUp={commitStraighten}
              aria-label="Straighten"
              className="h-1 flex-1 cursor-pointer accent-brand"
            />
            <button
              type="button"
              data-testid="crop-straighten-auto"
              disabled
              title="Auto-straighten lands with a later tranche"
              className="flex h-[26px] cursor-not-allowed items-center rounded-[5px] border border-[#dcdcdc] bg-white px-[10px] text-[11px] text-[#999] opacity-70"
            >
              Auto
            </button>
          </div>
        </div>

        {/* ROTATE & FLIP */}
        <div>
          <div className={`${WF_H} mb-2`}>Rotate &amp; flip</div>
          <div className="flex gap-[5px]">
            <RotateFlipButton
              testId="crop-rotate-left"
              label="Rotate 90° left"
              onClick={() => onRotate(-1)}
              icon={<RotateCcw size={14} strokeWidth={1.7} className="text-[#666]" />}
            />
            <RotateFlipButton
              testId="crop-rotate-right"
              label="Rotate 90° right"
              onClick={() => onRotate(1)}
              icon={<RotateCw size={14} strokeWidth={1.7} className="text-[#666]" />}
            />
            <RotateFlipButton
              testId="crop-flip-h"
              label="Flip horizontal"
              onClick={() => onFlip("horizontal")}
              icon={<FlipHorizontal size={14} strokeWidth={1.6} className="text-[#666]" />}
            />
            <RotateFlipButton
              testId="crop-flip-v"
              label="Flip vertical"
              onClick={() => onFlip("vertical")}
              icon={<FlipVertical size={14} strokeWidth={1.6} className="text-[#666]" />}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-[2px] flex gap-2">
          <button
            type="button"
            data-testid="crop-apply"
            onClick={onApply}
            disabled={applyDisabled}
            className={`flex h-8 flex-[1.4] items-center justify-center rounded-[6px] text-[12.5px] font-medium ${
              applyDisabled
                ? "cursor-not-allowed bg-[#e6b3b3] text-white opacity-60"
                : "cursor-pointer bg-brand text-white hover:bg-brand-press"
            }`}
          >
            Apply crop
          </button>
          <button
            type="button"
            data-testid="crop-reset"
            onClick={reinitDraftToFull}
            className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-[6px] border border-[#cfcfcf] bg-white text-[12px] text-[#555] hover:bg-[#f4f4f4]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function RotateFlipButton({
  testId,
  label,
  onClick,
  icon,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-[30px] flex-1 cursor-pointer items-center justify-center rounded-[5px] border border-[#dcdcdc] bg-white hover:bg-[#f4f4f4]"
    >
      {icon}
    </button>
  );
}
