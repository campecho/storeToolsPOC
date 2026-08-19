import {
  tailTipFor,
  type NormalizedPoint,
  type PathSeg,
  type ShapeObject,
} from "../model";

/**
 * Path builders for the Phase B shape tools (PLAN.md §4.4) — rounded
 * rectangle, star/polygon, callout, banner. Framework-free pure geometry:
 * coordinates — on-curve and control points alike — are normalized 0–1 within
 * the object's frame box, per the schema's path rule, so move/resize tooling
 * works on x/y/w/h unchanged and render/hit-test consume the segments as-is.
 *
 * Every builder but one returns a SINGLE closed subpath (one M … Z). The
 * banner is the exception, and says at its own definition why it has to be.
 */

/**
 * Cubic arc-approximation constant: control-point offset that makes one
 * cubic Bézier best fit a quarter circle, 4·(√2 − 1)/3.
 */
export const KAPPA = 0.5522847498307936;

/** Snap values within 1e-12 of the landmark coordinates 0, 0.5, 1 to those
 * exact values, so vertex positions computed via trig assert exactly. */
function snapLandmarks(v: number): number {
  for (const target of [0, 0.5, 1]) {
    if (Math.abs(v - target) < 1e-12) return target;
  }
  return v;
}

type Vertex = { x: number; y: number };

/** Rebuild a straight-edged closed subpath from a vertex ring: first vertex
 * becomes M, the rest L, then Z. */
function ringToPath(ring: readonly Vertex[]): PathSeg[] {
  return [
    ...ring.map((v, i): PathSeg => ({ c: i === 0 ? "M" : "L", x: v.x, y: v.y })),
    { c: "Z" },
  ];
}

/**
 * Rounded rectangle traced clockwise from the top edge, corners as
 * quarter-circle cubics (KAPPA). `rx`/`ry` are normalized corner radii; the
 * caller clamps to [0, 0.5] already, but clamp again defensively. Both radii
 * zero degenerates to the plain rectangle.
 */
export function roundedRectPath(rx: number, ry: number): PathSeg[] {
  const cx = Math.min(Math.max(rx, 0), 0.5);
  const cy = Math.min(Math.max(ry, 0), 0.5);
  if (cx === 0 && cy === 0) {
    return ringToPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  }
  const kx = KAPPA * cx;
  const ky = KAPPA * cy;
  return [
    { c: "M", x: cx, y: 0 },
    { c: "L", x: 1 - cx, y: 0 },
    { c: "C", x1: 1 - cx + kx, y1: 0, x2: 1, y2: cy - ky, x: 1, y: cy },
    { c: "L", x: 1, y: 1 - cy },
    { c: "C", x1: 1, y1: 1 - cy + ky, x2: 1 - cx + kx, y2: 1, x: 1 - cx, y: 1 },
    { c: "L", x: cx, y: 1 },
    { c: "C", x1: cx - kx, y1: 1, x2: 0, y2: 1 - cy + ky, x: 0, y: 1 - cy },
    { c: "L", x: 0, y: cy },
    { c: "C", x1: 0, y1: cy - ky, x2: cx - kx, y2: 0, x: cx, y: 0 },
    { c: "Z" },
  ];
}

/**
 * The corner radius a box can actually draw: inches, clamped to the
 * geometric bound of half the shorter side (the roundedRect contract's
 * runtime clamp). The STORED radius is deliberately not clamped — a resize
 * can shrink a frame under a radius the user set — so this is applied at
 * every point of use and growing the frame back restores the full radius.
 */
export function clampCornerRadius(radiusIn: number, w: number, h: number): number {
  const bound = Math.max(Math.min(w, h) / 2, 0);
  return Math.min(Math.max(radiusIn, 0), bound);
}

/** A rounded rect's outline in unit-box space: one inch radius normalized
    per axis, so it stays a circular arc once the box scales it back. */
export function roundedRectPathFor(radiusIn: number, w: number, h: number): PathSeg[] {
  const r = clampCornerRadius(radiusIn, w, h);
  return roundedRectPath(w > 0 ? r / w : 0, h > 0 ? r / h : 0);
}

/**
 * Star inscribed in the unit box: 2·points vertices alternating between the
 * outer radius (1) and `innerRatio`, starting from the top point at
 * (0.5, 0) and proceeding clockwise. `points` floors and clamps to at least
 * 3; `innerRatio` clamps to [0.05, 0.95].
 */
export function starPath(points: number, innerRatio: number): PathSeg[] {
  const n = Math.max(3, Math.floor(points));
  const ratio = Math.min(Math.max(innerRatio, 0.05), 0.95);
  const ring: Vertex[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = ((-90 + i * (180 / n)) * Math.PI) / 180;
    const r = i % 2 === 0 ? 1 : ratio;
    ring.push({
      x: snapLandmarks(0.5 + 0.5 * r * Math.cos(a)),
      y: snapLandmarks(0.5 + 0.5 * r * Math.sin(a)),
    });
  }
  return ringToPath(ring);
}

/**
 * How wide the tail's base sits on the body edge, as a fraction of the unit
 * box, measured either side of where the tail leaves. ASSUMPTION: 0.09 keeps
 * the base close to the proportions the fixed four-corner callout drew —
 * eyeballed from Publisher, working guess for SME review.
 */
export const CALLOUT_TAIL_HALF_BASE = 0.09;

/** How far outside the frame the tip may be dragged, in box lengths. The tip
    is deliberately allowed OUT of the box — that is what gives the tail real
    length — but not so far that its handle leaves the page. */
export const CALLOUT_TIP_MIN = -1;
export const CALLOUT_TIP_MAX = 2;

export function clampCalloutTip(tip: NormalizedPoint): NormalizedPoint {
  const axis = (v: number) => Math.min(CALLOUT_TIP_MAX, Math.max(CALLOUT_TIP_MIN, v));
  return { x: axis(tip.x), y: axis(tip.y) };
}

/** The unit-box corners the body ring walks, in order: tl, tr, br, bl. Edge i
    runs from corner i to corner i+1, so inserting the tail after corner i
    keeps the ring wound the way it started. */
const BODY_CORNERS: NormalizedPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Unit vector along edge i, in the ring's direction. */
const EDGE_DIRECTION: NormalizedPoint[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/**
 * Where a tail aimed at `tip` leaves the body, and along which edge — the ray
 * from the body's centre, stopped at the first side it crosses. Null when the
 * tip is inside the body (or at its centre): there is no tail to draw, and a
 * ray with nowhere to go would divide by zero.
 */
function tailExit(tip: NormalizedPoint): { point: NormalizedPoint; edge: number } | null {
  const dx = tip.x - 0.5;
  const dy = tip.y - 0.5;
  const toX = dx === 0 ? Infinity : 0.5 / Math.abs(dx);
  const toY = dy === 0 ? Infinity : 0.5 / Math.abs(dy);
  const t = Math.min(toX, toY);
  if (!Number.isFinite(t) || t >= 1) return null;
  return {
    point: { x: 0.5 + dx * t, y: 0.5 + dy * t },
    edge: toX <= toY ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0,
  };
}

/**
 * Speech callout: a rectangular body filling the frame, with a triangular
 * pointer running from a fixed-width base on the body edge out to `tip`.
 * Dragging the tip changes the tail's LENGTH and ANGLE together, PowerPoint's
 * behaviour, rather than snapping it to one of four corners.
 *
 * The tip is in unit-box coordinates and normally sits OUTSIDE the box, which
 * is what gives the tail length to have. The body ring is the frame, so the
 * selection frame hugs the body and the tail extends past it — again as
 * PowerPoint does. A tip inside the body draws no tail at all.
 */
export function calloutPath(tip: NormalizedPoint): PathSeg[] {
  const exit = tailExit(tip);
  if (exit === null) return ringToPath(BODY_CORNERS);
  const u = EDGE_DIRECTION[exit.edge] ?? { x: 1, y: 0 };
  // The base spans the edge either side of the exit, never past its corners —
  // a tail leaving near a corner narrows rather than wrapping onto the
  // neighbouring side.
  const clamped = (v: number) => Math.min(1, Math.max(0, v));
  const base = (sign: number): NormalizedPoint => ({
    x: clamped(exit.point.x + sign * u.x * CALLOUT_TAIL_HALF_BASE),
    y: clamped(exit.point.y + sign * u.y * CALLOUT_TAIL_HALF_BASE),
  });
  return ringToPath([
    ...BODY_CORNERS.slice(0, exit.edge + 1),
    base(-1),
    tip,
    base(1),
    ...BODY_CORNERS.slice(exit.edge + 1),
  ]);
}

/**
 * Banner adjustment ranges. `panelInset` is how far the raised panel's sides
 * sit in from the frame edges, leaving the tails visible either side;
 * `panelHeight` is where the panel's bottom edge falls. Both are fractions of
 * the frame, and between them they are the two yellow handles.
 *
 * The proportions the ribbon derives from the two parameters are MEASURED off
 * the pair of PowerPoint reference ribbons the review supplied, at the two
 * settings they were captured at.
 *
 * ASSUMPTION: the four bounds are not — they are eyeballed to keep the ribbon
 * drawable either side of those two settings, working guesses for SME review
 * as every other builder's ranges here are.
 */
export const BANNER_INSET_MIN = 0.05;
export const BANNER_INSET_MAX = 0.35;
export const BANNER_HEIGHT_MIN = 0.55;
export const BANNER_HEIGHT_MAX = 0.9;
export const BANNER_DEFAULT_INSET = 0.17;
export const BANNER_DEFAULT_HEIGHT = 0.65;

/** How deep the V cuts into a tail end, as a fraction of the frame's WIDTH —
    an absolute bite, not a share of the tail. Widening the tails therefore
    turns them from arrowheads into flags, which is exactly what separates the
    two reference ribbons (the bite measures 0.12 and 0.13 of the frame across
    insets of 0.16 and 0.25). */
const BANNER_NOTCH = 0.125;

/** The plate's top corner radius, as a fraction of the frame's SHORTER side.
    The reference rounds those corners circularly — measured 20px on a frame
    212px tall — and a banner frame is wide, so a share of the width would
    stretch them into a dome instead of a curve. */
const BANNER_CORNER = 0.095;

/** How far a fold reaches in from the plate's side edge, as a fraction of the
    frame's WIDTH. Like the notch it is an absolute bite rather than a share of
    the inset — measured 0.126 on the reference, whose inset is 0.248. (That it
    lands on the notch's value too is what the references show, not a constant
    shared on purpose.) */
const BANNER_FOLD = 0.125;

/** How deep a fold hangs below the plate, as a share of the space between the
    plate's bottom edge and the frame's — half of it, leaving the tail visible
    below the fold rather than the fold filling the gap. */
const BANNER_FOLD_DEPTH = 0.5;

/** How far the fold's outer cap reaches back along it, as a share of the
    fold's length. */
const BANNER_FOLD_CAP = 0.27;

export function clampBannerInset(inset: number): number {
  return Math.min(BANNER_INSET_MAX, Math.max(BANNER_INSET_MIN, inset));
}

export function clampBannerHeight(height: number): number {
  return Math.min(BANNER_HEIGHT_MAX, Math.max(BANNER_HEIGHT_MIN, height));
}

/** The proportions the rest of the ribbon takes from the two parameters. The
    frame size comes in because the plate's corners are round: a radius has to
    be normalized per axis, or the frame's aspect stretches it. */
function bannerParts(inset: number, height: number, w: number, h: number) {
  const x0 = clampBannerInset(inset);
  const plateBottom = clampBannerHeight(height);
  // Bounded by the plate it rounds, so a squat or narrow plate keeps a
  // drawable corner instead of overrunning its own edges.
  const radius = Math.min(
    BANNER_CORNER * Math.min(w, h),
    ((1 - 2 * x0) * w) / 2,
    plateBottom * h,
  );
  const foldHeight = (1 - plateBottom) * BANNER_FOLD_DEPTH;
  return {
    x0,
    x1: 1 - x0,
    plateBottom,
    /** The tails' band MIRRORS the plate: same height, anchored to the bottom
        where the plate is anchored to the top. So a deeper plate raises the
        tails to meet it rather than pushing them down, and the two always
        overlap across the middle — which is what makes the plate read as
        standing in front of the band. (Measured off the reference: a plate
        ending at 0.830 has tails from 0.170.) BANNER_HEIGHT_MIN keeps that
        overlap: below half, the bands would part and leave the ribbon in two
        pieces. */
    tailTop: 1 - plateBottom,
    /** How far each tail reaches IN past the plate's side edge — the width of
        the fold it tucks under, and no further: below the plate the middle of
        the frame is empty, which is what stops the ribbon reading as one flat
        band with a rectangle stuck on it. */
    reach: BANNER_FOLD,
    /** The V bites a fixed share of the frame, floored by the tail it cuts so
        a narrow tail keeps a sliver of body rather than being cut through. */
    notch: Math.min(BANNER_NOTCH, x0 * 0.85),
    foldHeight,
    /** The fold's outer end is capped by a half-ellipse, and the tail's inner
        bottom corner turns on the same two radii — one curve, used at both
        ends of the fold, so they read as one turn of the ribbon. */
    capX: BANNER_FOLD * BANNER_FOLD_CAP,
    capY: foldHeight / 2,
    /** The plate's top corner radius, one radius per axis. */
    roundX: w > 0 ? radius / w : 0,
    roundY: h > 0 ? radius / h : 0,
  };
}

/**
 * Ribbon banner, built as the reference is (PLAN.md §4.4):
 *
 *   CENTRE PLATE — a wide rectangle in the foreground, its top corners curving
 *   down so the plate reads as a curved surface rather than a flat card.
 *   SIDE TAILS — two horizontal ribbon ends BEHIND the plate, each cut by an
 *   inward-pointing V (a swallowtail) at its outer end.
 *   FOLDS — the shaded turns joining the plate's bottom corners to the inner
 *   bottoms of the tails, which is what makes the ribbon read as 3D. They are
 *   shading, not silhouette, so they live in `bannerShading` instead.
 *
 * THREE rings, which breaks the single-ring shape every other builder returns.
 * It has to: the plate's edges read as STROKED lines where it crosses the
 * tails, and one silhouette ring cannot draw a line inside itself.
 *
 * The rings TILE rather than overlap — each tail is L-shaped, wrapping under
 * the plate exactly as far as its fold reaches and no further, so the three
 * meet along shared edges and none covers another. That matters beyond
 * tidiness: hit testing walks the outline even-odd, and a plate laid over
 * full-width tails would punch the overlap out as a hole.
 */
export function bannerPath(inset: number, height: number, w: number, h: number): PathSeg[] {
  const p = bannerParts(inset, height, w, h);
  const kx = KAPPA * p.roundX;
  const ky = KAPPA * p.roundY;
  const tailMid = (p.tailTop + 1) / 2;
  // Where each tail stops, having wrapped under the plate by one fold.
  const inner = p.x0 + p.reach;
  const innerRight = p.x1 - p.reach;
  const kcx = KAPPA * p.capX;
  const kcy = KAPPA * p.capY;
  return [
    // The centre plate, rounded across its top.
    { c: "M", x: p.x0, y: p.roundY },
    {
      c: "C",
      x1: p.x0,
      y1: p.roundY - ky,
      x2: p.x0 + p.roundX - kx,
      y2: 0,
      x: p.x0 + p.roundX,
      y: 0,
    },
    { c: "L", x: p.x1 - p.roundX, y: 0 },
    {
      c: "C",
      x1: p.x1 - p.roundX + kx,
      y1: 0,
      x2: p.x1,
      y2: p.roundY - ky,
      x: p.x1,
      y: p.roundY,
    },
    { c: "L", x: p.x1, y: p.plateBottom },
    { c: "L", x: p.x0, y: p.plateBottom },
    { c: "Z" },
    // Left tail: along the plate's side, under its bottom edge as far as the
    // fold, then out to the swallowtail.
    { c: "M", x: 0, y: p.tailTop },
    { c: "L", x: p.x0, y: p.tailTop },
    { c: "L", x: p.x0, y: p.plateBottom },
    { c: "L", x: inner, y: p.plateBottom },
    { c: "L", x: inner, y: 1 - p.capY },
    {
      c: "C",
      x1: inner,
      y1: 1 - p.capY + kcy,
      x2: inner - p.capX + kcx,
      y2: 1,
      x: inner - p.capX,
      y: 1,
    },
    { c: "L", x: 0, y: 1 },
    { c: "L", x: p.notch, y: tailMid },
    { c: "Z" },
    // Right tail, the same mirrored.
    { c: "M", x: p.x1, y: p.tailTop },
    { c: "L", x: 1, y: p.tailTop },
    { c: "L", x: 1 - p.notch, y: tailMid },
    { c: "L", x: 1, y: 1 },
    { c: "L", x: innerRight + p.capX, y: 1 },
    {
      c: "C",
      x1: innerRight + p.capX - kcx,
      y1: 1,
      x2: innerRight,
      y2: 1 - p.capY + kcy,
      x: innerRight,
      y: 1 - p.capY,
    },
    { c: "L", x: innerRight, y: p.plateBottom },
    { c: "L", x: p.x1, y: p.plateBottom },
    { c: "Z" },
  ];
}

/**
 * The banner's two FOLDS: the shaded turns under the plate's bottom corners.
 *
 * Each is a tongue hanging off the plate's bottom edge — flat along the top
 * and bottom, cut square where it meets the tail's inner end, and capped by a
 * half-ellipse at its outer end where it wraps around the plate's side. They
 * sit wholly inside the silhouette `bannerPath` draws, which is why they are
 * shading rather than geometry: bounds and hit testing never see them.
 */
export function bannerShading(inset: number, height: number, w: number, h: number): PathSeg[] {
  const p = bannerParts(inset, height, w, h);
  const bottom = p.plateBottom + p.foldHeight;
  const mid = p.plateBottom + p.capY;
  const kcx = KAPPA * p.capX;
  const kcy = KAPPA * p.capY;
  return [
    // Left fold, capped where it turns around the plate's left edge.
    { c: "M", x: p.x0 + p.capX, y: p.plateBottom },
    { c: "L", x: p.x0 + p.reach, y: p.plateBottom },
    { c: "L", x: p.x0 + p.reach, y: bottom },
    { c: "L", x: p.x0 + p.capX, y: bottom },
    { c: "C", x1: p.x0 + p.capX - kcx, y1: bottom, x2: p.x0, y2: mid + kcy, x: p.x0, y: mid },
    {
      c: "C",
      x1: p.x0,
      y1: mid - kcy,
      x2: p.x0 + p.capX - kcx,
      y2: p.plateBottom,
      x: p.x0 + p.capX,
      y: p.plateBottom,
    },
    { c: "Z" },
    // Right fold, the same mirrored.
    { c: "M", x: p.x1 - p.reach, y: p.plateBottom },
    { c: "L", x: p.x1 - p.capX, y: p.plateBottom },
    {
      c: "C",
      x1: p.x1 - p.capX + kcx,
      y1: p.plateBottom,
      x2: p.x1,
      y2: mid - kcy,
      x: p.x1,
      y: mid,
    },
    { c: "C", x1: p.x1, y1: mid + kcy, x2: p.x1 - p.capX + kcx, y2: bottom, x: p.x1 - p.capX, y: bottom },
    { c: "L", x: p.x1 - p.reach, y: bottom },
    { c: "Z" },
  ];
}

/**
 * The normalized outline a shape draws, from whatever it stores: a path's own
 * segments, or a parametric kind's parameter resolved against its frame. One
 * resolver for the renderer, hit-testing and the overlay previews, so a shape
 * can never be drawn as one thing and hit as another.
 */
/** Everything an outline needs from a shape: its kind and the geometry
    fields that kind owns. A whole ShapeObject satisfies it, and so does a
    drawn shape's geometry before it has a frame. */
export type ShapeGeometry = Pick<
  ShapeObject,
  | "shape"
  | "d"
  | "cornerRadius"
  | "points"
  | "innerRadiusRatio"
  | "tailTip"
  | "panelInset"
  | "panelHeight"
>;

/**
 * The points a kind's outline reaches OUTSIDE its unit box, in unit-box
 * coordinates — the callout's tail tip is the only one, because it is the
 * only builder that leaves the box on purpose. Bounds math adds these so an
 * object's AABB covers what is actually drawn.
 *
 * Every other kind is normalized inside [0, 1] and returns nothing, which
 * this file's tests assert builder by builder. A future kind that overshoots
 * declares it HERE, next to the builder that draws it, rather than leaving
 * bounds math to guess.
 */
export function outlineOvershoot(shape: ShapeGeometry): NormalizedPoint[] {
  return shape.shape === "callout" ? [shape.tailTip ?? tailTipFor("bottom-left")] : [];
}

export function shapeOutline(shape: ShapeGeometry, w: number, h: number): PathSeg[] {
  switch (shape.shape) {
    case "roundedRect":
      return roundedRectPathFor(shape.cornerRadius ?? 0, w, h);
    case "starPolygon":
      return starPath(shape.points ?? 5, shape.innerRadiusRatio ?? 0.5);
    case "callout":
      return calloutPath(shape.tailTip ?? tailTipFor("bottom-left"));
    case "banner":
      return bannerPath(
        shape.panelInset ?? BANNER_DEFAULT_INSET,
        shape.panelHeight ?? BANNER_DEFAULT_HEIGHT,
        w,
        h,
      );
    default:
      return shape.d ?? [];
  }
}

/**
 * The parts of a shape that render in a DARKER fill than the rest — shading,
 * not silhouette. Same normalized frame coordinates `shapeOutline` uses; the
 * renderer paints them OVER the outline in the object's fill darkened, wearing
 * the object's own stroke.
 *
 * The banner's folds are the only ones: they read as the ribbon's shaded
 * underside where it turns behind the plate, and a single fill cannot say that.
 * They lie inside the silhouette by construction, so hit testing and bounds —
 * which work from `shapeOutline` alone — need to know nothing about them.
 * Every other kind returns nothing, which this file's tests assert kind by
 * kind, so a future shaded kind declares itself HERE rather than leaving the
 * renderer to guess.
 */
export function shapeShading(shape: ShapeGeometry, w: number, h: number): PathSeg[] {
  return shape.shape === "banner"
    ? bannerShading(
        shape.panelInset ?? BANNER_DEFAULT_INSET,
        shape.panelHeight ?? BANNER_DEFAULT_HEIGHT,
        w,
        h,
      )
    : [];
}
