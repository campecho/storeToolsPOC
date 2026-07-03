import { describe, expect, it } from "vitest";
import {
  MIN_PLACED_LONG_SIDE_IN,
  createPlacedPicture,
  placedPictureRect,
} from "./placement";

const doc = { size: { w: 8.5, h: 11 }, margin: 0.5 };

describe("placedPictureRect (plan L8)", () => {
  it("maps source pixels to inches at 96 DPI and centers on the page", () => {
    const r = placedPictureRect(480, 240, doc); // 5 × 2.5 in
    expect(r.w).toBeCloseTo(5);
    expect(r.h).toBeCloseTo(2.5);
    expect(r.x).toBeCloseTo((8.5 - 5) / 2);
    expect(r.y).toBeCloseTo((11 - 2.5) / 2);
  });

  it("scales tiny sources up to the working minimum, preserving aspect", () => {
    const r = placedPictureRect(48, 24, doc); // 0.5 × 0.25 in natural
    expect(r.w).toBeCloseTo(2);
    expect(r.h).toBeCloseTo(1);
  });

  it("fits oversized sources inside the margin box, preserving aspect", () => {
    const r = placedPictureRect(9600, 4800, doc); // 100 × 50 in natural
    expect(r.w).toBeCloseTo(7.5); // 8.5 − 2 × 0.5
    expect(r.h).toBeCloseTo(3.75);
    expect(r.x).toBeCloseTo(0.5);
  });

  it("survives missing dimensions — lands a square at the minimum", () => {
    const r = placedPictureRect(undefined, undefined, doc);
    expect(r.w).toBeCloseTo(MIN_PLACED_LONG_SIDE_IN);
    expect(r.h).toBeCloseTo(MIN_PLACED_LONG_SIDE_IN);
  });
});

describe("createPlacedPicture", () => {
  it("binds the asset and drops the placeholder chrome — the image is the ink", () => {
    const asset = {
      id: "a1",
      name: "photo.png",
      kind: "image" as const,
      mime: "image/png",
      width: 96,
      height: 96,
      bytes: 1234,
    };
    const o = createPlacedPicture(asset, { x: 1, y: 2, w: 3, h: 4 });
    expect(o.type).toBe("picture");
    expect(o.assetId).toBe("a1");
    expect(o.fill).toBeNull();
    expect(o.stroke).toBeNull();
    expect([o.x, o.y, o.w, o.h]).toEqual([1, 2, 3, 4]);
  });
});
