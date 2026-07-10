import type { Dims } from "./geometry";
import type { FitAnchor, PixelRect } from "@/lib/schema/photo";

/**
 * Fit / Fill / anchor solver (plan §3.2 `fit.ts`, §4 PE5).
 *
 * ── CONTRACT (shared with the future Print Setup / "Resize & imposition · N-up"
 * surface — plan dev #9, §6) ──
 * `solveFit` turns an image + a target ASPECT + a mode + an anchor into the ONE
 * stored-explicit shape the fitToSize op replays from:
 *
 *   • fill → { kind: "crop", rect } — the largest rect of `targetAspect` that
 *            fits INSIDE the image, positioned by `anchor`. The anchor names
 *            which content SURVIVES the crop: "top" keeps the top band, "left"
 *            the left band, "center" the middle. Integers, clamped to the image.
 *
 *   • fit  → { kind: "pad", pad } — symmetric-to-anchor WHITE padding that grows
 *            the canvas to `targetAspect` WITHOUT cropping. Only the SHORT axis
 *            is padded (an image narrower than the target gains width; one
 *            shorter than the target gains height); the anchor distributes that
 *            padding — center splits it evenly, an edge anchor pushes the content
 *            to that edge and puts all the pad on the far side ("top" → all pad
 *            at the bottom). Integers.
 *
 * `targetAspect` is width/height and is used AS-IS: this solver does NOT
 * auto-orient (unlike geometry.aspectRectFor). The CALLER orients — it picks
 * whether a 4×6 target means 1.5 or 1/1.5 for this image and passes that in — so
 * the anchor semantics stay unambiguous. Degenerate cases: an image already at
 * `targetAspect` yields the full-image crop (fill) or zero padding (fit).
 *
 * Pure and isomorphic (no DOM/canvas): the client previews with it and the
 * server folds the stored rect/pad, so both agree by construction.
 */

export type FitMode = "fit" | "fill";

export type FitPad = { l: number; t: number; r: number; b: number };

export type FitSolve =
  | { kind: "crop"; rect: PixelRect }
  | { kind: "pad"; pad: FitPad };

/** −1 = anchored to the min edge (left/top), +1 = the max edge (right/bottom),
    0 = centred. The X and Y projections of the 9-cell anchor grid. */
function anchorX(a: FitAnchor): -1 | 0 | 1 {
  if (a === "top-left" || a === "left" || a === "bottom-left") return -1;
  if (a === "top-right" || a === "right" || a === "bottom-right") return 1;
  return 0; // top · center · bottom
}
function anchorY(a: FitAnchor): -1 | 0 | 1 {
  if (a === "top-left" || a === "top" || a === "top-right") return -1;
  if (a === "bottom-left" || a === "bottom" || a === "bottom-right") return 1;
  return 0; // left · center · right
}

/** Position an object of some size inside `slack` (= container − object) along
    one axis, per an anchor sign: min edge → 0, max edge → all the slack, centre
    → half. Always integer and inside [0, slack]. */
function place(slack: number, sign: -1 | 0 | 1): number {
  const s = Math.max(0, slack);
  if (sign < 0) return 0;
  if (sign > 0) return s;
  return Math.round(s / 2);
}

/** Split `extra` padding into [before, after] per an anchor sign, summing to
    `extra` exactly: content at the min edge → all pad after; at the max edge →
    all pad before; centred → even split (odd remainder goes to `after`). */
function splitPad(extra: number, sign: -1 | 0 | 1): [number, number] {
  const e = Math.max(0, Math.round(extra));
  if (sign < 0) return [0, e];
  if (sign > 0) return [e, 0];
  const before = Math.floor(e / 2);
  return [before, e - before];
}

/** fill: the largest `targetAspect` rect inside the image, anchored. */
function solveFill(image: Dims, targetAspect: number, anchor: FitAnchor): FitSolve {
  const W = image.w;
  const H = image.h;
  if (W <= 0 || H <= 0 || targetAspect <= 0) {
    return { kind: "crop", rect: { x: 0, y: 0, w: Math.max(0, W), h: Math.max(0, H) } };
  }
  // Largest rect of aspect a=w/h fitting inside W×H (no auto-orient — caller
  // orients): width-limited when the image is relatively wider than the target,
  // height-limited otherwise. min() picks the binding axis.
  const rw = Math.min(W, H * targetAspect);
  const rh = rw / targetAspect;
  // Integers that never exceed the image (round can only reach the bound, never
  // pass it, but clamp anyway — the contract promises in-bounds).
  const w = Math.min(W, Math.max(1, Math.round(rw)));
  const h = Math.min(H, Math.max(1, Math.round(rh)));
  const x = place(W - w, anchorX(anchor));
  const y = place(H - h, anchorY(anchor));
  return { kind: "crop", rect: { x, y, w, h } };
}

/** fit: anchored white padding growing the canvas to `targetAspect`. */
function solveFitPad(image: Dims, targetAspect: number, anchor: FitAnchor): FitSolve {
  const W = image.w;
  const H = image.h;
  const zero: FitPad = { l: 0, t: 0, r: 0, b: 0 };
  if (W <= 0 || H <= 0 || targetAspect <= 0) return { kind: "pad", pad: zero };

  const imageAspect = W / H;
  if (imageAspect < targetAspect) {
    // Too narrow for the target → pad WIDTH (the short axis) to W' = H·aspect.
    const targetW = Math.round(H * targetAspect);
    const extra = Math.max(0, targetW - W);
    const [l, r] = splitPad(extra, anchorX(anchor));
    return { kind: "pad", pad: { l, t: 0, r, b: 0 } };
  }
  if (imageAspect > targetAspect) {
    // Too wide for the target → pad HEIGHT (the short axis) to H' = W/aspect.
    const targetH = Math.round(W / targetAspect);
    const extra = Math.max(0, targetH - H);
    const [t, b] = splitPad(extra, anchorY(anchor));
    return { kind: "pad", pad: { l: 0, t, r: 0, b } };
  }
  // Already at the target aspect → nothing to pad.
  return { kind: "pad", pad: zero };
}

/**
 * Solve a Fit/Fill placement (see the module CONTRACT). fill returns an anchored
 * crop `rect`; fit returns anchored per-edge `pad`. Both are integer and the
 * crop never overhangs the image.
 */
export function solveFit(
  image: Dims,
  targetAspect: number,
  mode: FitMode,
  anchor: FitAnchor,
): FitSolve {
  return mode === "fill"
    ? solveFill(image, targetAspect, anchor)
    : solveFitPad(image, targetAspect, anchor);
}

// Re-exported so callers can type against the fitToSize op fields without also
// importing the schema module.
export type { FitAnchor };
