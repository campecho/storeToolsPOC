import { describe, expect, it } from "vitest";
import { tailTipFor, type LineObject, type ShapeObject } from "../model";
import { objectAabb, orientedSelectionBox, selectionAabb, selectionFrame } from "./aabb";
import { boundsOfPoints, rotatePoint, rotatedFrameCorners } from "./geometry";

function shapeRect(id: string, over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...over,
  };
}

function line(id: string, over: Partial<LineObject> = {}): LineObject {
  return {
    id,
    type: "line",
    x1: 2,
    y1: 0.5,
    x2: 0.5,
    y2: 2,
    locked: false,
    stroke: { paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } }, width: 1 },
    ...over,
  };
}

describe("objectAabb", () => {
  it("returns the frame box unrotated", () => {
    expect(objectAabb(shapeRect("r"))).toEqual({ x: 1, y: 1, w: 2, h: 1 });
  });

  it("bounds the rotated corners about the center pivot", () => {
    // (1,1,2,1) rotated 90° about its center (2,1.5) → box (1.5,0.5,1,2).
    const box = objectAabb(shapeRect("r", { rotation: 90 }));
    expect(box.x).toBeCloseTo(1.5, 6);
    expect(box.y).toBeCloseTo(0.5, 6);
    expect(box.w).toBeCloseTo(1, 6);
    expect(box.h).toBeCloseTo(2, 6);
  });

  it("bounds a 45° square by its rotated diagonal extent", () => {
    // The square spins in place about its center (0.5,0.5).
    const box = objectAabb(shapeRect("r", { x: 0, y: 0, w: 1, h: 1, rotation: 45 }));
    const half = Math.SQRT1_2;
    expect(box.x).toBeCloseTo(0.5 - half, 6);
    expect(box.y).toBeCloseTo(0.5 - half, 6);
    expect(box.w).toBeCloseTo(2 * half, 6);
    expect(box.h).toBeCloseTo(2 * half, 6);
  });

  it("bounds a line by its endpoint extent", () => {
    expect(objectAabb(line("l"))).toEqual({ x: 0.5, y: 0.5, w: 1.5, h: 1.5 });
  });
});

describe("selectionAabb", () => {
  it("unions member bounds", () => {
    const union = selectionAabb([shapeRect("a", { x: 0, y: 0, w: 1, h: 1 }), line("l")]);
    expect(union).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it("is null for an empty selection", () => {
    expect(selectionAabb([])).toBeNull();
  });
});

describe("objectAabb over a callout", () => {
  const callout = (over: Partial<ShapeObject> = {}): ShapeObject =>
    shapeRect("c", { shape: "callout", x: 1, y: 1, w: 2, h: 1, ...over });

  it("takes in the tail, which is drawn outside the frame box", () => {
    // Default tip (0.06, 1.22) on a 2×1in frame at (1,1) lands at y 2.22,
    // below the frame's own bottom edge at y 2.
    const box = objectAabb(callout({ tailTip: tailTipFor("bottom-left") }));
    expect(box.y + box.h).toBeCloseTo(2.22, 9);
    // Nothing reaches past the frame the other way, so those edges stand.
    expect(box.x).toBeCloseTo(1, 9);
    expect(box.y).toBeCloseTo(1, 9);
  });

  it("stretches sideways for a tail pointing sideways", () => {
    const box = objectAabb(callout({ tailTip: { x: 1.5, y: 0.5 } }));
    expect(box.x + box.w).toBeCloseTo(4, 9); // 1 + 1.5 × 2in
    expect(box.y).toBeCloseTo(1, 9);
    expect(box.h).toBeCloseTo(1, 9);
  });

  it("turns the tail with the object, like every other corner", () => {
    const upright = objectAabb(callout({ tailTip: { x: 1.5, y: 0.5 } }));
    const turned = objectAabb(callout({ tailTip: { x: 1.5, y: 0.5 }, rotation: 90 }));
    // A quarter turn swaps which way the tail reaches, so the bounds swap too.
    expect(turned.h).toBeCloseTo(upright.w, 9);
    expect(turned.w).toBeCloseTo(upright.h, 9);
  });

  it("is the plain frame when the tip sits inside the body — no tail is drawn", () => {
    const box = objectAabb(callout({ tailTip: { x: 0.5, y: 0.6 } }));
    expect(box).toEqual({ x: 1, y: 1, w: 2, h: 1 });
  });

  it("leaves every other kind on its frame corners", () => {
    for (const shape of ["rect", "ellipse", "roundedRect", "starPolygon", "banner"] as const) {
      expect(objectAabb(shapeRect("s", { shape, x: 1, y: 1, w: 2, h: 1 }))).toEqual({
        x: 1,
        y: 1,
        w: 2,
        h: 1,
      });
    }
  });
});

describe("orientedSelectionBox", () => {
  it("is the plain union AABB at zero", () => {
    const objects = [shapeRect("a"), shapeRect("b", { x: 3, y: 0 })];
    expect(orientedSelectionBox(objects, 0)).toEqual(selectionAabb(objects));
  });

  it("keeps a body's own box through a turn of that body", () => {
    // Two 1×1 squares 3in apart: union (0,0,4,1), centre (2,0.5). Turn the
    // pair 90° about that centre — each square orbits to x 1.5, y −1.5 / 1.5 —
    // and measure at 90°: the bounds are the box they had BEFORE the turn,
    // which is exactly why a group's frame stops resetting.
    const square1 = { w: 1, h: 1 };
    const before = [
      shapeRect("a", { x: 0, y: 0, ...square1 }),
      shapeRect("b", { x: 3, y: 0, ...square1 }),
    ];
    const square = orientedSelectionBox(before, 0);
    expect(square).toEqual({ x: 0, y: 0, w: 4, h: 1 });
    const after = [
      shapeRect("a", { x: 1.5, y: -1.5, rotation: 90, ...square1 }),
      shapeRect("b", { x: 1.5, y: 1.5, rotation: 90, ...square1 }),
    ];
    const turned = orientedSelectionBox(after, 90);
    expect(turned?.w).toBeCloseTo(square?.w ?? NaN, 9);
    expect(turned?.h).toBeCloseTo(square?.h ?? NaN, 9);
    expect(turned?.x).toBeCloseTo(square?.x ?? NaN, 9);
    expect(turned?.y).toBeCloseTo(square?.y ?? NaN, 9);
  });

  it("contains every corner it measures, drawn at its own angle", () => {
    const objects = [shapeRect("a"), shapeRect("b", { x: 2, y: 1 })];
    const box = orientedSelectionBox(objects, 30);
    if (box === null) throw new Error("expected a box");
    // Un-turning the frame's corners and the objects' bounds into the same
    // space, the frame contains them.
    const corners = rotatedFrameCorners(box, 30).map((p) => rotatePoint(p, { x: 0, y: 0 }, -30));
    const bounds = boundsOfPoints(corners);
    for (const obj of objects) {
      const aabb = boundsOfPoints(
        rotatedFrameCorners({ x: obj.x, y: obj.y, w: obj.w, h: obj.h }, 0).map((p) =>
          rotatePoint(p, { x: 0, y: 0 }, -30),
        ),
      );
      expect(aabb.x).toBeGreaterThanOrEqual(bounds.x - 1e-9);
      expect(aabb.y).toBeGreaterThanOrEqual(bounds.y - 1e-9);
      expect(aabb.x + aabb.w).toBeLessThanOrEqual(bounds.x + bounds.w + 1e-9);
      expect(aabb.y + aabb.h).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-9);
    }
  });

  it("is null for an empty selection", () => {
    expect(orientedSelectionBox([], 30)).toBeNull();
  });
});

describe("selectionFrame", () => {
  it("hugs a lone object: its own box at its own rotation", () => {
    expect(selectionFrame([shapeRect("r", { rotation: 30 })])).toEqual({
      box: { x: 1, y: 1, w: 2, h: 1 },
      rotation: 30,
    });
  });

  it("falls back to the union AABB, unrotated, for several objects", () => {
    const frame = selectionFrame([
      shapeRect("a", { x: 0, y: 0, w: 1, h: 1 }),
      shapeRect("b", { rotation: 90 }),
    ]);
    // b's rotated corners bound (1.5,0.5,1,2), unioned with a's unit square.
    expect(frame?.rotation).toBe(0);
    expect(frame?.box.x).toBeCloseTo(0, 6);
    expect(frame?.box.y).toBeCloseTo(0, 6);
    expect(frame?.box.w).toBeCloseTo(2.5, 6);
    expect(frame?.box.h).toBeCloseTo(2.5, 6);
  });

  it("uses the endpoint AABB for a lone line, which carries no rotation", () => {
    expect(selectionFrame([line("l")])).toEqual({
      box: { x: 0.5, y: 0.5, w: 1.5, h: 1.5 },
      rotation: 0,
    });
  });

  it("is null for an empty selection", () => {
    expect(selectionFrame([])).toBeNull();
  });
});
