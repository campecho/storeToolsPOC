"use client";

import { useEffect } from "react";
import { useLayoutStore } from "@/store";
import { collectOversetIds } from "@/lib/import/overset";
import { runPreflight } from "@/lib/layout/preflight";

/**
 * Live preflight (redesign plan Phase 6). Headless: on every document change
 * (debounced — checks run after a pause, not per keystroke) it runs the pure
 * rule engine plus the DOM-measured text-overflow check and publishes the
 * result to the store, where the inspector badge, the Preflight tab, and the
 * canvas pins read it. Re-measures when webfonts settle (`fontsTick`), same
 * as OversetCheck — fallback metrics give false overflow verdicts.
 */
const DEBOUNCE_MS = 500;

export function PreflightCheck() {
  const doc = useLayoutStore((s) => s.doc);
  const fontsTick = useLayoutStore((s) => s.fontsTick);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const run = () => {
        if (cancelled) return;
        const current = useLayoutStore.getState().doc;
        const issues = runPreflight(current, { oversetIds: collectOversetIds(current) });
        useLayoutStore.getState().setPreflightIssues(issues);
      };
      const fonts = typeof document !== "undefined" ? document.fonts : undefined;
      if (fonts?.ready) void fonts.ready.then(run);
      else run();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, fontsTick]);

  return null;
}
