"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAssetUrl } from "@/lib/assets/blob-store";
import { useAssetUrl } from "@/lib/assets/use-asset-url";
import { computeAutoEnhance } from "@/lib/photo/adjust-math";
import { usePhotoStore } from "@/lib/store/photo-store";

/**
 * Shared auto-enhance hook (PE4) — the single implementation behind BOTH the
 * Adjust panel's primary button and the ActionBar's Auto-enhance button.
 *
 * What it does on `run()`:
 *   1. loads the RAW PROXY bitmap (doc.source.proxyAssetId → object URL → blob →
 *      createImageBitmap → offscreen getImageData). The raw proxy — NOT the
 *      adjusted composition — because auto-enhance analyses the untouched
 *      histogram to decide its correction.
 *   2. runs `computeAutoEnhance` (the sibling math module: histogram stretch +
 *      gray-world white balance), which returns the explicit adjust setpoints it
 *      chose.
 *   3. if the result is non-empty, pushes ONE `autoEnhance` op with
 *      { coalesce: true } — so repeated clicks REPLACE the trailing auto-enhance
 *      rather than stacking a second one (the coalesce rule, store §3.4). A
 *      trailing manual `adjust` op is a different tag, so it is never clobbered.
 *   4. if the result is EMPTY (the image already looks good) it pushes NOTHING —
 *      an identity op would be a dishonest history step — and instead flips a
 *      transient `balanced` flag the button uses to swap its label to
 *      "Already looks balanced" for ~1.5s.
 *
 * State is per-hook-instance: each button gets its own `busy`/`balanced` (the two
 * buttons never render at once in a way that needs to agree — the panel button
 * only exists at Standard with the Adjust tool open). The op push is coalesced,
 * so even two concurrent computes can only ever collapse to one history step.
 * `busy` is a re-entrancy guard (held in a ref so a stale callback can't double-run).
 */

const BALANCED_MS = 1500;

async function proxyImageData(url: string): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
} | null> {
  const res = await fetch(url);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { data: img.data, width: img.width, height: img.height };
  } finally {
    bmp.close?.();
  }
}

export function useAutoEnhance(): {
  run: () => void;
  busy: boolean;
  balanced: boolean;
  disabled: boolean;
} {
  const doc = usePhotoStore((s) => s.doc);
  const pushOp = usePhotoStore((s) => s.pushOp);
  // Reactively resolved for the common case; run() falls back to getAssetUrl so a
  // click that races the first resolve still works.
  const proxyUrl = useAssetUrl(doc?.source.proxyAssetId);

  const [busy, setBusy] = useState(false);
  const [balanced, setBalanced] = useState(false);
  const busyRef = useRef(false);
  const balancedTimer = useRef<number | null>(null);

  const run = useCallback(() => {
    const current = usePhotoStore.getState().doc;
    if (!current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setBalanced(false);
    if (balancedTimer.current != null) {
      clearTimeout(balancedTimer.current);
      balancedTimer.current = null;
    }
    void (async () => {
      try {
        const url = proxyUrl ?? (await getAssetUrl(current.source.proxyAssetId));
        if (!url) return;
        const px = await proxyImageData(url);
        if (!px) return;
        const params = computeAutoEnhance(px.data, px.width, px.height);
        // Empty result → already balanced: push nothing, show the transient state.
        if (!params || Object.keys(params).length === 0) {
          setBalanced(true);
          balancedTimer.current = window.setTimeout(() => {
            setBalanced(false);
            balancedTimer.current = null;
          }, BALANCED_MS);
          return;
        }
        pushOp({ op: "autoEnhance", params, label: "Auto-enhance" }, { coalesce: true });
      } catch (err) {
        console.warn("[photo] auto-enhance failed", err);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
  }, [proxyUrl, pushOp]);

  // StrictMode-safe: clear the pending balanced-reset timer on unmount.
  useEffect(
    () => () => {
      if (balancedTimer.current != null) clearTimeout(balancedTimer.current);
    },
    [],
  );

  return { run, busy, balanced, disabled: !doc };
}
