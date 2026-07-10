import type { PhotoOp, PixelRect } from "@/lib/schema/photo";

/**
 * Photo-editor geometry (plan §3.2 `geometry.ts`, §4 PE2/PE5, §5): crop / rotate
 * / flip / straighten dimension folding, effective-DPI math with the wires'
 * green/amber/red thresholds, and the crop-overlay drag math. Pure and
 * isomorphic — no DOM, no canvas — so it is unit-testable away from the surface
 * and reusable by the server render host (PE3) and the future layout Picture
 * inspector (§6 F1). Style follows `src/lib/layout/geometry.ts`.
 *
 * ── BINDING OP SEMANTICS (server replay in PE3 depends on this contract) ──
 * Every geometry op applies to the CURRENT EFFECTIVE image — the result of all
 * prior applied ops — with coordinates in effective-master pixels at that
 * moment (not source pixels). Folding a recipe:
 *
 *   • crop {rect}       → effective dims become rect.w × rect.h.
 *   • rotate {quarterTurns}  positive = clockwise (±1, 2). An ODD number of
 *                         quarter turns swaps w↔h; an even number leaves them.
 *   • flip {axis}       → dims UNCHANGED (mirror only).
 *   • straighten {deg}  → COVER model: the image rotates by `deg` and scales up
 *                         by the minimal factor that keeps the original frame
 *                         fully covered (`straightenScale`), so the effective
 *                         dims are UNCHANGED — straighten is a QUALITY cost, not
 *                         a SIZE cost. (The upscale is what fills the corners the
 *                         rotation would otherwise expose.)
 *
 * The three print-geometry ops (PE5) also change the effective raster, and they
 * are STORED-EXPLICIT (schema/photo.ts): the UI resolved their pixel result at
 * push time, so folding reads ONLY the stored fields — never the document target:
 *
 *   • bleedExpand {px}  → grows every edge by `px`: w+2·px, h+2·px.
 *   • fitToSize {rect|pad} → fill stores an anchored crop `rect` (dims become
 *                         rect.w × rect.h); fit stores anchored white padding
 *                         `pad` (dims become w+l+r × h+t+b). Exactly one is
 *                         present per the schema's mode invariant.
 *   • resize {targetPx} → dims become targetPx.width × targetPx.height.
 *
 * Every remaining op tag (adjust, autoEnhance, textOverlay, logoOverlay, erase)
 * is NOT a geometry op — it changes pixels or composites without changing the
 * raster's dimensions. `isGeometryOp` is the single source of truth; `effectiveDims`
 * folds exactly the seven dimensioning ops above and ignores the rest.
 */

export interface Dims {
  w: number;
  h: number;
}

/** The ops that change the effective raster's dimensions (see header): the four
    interactive geometry ops plus the three stored-explicit print-geometry ops. */
export function isGeometryOp(op: PhotoOp): boolean {
  return (
    op.op === "crop" ||
    op.op === "rotate" ||
    op.op === "flip" ||
    op.op === "straighten" ||
    op.op === "bleedExpand" ||
    op.op === "fitToSize" ||
    op.op === "resize"
  );
}

function intDim(v: number): number {
  return Math.max(1, Math.round(v));
}

/**
 * Fold a recipe to the effective image dimensions (integers ≥ 1) per the binding
 * semantics in the header. Non-geometry ops are ignored; the redo tail is the
 * caller's concern (pass `recipe.slice(0, cursor)`).
 */
export function effectiveDims(source: Dims, ops: PhotoOp[]): Dims {
  let w = intDim(source.w);
  let h = intDim(source.h);
  for (const op of ops) {
    switch (op.op) {
      case "crop":
        w = intDim(op.rect.w);
        h = intDim(op.rect.h);
        break;
      case "rotate":
        if (Math.abs(op.quarterTurns) % 2 === 1) {
          const t = w;
          w = h;
          h = t;
        }
        break;
      case "bleedExpand":
        // Stored-explicit px per edge → grow both axes by 2·px.
        w = intDim(w + 2 * op.px);
        h = intDim(h + 2 * op.px);
        break;
      case "fitToSize":
        // fill stores an anchored crop rect; fit stores anchored white padding.
        // The schema guarantees exactly one is present, matching the mode.
        if (op.rect) {
          w = intDim(op.rect.w);
          h = intDim(op.rect.h);
        } else if (op.pad) {
          w = intDim(w + op.pad.l + op.pad.r);
          h = intDim(h + op.pad.t + op.pad.b);
        }
        break;
      case "resize":
        // Stored-explicit resolved output dims — never re-derived from the target.
        w = intDim(op.targetPx.width);
        h = intDim(op.targetPx.height);
        break;
      // flip + straighten leave dims unchanged; every other op is not geometry.
      default:
        break;
    }
  }
  return { w, h };
}

/**
 * Minimal COVER scale for a straighten of `degrees` (the header's straighten
 * semantics). Derivation — the clean dual: rotating a w×h image by θ and asking
 * "how much must it grow so the original w×h frame is still fully covered?" is
 * equivalent (apply the inverse rotation, which preserves containment) to
 * "how large an axis-aligned s·w × s·h box contains the θ-rotated w×h frame?".
 * The θ-rotated frame's axis-aligned bounding box is
 *   width  = w·|cos θ| + h·|sin θ|
 *   height = w·|sin θ| + h·|cos θ|
 * so s·w ≥ that width and s·h ≥ that height, and the minimal s is the max of the
 * two per-axis requirements:
 *
 *   s(θ) = max( (w·|cos θ| + h·|sin θ|) / w ,  (w·|sin θ| + h·|cos θ|) / h )
 *
 * Properties (all proven in the tests): s(0) = 1; s(θ) = s(−θ) (even in θ);
 * strictly increasing on (0°, 45°]; and a numeric corner-cover check passes at
 * every angle. NOTE: for |θ| ≤ 90° this max reduces to the closed form
 * `|cos θ| + (max(w,h)/min(w,h))·|sin θ|` — the two are numerically identical —
 * but the per-axis-max form above is the honest derivation and stays correct by
 * construction, so it is what ships. At θ = 90° s = max(w,h)/min(w,h) (a portrait
 * frame needs the landscape image scaled to span it, and vice-versa).
 */
export function straightenScale(dims: Dims, degrees: number): number {
  const { w, h } = dims;
  if (w <= 0 || h <= 0) return 1;
  const rad = (Math.abs(degrees) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const coverW = (w * c + h * s) / w;
  const coverH = (w * s + h * c) / h;
  return Math.max(coverW, coverH);
}

/**
 * Effective print resolution for `pixels` printed at `inches`, in the best of
 * the two orientations (the print never cares which way the paper turns): the
 * limiting (min) axis of each orientation, then the better (max) of the two,
 * floored to a whole DPI.
 *
 *   dpi = ⌊ max( min(pw/iw, ph/ih),  min(pw/ih, ph/iw) ) ⌋
 *
 * The wires' worked examples (plan §5, pinned): 4032×3024 @ 4×6 → 672;
 * 1280×960 @ 8×10 → 120; 1200×900 @ 16×20 → 56.
 */
export function effectiveDpi(pixels: Dims, inches: Dims): number {
  const { w: pw, h: ph } = pixels;
  const { w: iw, h: ih } = inches;
  if (iw <= 0 || ih <= 0) return 0;
  const upright = Math.min(pw / iw, ph / ih);
  const turned = Math.min(pw / ih, ph / iw);
  return Math.floor(Math.max(upright, turned));
}

export type DpiVerdict = "green" | "amber" | "red";

/**
 * Print-resolution verdict for the strip's chip: ≥300 green, ≥100 amber, <100
 * red. Engineering thresholds chosen so the wire's chips hold on its own
 * fixtures — 672 → green, 120 → amber, 56 → red — advisory, never blocking
 * (plan §2, §5). PE5 + a designer confirmation may tune these (plan open
 * question #7: the wire's printed 148/72 don't survive the min-axis arithmetic;
 * the verdicts do).
 */
export function dpiVerdict(dpi: number): DpiVerdict {
  if (dpi >= 300) return "green";
  if (dpi >= 100) return "amber";
  return "red";
}

/**
 * Format a print size as the strip/chip label — "4 × 6" style: a spaced
 * multiplication sign (U+00D7), trailing ".0" dropped so a whole number prints
 * bare ("4", "16") while a real fraction survives ("8.5" stays "8.5", "3.5"
 * stays "3.5"). `toFixed(2)` first absorbs any float noise before the trailing
 * zeros are trimmed.
 */
export function printSizeLabel(size: Dims): string {
  const fmt = (n: number) => Number(n.toFixed(2)).toString();
  return `${fmt(size.w)} × ${fmt(size.h)}`;
}

/**
 * The print-check chip's size-qualified copy (wire-pinned — handoff Section C,
 * plan §5). Green and amber NAME the size; red is deliberately size-agnostic
 * ("too low at this size" — a red chip means no realistic size rescues the file,
 * so the wire drops the label rather than implying a smaller size would pass):
 *
 *   green → "672 DPI — great at 4 × 6"
 *   amber → "120 DPI — may look soft at 8 × 10"
 *   red   → "56 DPI — too low at this size"
 *
 * `dpi` is an effectiveDpi() result, `verdict` its dpiVerdict() (the caller
 * pairs them so colour and copy always agree), and `sizeLabel` a
 * printSizeLabel() string. PE5's strip renders exactly this string.
 */
export function dpiChipCopy(
  dpi: number,
  verdict: DpiVerdict,
  sizeLabel: string,
): string {
  switch (verdict) {
    case "green":
      return `${dpi} DPI — great at ${sizeLabel}`;
    case "amber":
      return `${dpi} DPI — may look soft at ${sizeLabel}`;
    case "red":
      return `${dpi} DPI — too low at this size`;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The centered, maximum-area crop rect for a target aspect, AUTO-ORIENTED: the
 * grid stores one ratio per preset (e.g. 4×6 as 1.5) and this tries both that
 * ratio and its reciprocal, keeping whichever fills more of the image — so a 4×6
 * preset lands landscape on a landscape photo and portrait on a portrait one
 * without the panel tracking orientation. `ratio` null (Free / Original before
 * the panel resolves it) returns the whole image.
 */
export function aspectRectFor(image: Dims, ratio: number | null): PixelRect {
  const W = image.w;
  const H = image.h;
  if (ratio === null || ratio <= 0 || W <= 0 || H <= 0) {
    return { x: 0, y: 0, w: W, h: H };
  }
  const fit = (r: number) => {
    const w = Math.min(W, H * r);
    const h = w / r;
    return { w, h };
  };
  const a = fit(ratio);
  const b = fit(1 / ratio);
  const best = b.w * b.h > a.w * a.h ? b : a;
  return {
    x: (W - best.w) / 2,
    y: (H - best.h) / 2,
    w: best.w,
    h: best.h,
  };
}

/**
 * Clamp a rect fully inside the image: oversize dimensions shrink to the image,
 * then the origin is pulled in so the rect never overhangs an edge.
 */
export function clampRectToImage(rect: PixelRect, image: Dims): PixelRect {
  const w = Math.min(rect.w, image.w);
  const h = Math.min(rect.h, image.h);
  return {
    x: clamp(rect.x, 0, image.w - w),
    y: clamp(rect.y, 0, image.h - h),
    w,
    h,
  };
}

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** −1 = the handle drives the min edge (left/top), +1 = the max edge (right/bottom), 0 = free. */
const HANDLE_X: Record<CropHandle, -1 | 0 | 1> = {
  nw: -1, n: 0, ne: 1, e: 1, se: 1, s: 0, sw: -1, w: -1,
};
const HANDLE_Y: Record<CropHandle, -1 | 0 | 1> = {
  nw: -1, n: -1, ne: -1, e: 0, se: 1, s: 1, sw: 1, w: 0,
};

const DEFAULT_MIN_CROP = 16;

/** Free-aspect handle drag: move only the edges the handle owns, min-clamped
    against the fixed opposite edge and clamped to the image. */
function resizeFree(
  rect: PixelRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  image: Dims,
  minSize: number,
): PixelRect {
  const hx = HANDLE_X[handle];
  const hy = HANDLE_Y[handle];
  let left = rect.x;
  let right = rect.x + rect.w;
  let top = rect.y;
  let bottom = rect.y + rect.h;

  if (hx < 0) left = clamp(left + dx, 0, right - minSize);
  else if (hx > 0) right = clamp(right + dx, left + minSize, image.w);
  if (hy < 0) top = clamp(top + dy, 0, bottom - minSize);
  else if (hy > 0) bottom = clamp(bottom + dy, top + minSize, image.h);

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The aspect (w/h) to hold during a locked drag — the orientation of `ratio`
    (ratio or 1/ratio) nearer the rect's current shape, so a drag never flips it. */
function lockedAspect(rect: PixelRect, ratio: number): number {
  const cur = rect.h > 0 ? rect.w / rect.h : ratio;
  const inv = 1 / ratio;
  return Math.abs(ratio - cur) <= Math.abs(inv - cur) ? ratio : inv;
}

/**
 * Crop-handle drag math (plan §3.2 CropOverlay). Free when `ratio` is null:
 * corner handles move two edges, edge handles one, each clamped to the image
 * with a `minSize` (default 16 px) floor against the fixed opposite edge.
 * Ratio-LOCKED (`ratio != null`): corner handles scale both axes about the
 * opposite corner; edge handles drive their free axis and DERIVE the other from
 * the aspect about the perpendicular centre — the rect keeps its aspect through
 * min-clamping and image-fit (a uniform shrink), so `w/h` holds within rounding.
 */
export function resizeCropRect(
  rect: PixelRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  image: Dims,
  minSize: number = DEFAULT_MIN_CROP,
): PixelRect {
  if (ratio === null || ratio <= 0) {
    return resizeFree(rect, handle, dx, dy, image, minSize);
  }

  const hx = HANDLE_X[handle];
  const hy = HANDLE_Y[handle];
  const a = lockedAspect(rect, ratio);

  // Candidate new size from the raw drag, before aspect reconciliation.
  let newW: number;
  let newH: number;
  if (hx !== 0 && hy !== 0) {
    // Corner: honour whichever axis the pointer moved more, derive the other.
    const rawW = rect.w + hx * dx;
    const rawH = rect.h + hy * dy;
    if (Math.abs(rawW - rect.w) * rect.h >= Math.abs(rawH - rect.h) * rect.w) {
      newW = rawW;
      newH = rawW / a;
    } else {
      newH = rawH;
      newW = rawH * a;
    }
  } else if (hx !== 0) {
    // Horizontal edge: width is free, height derived.
    newW = rect.w + hx * dx;
    newH = newW / a;
  } else {
    // Vertical edge: height is free, width derived.
    newH = rect.h + hy * dy;
    newW = newH * a;
  }

  // Min-size floor, aspect-preserving.
  if (newW < minSize) {
    newW = minSize;
    newH = newW / a;
  }
  if (newH < minSize) {
    newH = minSize;
    newW = newH * a;
  }

  // Anchor the fixed edge/corner; edge handles pin the perpendicular centre.
  const anchorX = hx < 0 ? rect.x + rect.w : hx > 0 ? rect.x : rect.x + rect.w / 2;
  const anchorY = hy < 0 ? rect.y + rect.h : hy > 0 ? rect.y : rect.y + rect.h / 2;

  // Room available for growth in each axis, then a uniform shrink to fit (keeps aspect).
  const roomW = hx < 0 ? anchorX : hx > 0 ? image.w - anchorX : 2 * Math.min(anchorX, image.w - anchorX);
  const roomH = hy < 0 ? anchorY : hy > 0 ? image.h - anchorY : 2 * Math.min(anchorY, image.h - anchorY);
  const scale = Math.min(1, roomW / newW, roomH / newH);
  if (scale < 1 && scale > 0) {
    newW *= scale;
    newH *= scale;
  }

  const x = hx < 0 ? anchorX - newW : hx > 0 ? anchorX : anchorX - newW / 2;
  const y = hy < 0 ? anchorY - newH : hy > 0 ? anchorY : anchorY - newH / 2;
  return { x, y, w: newW, h: newH };
}

/** Translate a crop rect by (dx, dy), clamped so it never overhangs the image
    (size unchanged — this is a move, not a resize). */
export function moveCropRect(
  rect: PixelRect,
  dx: number,
  dy: number,
  image: Dims,
): PixelRect {
  return {
    x: clamp(rect.x + dx, 0, Math.max(0, image.w - rect.w)),
    y: clamp(rect.y + dy, 0, Math.max(0, image.h - rect.h)),
    w: rect.w,
    h: rect.h,
  };
}

/**
 * The history-dock / slider label for a straighten (plan §5, wire-pinned):
 * "Straighten −1.2°" — a real Unicode minus (U+2212) for negatives, an explicit
 * "+" for zero and positives, always one decimal, a degree sign (U+00B0).
 */
export function straightenLabel(degrees: number): string {
  const sign = degrees < 0 ? "−" : "+";
  return `Straighten ${sign}${Math.abs(degrees).toFixed(1)}°`;
}
