"use client";

import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/store";
import type { ImportReport } from "@/lib/import/report";
import { collectOversetIds } from "@/lib/import/overset";

/**
 * Import overset check (plan §10.4, part of P4). After a `.pub` import, measure
 * which imported text frames overflow their boxes — Publisher's shrink-to-fit
 * plus our font remapping (§10.5) can render a frame's text taller than the box
 * — and record their ids (setImportOverset) so the report panel lists what the
 * associate must fix.
 *
 * Headless: it renders nothing, it only measures, via its own detached
 * container (overset.ts) so it spans every page — the canvas mounts only the
 * active one, so rendered nodes can't be trusted.
 *
 * Gated on webfonts (§10.5): measuring against fallback metrics gives false
 * verdicts, so it waits on `document.fonts.ready` before measuring, then
 * re-measures whenever `fontsTick` moves — a late class-match font that lands
 * after the first pass can change the verdict. It runs only for a real import
 * (importReport present), and once per report/fonts state: setImportOverset
 * writes a fresh importReport, so the `settled` ref keeps that write from
 * re-entering into a loop.
 */
export function OversetCheck() {
  const importReport = useLayoutStore((s) => s.importReport);
  const fontsTick = useLayoutStore((s) => s.fontsTick);
  const settled = useRef<{ report: ImportReport; tick: number } | null>(null);

  useEffect(() => {
    if (!importReport) return; // pristine document — nothing was imported
    // Skip when we've already settled a verdict for this exact report + fonts
    // state; a fontsTick change is the one signal that SHOULD re-measure.
    const done = settled.current;
    if (done && done.report === importReport && done.tick === fontsTick) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const { doc, setImportOverset } = useLayoutStore.getState();
      setImportOverset(collectOversetIds(doc));
      // Record the report the write just produced, so re-entry from our own
      // write is a no-op while a later fontsTick still re-measures.
      settled.current = {
        report: useLayoutStore.getState().importReport ?? importReport,
        tick: fontsTick,
      };
    };

    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts?.ready) {
      // measure once the faces the shell is loading have settled
      void fonts.ready.then(measure);
    } else {
      // no Font Loading API — measure once without gating rather than hang
      measure();
    }

    return () => {
      cancelled = true;
    };
  }, [importReport, fontsTick]);

  return null;
}
