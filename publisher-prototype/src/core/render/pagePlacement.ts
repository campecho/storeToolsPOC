import { objectAabb, type Rect } from "../hittest";
import type { LayoutObject, PageSize } from "../model";
import { headLengthIn, PT_PER_IN } from "./lineDecor";
import { DPI, ZOOM_MIN } from "../geometry/viewport";

/**
 * Page placement — the one authority for whether an object sits ON the page,
 * OFF it on the pasteboard, or STRADDLING the page edge (decision of record
 * in SEAMS.md, 2026-09-08). The content renderer reads this to ghost
 * off-page ink per requirements §2.5 ("indicate clearly when an object is
 * partially on the page; the boundary between page and pasteboard ...
 * determines what prints"); it is also the named future input of §10.1's
 * straddle check and §2.5's print/export exclusion. Framework-free pure rect
 * math over canonical document inches (PLAN.md §6.2).
 *
 * Conservativeness rule: clipping does the exact work at render time — `on`
 * and `off` are shortcuts that skip it. A wrong shortcut changes a pixel only
 * if ink lay outside the bounds it was judged on, so `inkBounds` must contain
 * every pixel the renderer can touch — every miter, arrowhead and hairline
 * the object can draw. Given that, the only possible classification error is
 * calling something that is actually `on` or `off` "straddling" instead,
 * which costs one extra (harmless) draw and changes no pixel on screen. So
 * every pad below rounds UP, on purpose.
 */

/** ASSUMPTION: 50% is a working guess for SME review (PLAN.md §0.1) —
    the ghost opacity of ink outside the page. The debug bar's off-page
    ghost slider seeds from this and overrides it live, so review can judge
    the number against real content instead of a screenshot; the default
    here is what boots, what the fixtures render at, and what the pixel
    probe asserts. */
export const PASTEBOARD_GHOST_OPACITY = 0.5;

/** The range that slider offers. Both ends are legitimate answers to §2.5's
    "visually unambiguous" boundary — hide off-page ink entirely, or don't
    dim it at all — so review gets the whole interval rather than a safe
    band around the guess. */
export const GHOST_OPACITY_MIN = 0;
export const GHOST_OPACITY_MAX = 1;

/** Clamps a ghost opacity into range, the `clampZoom` pattern. A non-finite
    value — the shell reads a control whose value is a string — falls back to
    the default rather than to an end of the range, so a malformed read shows
    the assumption under review, not `0` (every off-page object invisible)
    or `1` (no page boundary at all). */
export function clampGhostOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return PASTEBOARD_GHOST_OPACITY;
  return Math.min(GHOST_OPACITY_MAX, Math.max(GHOST_OPACITY_MIN, opacity));
}

export type PagePlacement = "on" | "off" | "straddling";

/** The page region in document inches: one page at the origin. A spread's
    pages (PLAN.md §6.8) will need the document and page index instead. */
export function pageRegion(size: PageSize): readonly Rect[] {
  return [{ x: 0, y: 0, w: size.w, h: size.h }];
}

/** Konva leaves the canvas defaults, lineJoin "miter" with miterLimit 10;
    the limit bounds the miter's full length, so a sharp vertex's tip reaches
    at most five stroke widths past the geometric point; ten is that bound
    doubled, on purpose (conservative is free here). */
const MITER_PAD = 10;

/** The placeholder frames' 1px `strokeScaleEnabled={false}` hairline is
    widest in document inches at minimum zoom; classification must not depend
    on zoom. */
const HAIRLINE_PAD_IN = 1 / (DPI * ZOOM_MIN);

/** How far ink can reach past an object's geometric outline, in inches. */
export function inkPadIn(o: LayoutObject): number {
  switch (o.type) {
    case "shape":
      return o.stroke === null ? 0 : (o.stroke.width / PT_PER_IN) * MITER_PAD;
    case "line":
      // Endpoint bounds omit the stroke's half-width and the heads' sideways
      // reach; one head length covers both. Heads absent still pad — cheap
      // and safe, per §2.1's pad table.
      return (o.stroke.width / PT_PER_IN) * MITER_PAD + headLengthIn(o.headSize, o.stroke.width);
    case "textFrame":
    case "pictureFrame":
    case "table":
    case "mergeField":
      return HAIRLINE_PAD_IN;
  }
}

/** `objectAabb` inflated by `inkPadIn` on every side. */
export function inkBounds(o: LayoutObject): Rect {
  const pad = inkPadIn(o);
  const aabb = objectAabb(o);
  return { x: aabb.x - pad, y: aabb.y - pad, w: aabb.w + 2 * pad, h: aabb.h + 2 * pad };
}

/** `bounds` lies wholly inside `r`, closed interval — touching an edge from
    inside counts as inside. */
function inside(bounds: Rect, r: Rect): boolean {
  return (
    bounds.x >= r.x &&
    bounds.y >= r.y &&
    bounds.x + bounds.w <= r.x + r.w &&
    bounds.y + bounds.h <= r.y + r.h
  );
}

/** `bounds` and `r` share no point, closed interval — STRICT inequalities,
    so bounds that merely touch the page edge from outside are NOT disjoint:
    ink right at the edge is on the page. */
function disjoint(bounds: Rect, r: Rect): boolean {
  return (
    bounds.x + bounds.w < r.x ||
    bounds.x > r.x + r.w ||
    bounds.y + bounds.h < r.y ||
    bounds.y > r.y + r.h
  );
}

/** Pure rect math over closed intervals: `on` when `bounds` lies wholly
    inside a SINGLE rect of `region`; else `off` when `bounds` is disjoint
    from every rect of `region` — an EMPTY region has no rect to be inside
    and is vacuously disjoint from all (zero) of its rects, so it classifies
    everything `off`; otherwise `straddling`.

    Containment is tested against one rect AT A TIME, never the region's
    union. For today's one-rect page that is exact. For a future spread
    (PLAN.md §6.8, D5) an object crossing the spine sits inside the union of
    both pages but inside neither one alone, so it classifies `straddling`
    and the renderer clips it to the union — the correct picture, at the
    cost of one extra draw. That conservatism is deliberate; no
    rect-subtraction helper is built for it here. */
export function classifyPlacement(bounds: Rect, region: readonly Rect[]): PagePlacement {
  if (region.some((r) => inside(bounds, r))) return "on";
  if (region.every((r) => disjoint(bounds, r))) return "off";
  return "straddling";
}

/** classifyPlacement(inkBounds(o), region) */
export function objectPlacement(o: LayoutObject, region: readonly Rect[]): PagePlacement {
  return classifyPlacement(inkBounds(o), region);
}
