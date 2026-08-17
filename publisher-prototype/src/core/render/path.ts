import type { PathSeg } from "../model";

/**
 * Path-shape geometry — portable, framework-free. Schema path segments are
 * normalized 0–1 within the object's frame box (so move/resize tooling works
 * on x/y/w/h unchanged); rendering denormalizes them into canonical inches
 * and emits an absolute-form SVG path string (M/L/C/Z — the schema's whole
 * vocabulary) both Konva Path `data` and SVG `d` accept.
 */

export type PathFrameBox = { x: number; y: number; w: number; h: number };

/** Trim float noise without losing sub-thousandth-inch precision. */
function fmt(v: number): string {
  return String(Number(v.toFixed(4)));
}

export function pathToSvg(segs: readonly PathSeg[], box: PathFrameBox): string {
  const px = (nx: number) => box.x + nx * box.w;
  const py = (ny: number) => box.y + ny * box.h;
  return segs
    .map((seg) => {
      switch (seg.c) {
        case "M":
        case "L":
          return `${seg.c} ${fmt(px(seg.x))} ${fmt(py(seg.y))}`;
        case "C":
          return `C ${fmt(px(seg.x1))} ${fmt(py(seg.y1))} ${fmt(px(seg.x2))} ${fmt(py(seg.y2))} ${fmt(px(seg.x))} ${fmt(py(seg.y))}`;
        case "Z":
          return "Z";
      }
    })
    .join(" ");
}
