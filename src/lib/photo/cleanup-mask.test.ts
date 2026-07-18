import { describe, it, expect } from "vitest";
import {
  boundsSeeded,
  contentHashId,
  emptyBounds,
  extendBounds,
  fillRectFromBounds,
} from "./cleanup-mask";

describe("stroke bounds accumulation", () => {
  it("an empty accumulator is unseeded and yields no rect", () => {
    const b = emptyBounds();
    expect(boundsSeeded(b)).toBe(false);
    expect(fillRectFromBounds(b, 40, { w: 100, h: 100 })).toBeNull();
  });

  it("extends to the union of every accumulated point", () => {
    const b = emptyBounds();
    extendBounds(b, 30, 40);
    extendBounds(b, 10, 70);
    extendBounds(b, 55, 20);
    expect(b).toEqual({ minX: 10, minY: 20, maxX: 55, maxY: 70 });
    expect(boundsSeeded(b)).toBe(true);
  });
});

describe("fillRectFromBounds — pad, clamp, integerize (plan §10)", () => {
  it("pads a center point by brushSize/2 + margin and rounds to ints", () => {
    const b = emptyBounds();
    extendBounds(b, 200, 200); // single point
    // pad = 40/2 + 8 = 28 → [172, 228] on both axes.
    const rect = fillRectFromBounds(b, 40, { w: 1000, h: 1000 });
    expect(rect).toEqual({ x: 172, y: 172, w: 56, h: 56 });
  });

  it("clamps the padded rect inside the effective image", () => {
    const b = emptyBounds();
    extendBounds(b, 5, 5);
    extendBounds(b, 995, 995);
    // pad 28 would push past both edges; clamp to [0, 1000].
    const rect = fillRectFromBounds(b, 40, { w: 1000, h: 1000 });
    expect(rect).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
  });

  it("returns integer coordinates from fractional pointer bounds", () => {
    const b = emptyBounds();
    extendBounds(b, 100.4, 100.6);
    extendBounds(b, 150.9, 160.2);
    const rect = fillRectFromBounds(b, 40, { w: 4000, h: 3000 });
    expect(rect).not.toBeNull();
    for (const v of Object.values(rect!)) expect(Number.isInteger(v)).toBe(true);
    // x: floor(100.4 − 28)=72 → ceil(150.9 + 28)=179 ⇒ w 107.
    // y: floor(100.6 − 28)=72 → ceil(160.2 + 28)=189 ⇒ h 117.
    expect(rect).toEqual({ x: 72, y: 72, w: 107, h: 117 });
  });

  it("returns null when the clamp collapses an axis to < 1 px", () => {
    const b = emptyBounds();
    extendBounds(b, 0, 0); // hugs the top-left; a tiny image leaves no room
    expect(fillRectFromBounds(b, 40, { w: 0, h: 0 })).toBeNull();
  });
});

describe("contentHashId — deterministic, jail-safe (patch.id regex)", () => {
  const JAIL_SAFE = /^[a-z0-9-]{1,64}$/i;

  it("is a pure function of the bytes (same in → same out)", () => {
    const a = contentHashId(new Uint8Array([1, 2, 3, 4, 5]));
    const b = contentHashId(new Uint8Array([1, 2, 3, 4, 5]));
    expect(a).toBe(b);
  });

  it("changes when the bytes change", () => {
    const a = contentHashId(new Uint8Array([1, 2, 3]));
    const b = contentHashId(new Uint8Array([1, 2, 4]));
    expect(a).not.toBe(b);
  });

  it("matches the erase op's jail-safe id regex", () => {
    expect(contentHashId(new Uint8Array([0]))).toMatch(JAIL_SAFE);
    expect(contentHashId(new Uint8Array(2048).fill(200))).toMatch(JAIL_SAFE);
  });

  it("encodes the byte length as a collision guard", () => {
    expect(contentHashId(new Uint8Array([9, 9, 9]))).toMatch(/-3$/);
  });
});
