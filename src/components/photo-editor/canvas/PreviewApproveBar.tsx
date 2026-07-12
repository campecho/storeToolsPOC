"use client";

import type { PhotoOp } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";

/**
 * Preview / Apply bar (wire Section B, PE9 — the suggest-never-auto-apply loop).
 * Mounts bottom-center of the canvas column (the HistoryDock anchor pattern) while
 * a `pendingPreview` op exists. GENERIC by design: it derives its label and commits
 * whatever op the store holds, so every future model op (spot heal, background
 * removal, …) reuses this same bar with no change (the plan's stated intent).
 *
 * Apply → `pushOp(pendingPreview)`: the approved op enters the recipe as ONE history
 * step (its canonical label rides the op, e.g. "Remove object") and pushOp clears
 * the pending state via CLEAR_DRAFT. Discard → `setPendingPreview(null)`: the recipe
 * and cursor are untouched. Neither revokes the mask/patch blobs server-side (blob
 * orphans are the documented STUBS gap).
 */

/** The human noun for the pending op, derived from its kind so the bar stays
    generic across model ops. */
function previewNoun(op: PhotoOp): string {
  switch (op.op) {
    case "erase":
      return "object removed";
    default:
      return "edit ready";
  }
}

export function PreviewApproveBar() {
  const pendingPreview = usePhotoStore((s) => s.pendingPreview);
  const pushOp = usePhotoStore((s) => s.pushOp);
  const setPendingPreview = usePhotoStore((s) => s.setPendingPreview);

  if (!pendingPreview) return null;

  return (
    <div
      data-testid="photo-preview-bar"
      className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#e6e6e6] bg-white py-[7px] pl-[15px] pr-[7px] shadow-[0_3px_16px_rgba(0,0,0,.22)]"
    >
      <span className="text-[12px] font-medium text-[#555]">
        Preview · {previewNoun(pendingPreview)}
      </span>
      <div className="flex items-center gap-[6px]">
        <button
          type="button"
          data-testid="photo-preview-apply"
          onClick={() => pushOp(pendingPreview)}
          className="flex h-[28px] cursor-pointer items-center rounded-full bg-brand px-[15px] text-[12px] font-semibold text-white hover:bg-brand-press"
        >
          Apply
        </button>
        <button
          type="button"
          data-testid="photo-preview-discard"
          onClick={() => setPendingPreview(null)}
          className="flex h-[28px] cursor-pointer items-center rounded-full border border-[#d0d0d0] bg-white px-[15px] text-[12px] font-medium text-[#555] hover:bg-[#f4f4f4]"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
