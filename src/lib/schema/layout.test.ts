import { describe, expect, it } from "vitest";
import { FrameObjectSchema, LineObjectSchema } from "./layout";

/**
 * Schema deltas for the merged prototype tool set: the parametric shape
 * kinds carry exactly their own parameters (SHAPE_PARAM_FIELDS superRefine),
 * and line decorations are additive — a pre-merge document parses unchanged.
 */

const frame = {
  id: "o1",
  x: 1,
  y: 1,
  w: 2,
  h: 1,
  rotation: 0,
  locked: false,
  fill: "#f2f2f2",
  stroke: { color: "#8f8f8f", width: 1 },
};

describe("FrameObjectSchema — parametric shape kinds", () => {
  it("accepts each kind carrying its own parameters", () => {
    expect(
      FrameObjectSchema.safeParse({ ...frame, type: "roundedRect", cornerRadius: 0.25 }).success,
    ).toBe(true);
    expect(
      FrameObjectSchema.safeParse({
        ...frame,
        type: "starPolygon",
        points: 5,
        innerRadiusRatio: 0.5,
      }).success,
    ).toBe(true);
    expect(
      FrameObjectSchema.safeParse({ ...frame, type: "callout", tailTip: { x: 0.06, y: 1.22 } })
        .success,
    ).toBe(true);
    expect(
      FrameObjectSchema.safeParse({
        ...frame,
        type: "banner",
        panelInset: 0.17,
        panelHeight: 0.65,
      }).success,
    ).toBe(true);
  });

  it("accepts a parametric kind with parameters absent — defaults live at the point of use", () => {
    for (const type of ["roundedRect", "starPolygon", "callout", "banner"] as const) {
      expect(FrameObjectSchema.safeParse({ ...frame, type }).success).toBe(true);
    }
  });

  it("rejects a parameter on a kind that doesn't own it", () => {
    expect(FrameObjectSchema.safeParse({ ...frame, type: "rect", cornerRadius: 0.2 }).success).toBe(
      false,
    );
    expect(
      FrameObjectSchema.safeParse({ ...frame, type: "roundedRect", points: 5 }).success,
    ).toBe(false);
    expect(
      FrameObjectSchema.safeParse({ ...frame, type: "banner", tailTip: { x: 1, y: 1 } }).success,
    ).toBe(false);
    expect(
      FrameObjectSchema.safeParse({ ...frame, type: "ellipse", panelInset: 0.2 }).success,
    ).toBe(false);
  });

  it("allows the callout tail tip outside the unit box — that is the point of it", () => {
    expect(
      FrameObjectSchema.safeParse({ ...frame, type: "callout", tailTip: { x: -0.5, y: 1.8 } })
        .success,
    ).toBe(true);
  });

  it("keeps parsing a pre-merge frame unchanged (additive delta)", () => {
    expect(FrameObjectSchema.safeParse({ ...frame, type: "rect" }).success).toBe(true);
  });
});

describe("LineObjectSchema — merged decorations are additive", () => {
  const line = {
    id: "l1",
    type: "line",
    x1: 0,
    y1: 0,
    x2: 2,
    y2: 1,
    stroke: { color: "#555555", width: 1.5 },
  };

  it("keeps parsing a bare pre-merge line", () => {
    expect(LineObjectSchema.safeParse(line).success).toBe(true);
  });

  it("accepts heads, size, and dash", () => {
    expect(
      LineObjectSchema.safeParse({
        ...line,
        headStart: "circle",
        headEnd: "arrow",
        headSize: "l",
        dash: "dashed",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown decoration values", () => {
    expect(LineObjectSchema.safeParse({ ...line, headEnd: "barb" }).success).toBe(false);
    expect(LineObjectSchema.safeParse({ ...line, dash: "wavy" }).success).toBe(false);
  });
});
