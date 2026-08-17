import { describe, expect, it } from "vitest";
import { pathToSvg } from "./path";

/**
 * Path denormalization: normalized 0–1 segments map into the frame box in
 * inches, emitting the absolute M/L/C/Z vocabulary the schema defines.
 */

describe("pathToSvg", () => {
  const box = { x: 1, y: 2, w: 2, h: 4 };

  it("denormalizes M/L/Z segments to the frame box", () => {
    const d = pathToSvg(
      [
        { c: "M", x: 0, y: 0 },
        { c: "L", x: 1, y: 0.5 },
        { c: "Z" },
      ],
      box,
    );
    expect(d).toBe("M 1 2 L 3 4 Z");
  });

  it("denormalizes all three coordinate pairs of a C segment", () => {
    const d = pathToSvg([{ c: "C", x1: 0, y1: 0, x2: 0.5, y2: 0.5, x: 1, y: 1 }], box);
    expect(d).toBe("C 1 2 2 4 3 6");
  });

  it("trims float noise to sub-thousandth-inch precision", () => {
    const d = pathToSvg([{ c: "M", x: 0.1 + 0.2, y: 0 }], { x: 0, y: 0, w: 1, h: 1 });
    expect(d).toBe("M 0.3 0");
  });
});
