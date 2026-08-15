import { useEffect, useState } from "react";

/**
 * Rolling frames-per-second readout for the §6.2 spike-gate probe. Counts
 * rAF callbacks per second — a coarse instrument; the formal gate is judged
 * on the store hardware profile, not here.
 */
export function useFps(enabled: boolean): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFps(null);
      return;
    }
    let frames = 0;
    let windowStart = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      frames++;
      if (now - windowStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [enabled]);

  return fps;
}
