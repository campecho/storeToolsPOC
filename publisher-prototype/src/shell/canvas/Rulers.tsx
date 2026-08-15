import { rulerTicks } from "../../core/geometry/rulers";

/**
 * DOM rulers (PLAN.md §6.2): cheap, zoom/pan-aware off the shared viewport
 * state. The tick math is core; this renders it.
 */

const TICK_HEIGHT: Record<"major" | "mid" | "minor", number> = {
  major: 14,
  mid: 9,
  minor: 5,
};

export function HorizontalRuler({
  originPx,
  lengthPx,
  zoom,
}: {
  originPx: number;
  lengthPx: number;
  zoom: number;
}) {
  return (
    <div className="ruler ruler-h" aria-hidden="true">
      {rulerTicks(originPx, lengthPx, zoom).map((t) => (
        <span
          key={t.px}
          className={`tick tick-${t.level}`}
          style={{ left: t.px, height: TICK_HEIGHT[t.level] }}
        >
          {t.label !== undefined && <span className="tick-label">{t.label}</span>}
        </span>
      ))}
    </div>
  );
}

export function VerticalRuler({
  originPx,
  lengthPx,
  zoom,
}: {
  originPx: number;
  lengthPx: number;
  zoom: number;
}) {
  return (
    <div className="ruler ruler-v" aria-hidden="true">
      {rulerTicks(originPx, lengthPx, zoom).map((t) => (
        <span
          key={t.px}
          className={`tick tick-${t.level}`}
          style={{ top: t.px, width: TICK_HEIGHT[t.level] }}
        >
          {t.label !== undefined && <span className="tick-label">{t.label}</span>}
        </span>
      ))}
    </div>
  );
}
