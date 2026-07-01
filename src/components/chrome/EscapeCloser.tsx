"use client";

import { useEffect } from "react";
import { useFeedbackStore } from "@/store";

/**
 * Escape closes the topmost open overlay — the keyboard counterpart of the
 * backdrop click, in z-order: celebrate > report modal > drawer > dropdown.
 * (The coachmark is a tooltip, not a modal — its X handles dismissal.)
 */
export function EscapeCloser() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useFeedbackStore.getState();
      if (s.celebrateOpen) s.closeCelebrate();
      else if (s.reportOpen) s.closeReport();
      else if (s.detailId != null) s.closeDetail();
      else if (s.notifOpen) s.closeNotif();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
