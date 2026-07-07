import { describe, expect, it } from "vitest";
import { arcToCubics, type Cubic } from "./arc";

/**
 * Unit tests for the SVG elliptical-arc → cubic conversion. The arc math is
 * the single source of truth for BOTH import sides (trace + reference), so it
 * is pinned against exact known geometry: endpoints must land ON the arc, and
 * every sampled point must lie on the parametric ellipse to sub-thousandth
 * precision (a 90°-max cubic split's radial error is < 3e-4·r).
 */

type Pt = { x: number; y: number };

/** de Casteljau evaluation of one cubic from `from` to its endpoint. */
function evalCubic(from: Pt, c: Cubic, t: number): Pt {
  const mt = 1 - t;
  const b0 = mt * mt * mt;
  const b1 = 3 * mt * mt * t;
  const b2 = 3 * mt * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * from.x + b1 * c.x1 + b2 * c.x2 + b3 * c.x,
    y: b0 * from.y + b1 * c.y1 + b2 * c.y2 + b3 * c.y,
  };
}

/** Sample a run of cubics starting from `start`, returning every point. */
function sample(start: Pt, cubics: Cubic[], per = 32): Pt[] {
  const pts: Pt[] = [start];
  let from = start;
  for (const c of cubics) {
    for (let i = 1; i <= per; i++) pts.push(evalCubic(from, c, i / per));
    from = { x: c.x, y: c.y };
  }
  return pts;
}

const hull = (pts: Pt[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

describe("arcToCubics: full circle via two 180° arcs", () => {
  const start: Pt = { x: 1, y: 0 };
  const arc1 = arcToCubics(start, { rx: 1, ry: 1, rotDeg: 0, largeArc: true, sweep: true, x: -1, y: 0 });
  const arc2 = arcToCubics({ x: -1, y: 0 }, { rx: 1, ry: 1, rotDeg: 0, largeArc: true, sweep: true, x: 1, y: 0 });

  it("splits each 180° arc into two ≤90° cubics", () => {
    expect(arc1).toHaveLength(2);
    expect(arc2).toHaveLength(2);
  });

  it("lands endpoints exactly on the unit circle", () => {
    expect(arc1[0].x).toBeCloseTo(0, 10);
    expect(arc1[0].y).toBeCloseTo(1, 10); // quarter: (1,0) → (0,1)
    expect(arc1[1].x).toBeCloseTo(-1, 10);
    expect(arc1[1].y).toBeCloseTo(0, 10);
    for (const c of [...arc1, ...arc2]) expect(Math.hypot(c.x, c.y)).toBeCloseTo(1, 10);
  });

  it("keeps every sampled point on the circle within 1e-3", () => {
    for (const p of [...sample(start, arc1), ...sample({ x: -1, y: 0 }, arc2)]) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 1)).toBeLessThan(1e-3);
    }
  });

  it("hulls to the ±r extremes (control points never bulge past r)", () => {
    const h = hull([...sample(start, arc1), ...sample({ x: -1, y: 0 }, arc2)]);
    // include control points too — they define the model-side bbox
    const cps = [...arc1, ...arc2].flatMap((c) => [
      { x: c.x1, y: c.y1 },
      { x: c.x2, y: c.y2 },
    ]);
    const hc = hull([...cps, start, { x: -1, y: 0 }]);
    for (const box of [h, hc]) {
      expect(box.minX).toBeCloseTo(-1, 3);
      expect(box.maxX).toBeCloseTo(1, 3);
      expect(box.minY).toBeCloseTo(-1, 3);
      expect(box.maxY).toBeCloseTo(1, 3);
    }
  });
});

describe("arcToCubics: quarter arc control arms", () => {
  it("uses k = 4/3·tan(22.5°) for a 90° circular quarter", () => {
    const [c] = arcToCubics({ x: 1, y: 0 }, { rx: 1, ry: 1, rotDeg: 0, largeArc: false, sweep: true, x: 0, y: 1 });
    const k = (4 / 3) * Math.tan(Math.PI / 8); // 0.552284…
    expect(c.x1).toBeCloseTo(1, 6);
    expect(c.y1).toBeCloseTo(k, 6);
    expect(c.x2).toBeCloseTo(k, 6);
    expect(c.y2).toBeCloseTo(1, 6);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(1, 6);
  });
});

describe("arcToCubics: unequal radii (rx ≠ ry)", () => {
  it("traces a quarter of a 2×1 ellipse", () => {
    const start: Pt = { x: 2, y: 0 };
    const cubics = arcToCubics(start, { rx: 2, ry: 1, rotDeg: 0, largeArc: false, sweep: true, x: 0, y: 1 });
    expect(cubics).toHaveLength(1);
    // control arm at the (2,0) end points straight up by k·ry
    expect(cubics[0].x1).toBeCloseTo(2, 6);
    expect(cubics[0].y1).toBeCloseTo((4 / 3) * Math.tan(Math.PI / 8), 6);
    for (const p of sample(start, cubics)) {
      expect(Math.abs((p.x / 2) ** 2 + p.y ** 2 - 1)).toBeLessThan(1e-3);
    }
  });
});

describe("arcToCubics: rotated ellipse (rotDeg ≠ 0)", () => {
  it("keeps points on the rotated ellipse locus", () => {
    const rotDeg = 30;
    const phi = (rotDeg * Math.PI) / 180;
    const rx = 2;
    const ry = 1;
    // half of the ellipse, center origin: from the +major-axis tip to its
    // antipode (both rotated by φ).
    const start: Pt = { x: rx * Math.cos(phi), y: rx * Math.sin(phi) };
    const end: Pt = { x: -rx * Math.cos(phi), y: -rx * Math.sin(phi) };
    const cubics = arcToCubics(start, { rx, ry, rotDeg, largeArc: true, sweep: true, x: end.x, y: end.y });
    for (const p of sample(start, cubics)) {
      const u = p.x * Math.cos(phi) + p.y * Math.sin(phi);
      const v = -p.x * Math.sin(phi) + p.y * Math.cos(phi);
      expect(Math.abs((u / rx) ** 2 + (v / ry) ** 2 - 1)).toBeLessThan(1e-3);
    }
  });
});

describe("arcToCubics: radii-too-small scale-up (F.6.6)", () => {
  it("enlarges radii that can't span the endpoints, tracing a semicircle", () => {
    // chord length 2, radii only 0.5 → λ = 4, radii scale ×2 to r = 1.
    const start: Pt = { x: 0, y: 0 };
    const cubics = arcToCubics(start, { rx: 0.5, ry: 0.5, rotDeg: 0, largeArc: false, sweep: true, x: 2, y: 0 });
    const pts = sample(start, cubics);
    // every point sits on the r=1 circle centered at the chord midpoint (1,0)
    for (const p of pts) expect(Math.abs(Math.hypot(p.x - 1, p.y) - 1)).toBeLessThan(1e-3);
    // and the semicircle reaches out to |y| ≈ 1 (radius grew to 1)
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeCloseTo(1, 3);
  });
});

describe("arcToCubics: degenerate cases", () => {
  it("zero radius collapses to one straight cubic (control points on the line)", () => {
    const cubics = arcToCubics({ x: 0, y: 0 }, { rx: 0, ry: 1, rotDeg: 0, largeArc: false, sweep: true, x: 3, y: 0 });
    expect(cubics).toHaveLength(1);
    expect(cubics[0]).toEqual({ x1: 1, y1: 0, x2: 2, y2: 0, x: 3, y: 0 });
  });

  it("coincident endpoints emit nothing (a full ellipse needs two arcs)", () => {
    expect(arcToCubics({ x: 1, y: 1 }, { rx: 1, ry: 1, rotDeg: 0, largeArc: true, sweep: true, x: 1, y: 1 })).toEqual([]);
  });
});

describe("arcToCubics: real callout circle (ecl_workbook page 3)", () => {
  it("hulls to the sane ~0.466×0.400in bbox, not a height-0 frame", () => {
    const start: Pt = { x: 1.6492, y: 8.3869 };
    const mid: Pt = { x: 1.1832, y: 8.3869 };
    const a = { rx: 0.233, ry: 0.2, rotDeg: 0 };
    const arc1 = arcToCubics(start, { ...a, largeArc: true, sweep: true, x: mid.x, y: mid.y });
    const arc2 = arcToCubics(mid, { ...a, largeArc: true, sweep: true, x: start.x, y: start.y });
    const cps = [start, mid, ...[...arc1, ...arc2].flatMap((c) => [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }])];
    const h = hull(cps);
    expect(h.maxX - h.minX).toBeCloseTo(0.466, 3);
    expect(h.maxY - h.minY).toBeCloseTo(0.4, 3);
    expect((h.minX + h.maxX) / 2).toBeCloseTo(1.4162, 3);
    expect((h.minY + h.maxY) / 2).toBeCloseTo(8.3869, 3);
  });
});
