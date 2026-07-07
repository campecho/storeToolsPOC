/**
 * SVG elliptical-arc → cubic-bézier conversion (plan §10.2 arc slice).
 *
 * librevenge/libmspub emit path arcs as the SVG `A` verb (endpoint
 * parametrization: rx ry x-axis-rotation large-arc-flag sweep-flag x y). The
 * editor's path model only speaks M/L/C/Q/Z, so arcs are lowered to cubics at
 * the model boundary. This is the standard endpoint→center conversion from the
 * SVG 1.1 implementation notes (F.6.5 + F.6.6), with the sweep split into
 * ≤90° pieces at the parametric quadrant boundaries and each piece
 * approximated by one cubic using the classic k = 4/3·tan(Δθ/4) control-arm
 * length.
 *
 * Pure module — no imports, no I/O. Unit-agnostic: it operates in whatever
 * coordinate units the caller passes (inches on the trace side, points on the
 * reference side), so both import paths share this exact math.
 */

export type ArcParams = {
  rx: number;
  ry: number;
  /** x-axis rotation of the ellipse, DEGREES. */
  rotDeg: number;
  largeArc: boolean;
  sweep: boolean;
  /** arc endpoint (absolute). */
  x: number;
  y: number;
};

export type Cubic = { x1: number; y1: number; x2: number; y2: number; x: number; y: number };

/** A cubic whose control points lie on the P0→P1 line — a straight segment
    expressed in the C vocabulary, for degenerate (zero-radius) arcs. */
function lineCubic(from: { x: number; y: number }, to: { x: number; y: number }): Cubic {
  return {
    x1: from.x + (to.x - from.x) / 3,
    y1: from.y + (to.y - from.y) / 3,
    x2: from.x + (2 * (to.x - from.x)) / 3,
    y2: from.y + (2 * (to.y - from.y)) / 3,
    x: to.x,
    y: to.y,
  };
}

/** Signed angle (radians) from vector u to vector v, in [-π, π]. */
function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (len === 0) return 0;
  let c = dot / len;
  if (c < -1) c = -1;
  else if (c > 1) c = 1;
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  return sign * Math.acos(c);
}

/**
 * Convert one SVG elliptical arc to a list of cubic béziers (0+ segments).
 *
 * Degenerate handling per the SVG spec:
 *   - coincident endpoints (from == to): the arc is omitted entirely → `[]`
 *     (a full ellipse is emitted as two arcs, never one, exactly because a
 *     single arc can't have coincident endpoints).
 *   - rx or ry == 0: collapses to a straight line to the endpoint → one
 *     line-shaped cubic.
 * Radii too small to span the endpoints are scaled up (F.6.6 step 3).
 */
export function arcToCubics(from: { x: number; y: number }, arc: ArcParams): Cubic[] {
  const { x: x2, y: y2, rotDeg, largeArc, sweep } = arc;
  const x1 = from.x;
  const y1 = from.y;

  if (x1 === x2 && y1 === y2) return []; // coincident endpoints — nothing to draw

  let rx = Math.abs(arc.rx);
  let ry = Math.abs(arc.ry);
  if (rx === 0 || ry === 0) return [lineCubic(from, { x: x2, y: y2 })];

  const phi = (rotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // F.6.5.1 — (x1', y1'): endpoint delta rotated into the ellipse frame.
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // F.6.6.2 — enlarge radii if they can't span the chord.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  // F.6.5.2 — (cx', cy').
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  const den = rx2 * y1p2 + ry2 * x1p2;
  let radicand = den === 0 ? 0 : num / den;
  if (radicand < 0) radicand = 0; // guard float noise
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(radicand);
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * (-ry * x1p)) / rx;

  // F.6.5.3 — (cx, cy): back into user space.
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // F.6.5.4/5/6 — start angle θ1 and sweep Δθ.
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = vectorAngle(1, 0, ux, uy);
  let dTheta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // A point on the (rotated, translated) ellipse at local angle a.
  const point = (a: number) => {
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    return { x: cx + cosPhi * ex - sinPhi * ey, y: cy + sinPhi * ex + cosPhi * ey };
  };
  // The parametric derivative direction at local angle a (un-normalized).
  const deriv = (a: number) => {
    const ex = -rx * Math.sin(a);
    const ey = ry * Math.cos(a);
    return { x: cosPhi * ex - sinPhi * ey, y: sinPhi * ex + cosPhi * ey };
  };

  // Split at the parametric quadrant boundaries (θ = n·π/2) the sweep
  // crosses; pieces are ≤90° by construction. Splitting THERE (rather than
  // dividing the sweep equally) pins the ellipse's parametric extremes onto
  // piece ENDPOINTS, so the control-point hull never overshoots the
  // ellipse's own bounding box — the property the importer's hull-derived
  // bboxes rely on. (An equal split of a sweep just past 180° — which real
  // traces produce when 4-decimal endpoint rounding nudges the chord under
  // 2·rx — puts the extremes mid-segment and bulges the hull ~4.5% of r.)
  // Boundaries within 1e-7 rad of the sweep's ends are skipped: they'd make
  // degenerate slivers, and the adjacent piece is ≤90°+1e-7, which the
  // k-formula handles with error far below coordinate precision.
  const EPS_ANGLE = 1e-7;
  const halfPi = Math.PI / 2;
  const dir = dTheta < 0 ? -1 : 1;
  const theta2 = theta1 + dTheta;
  const bounds: number[] = [theta1];
  let b = dir > 0 ? Math.ceil(theta1 / halfPi) * halfPi : Math.floor(theta1 / halfPi) * halfPi;
  if ((b - theta1) * dir < EPS_ANGLE) b += dir * halfPi;
  while ((theta2 - b) * dir > EPS_ANGLE) {
    bounds.push(b);
    b += dir * halfPi;
  }
  bounds.push(theta2);

  const cubics: Cubic[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a1 = bounds[i];
    const a2 = bounds[i + 1];
    const k = (4 / 3) * Math.tan((a2 - a1) / 4);
    const p0 = point(a1);
    const d0 = deriv(a1);
    const p3 = point(a2);
    const d3 = deriv(a2);
    cubics.push({
      x1: p0.x + k * d0.x,
      y1: p0.y + k * d0.y,
      x2: p3.x - k * d3.x,
      y2: p3.y - k * d3.y,
      x: p3.x,
      y: p3.y,
    });
  }
  return cubics;
}
