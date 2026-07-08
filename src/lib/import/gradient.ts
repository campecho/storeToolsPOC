import type { PropMap, PropValue } from "./trace-parser";
import { toMultiplier, toNumber } from "./trace-parser";

/**
 * Gradient → flat-color flattening (the mapper's "nearest flat color").
 *
 * libmspub emits a gradient's colors as stop vectors on the setStyle props —
 * `svg:linearGradient: ((svg:offset: 0%, svg:stop-color: #3b618e, …), …)` —
 * NOT as `draw:fill-color` (ground-truthed against pub2raw 0.1.4 on the
 * New_Rack_Card corpus file, whose full-page background is such a gradient).
 * The editor has no gradient fill, so the shape keeps ONE color: the
 * area-weighted average of the stops (trapezoid rule over the offset span),
 * which for the ubiquitous two-stop case is the midpoint mix. The mapper
 * still reports the degradation; this just makes its note true.
 */

type Rgb = [number, number, number];

function parseHex(v: PropValue | undefined): Rgb | null {
  if (typeof v !== "string") return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(v.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** svg:offset prints as a percent ("100.0000%"); tolerate a unitless 0–1 fraction. */
function stopOffset(v: PropValue | undefined): number | undefined {
  const n = toMultiplier(v) ?? toNumber(v);
  if (n === undefined) return undefined;
  return Math.min(1, Math.max(0, n));
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Area-weighted average of sorted stops — trapezoid rule over the offset span. */
function averageStops(stops: { off: number; rgb: Rgb }[]): Rgb {
  const span = stops[stops.length - 1].off - stops[0].off;
  if (span <= 0) {
    // all stops at one offset — plain mean
    const sum = stops.reduce<Rgb>((acc, s) => [acc[0] + s.rgb[0], acc[1] + s.rgb[1], acc[2] + s.rgb[2]], [0, 0, 0]);
    return [sum[0] / stops.length, sum[1] / stops.length, sum[2] / stops.length];
  }
  const acc: Rgb = [0, 0, 0];
  for (let i = 1; i < stops.length; i++) {
    const w = (stops[i].off - stops[i - 1].off) / span;
    const m = mix(stops[i - 1].rgb, stops[i].rgb, 0.5);
    acc[0] += m[0] * w;
    acc[1] += m[1] * w;
    acc[2] += m[2] * w;
  }
  return acc;
}

const STOP_VECTOR_KEYS = ["svg:linearGradient", "svg:radialGradient", "librevenge:gradient"];

/**
 * The flat color a non-solid fill degrades to, from the setStyle props:
 * gradient stop vectors first, then librevenge's draw:start-color /
 * draw:end-color pair. Null when the props carry no usable color — the
 * mapper's note then says "dropped", not "flattened".
 */
export function flattenFillColor(props: PropMap): string | null {
  for (const key of STOP_VECTOR_KEYS) {
    const v = props[key];
    if (!Array.isArray(v)) continue;
    const stops = v
      .map((g) => ({ off: stopOffset(g["svg:offset"]), rgb: parseHex(g["svg:stop-color"]) }))
      .filter((s): s is { off: number | undefined; rgb: Rgb } => s.rgb !== null)
      .map((s, i, all) => ({ ...s, off: s.off ?? (all.length > 1 ? i / (all.length - 1) : 0) }))
      .sort((a, b) => a.off - b.off);
    if (stops.length) return toHex(averageStops(stops));
  }
  const start = parseHex(props["draw:start-color"]);
  const end = parseHex(props["draw:end-color"]);
  if (start && end) return toHex(mix(start, end, 0.5));
  const one = start ?? end;
  return one ? toHex(one) : null;
}
