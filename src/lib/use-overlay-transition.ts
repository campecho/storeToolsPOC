import { useEffect, useState } from "react";

export type OverlayPhase = "closed" | "open" | "closing";

/**
 * Keeps an overlay mounted long enough to play its exit animation. While
 * `closing`, render with the exit animation classes (and pointer-events-none);
 * once `closed`, return null. `unmountAfterMs` should slightly exceed the
 * longest exit animation.
 */
export function useOverlayTransition(open: boolean, unmountAfterMs = 200): OverlayPhase {
  const [phase, setPhase] = useState<OverlayPhase>(open ? "open" : "closed");

  useEffect(() => {
    if (open) setPhase("open");
    else setPhase((p) => (p === "open" ? "closing" : p));
  }, [open]);

  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => setPhase("closed"), unmountAfterMs);
    return () => clearTimeout(t);
  }, [phase, unmountAfterMs]);

  return phase;
}
