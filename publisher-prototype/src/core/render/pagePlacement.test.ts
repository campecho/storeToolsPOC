import { describe, expect, it } from "vitest";
import { createEmptyDocument, type LineObject, type ShapeObject, type TextFrame } from "../model";
import {
  GHOST_OPACITY_MAX,
  GHOST_OPACITY_MIN,
  PASTEBOARD_GHOST_OPACITY,
  clampGhostOpacity,
  classifyPlacement,
  inkBounds,
  inkPadIn,
  objectPlacement,
  pageRegion,
} from "./pagePlacement";
import { headLengthIn } from "./lineDecor";
import type { Rect } from "../hittest";

/**
 * Invariant under test: `inkBounds` must contain every pixel an object can
 * draw, so classification is only ever conservative — a true `on`/`off`
 * object may be called `straddling`, never the reverse, and closed-interval
 * touches at the page edge read as `on` ink, not `off`.
 */

const PAGE: Rect = { x: 0, y: 0, w: 8.5, h: 11 };

const blackStroke = (width: number) => ({
  paint: { kind: "color" as const, color: { space: "rgb" as const, values: [0, 0, 0] as [number, number, number] } },
  width,
});

function shapeRect(over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id: "s",
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

function line(over: Partial<LineObject> = {}): LineObject {
  return {
    id: "l",
    type: "line",
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    locked: false,
    stroke: blackStroke(1),
    ...over,
  };
}

function textFrame(over: Partial<TextFrame> = {}): TextFrame {
  return {
    id: "t",
    type: "textFrame",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    text: {
      paragraphs: [
        {
          align: "left",
          lineSpacing: 1.2,
          runs: [
            {
              text: "",
              font: { family: "Arial", size: 12, bold: false, italic: false, underline: false },
              color: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } },
            },
          ],
        },
      ],
    },
    ...over,
  };
}

describe("pageRegion", () => {
  it("is one 8.5×11 rect at the origin for the empty document's size", () => {
    expect(pageRegion(createEmptyDocument().size)).toEqual([{ x: 0, y: 0, w: 8.5, h: 11 }]);
  });

  it("is one rect of the given size at the origin for a non-default size", () => {
    expect(pageRegion({ w: 11, h: 17 })).toEqual([{ x: 0, y: 0, w: 11, h: 17 }]);
  });
});

describe("classifyPlacement", () => {
  const region = [PAGE];

  it("classifies bounds strictly inside the page as on", () => {
    expect(classifyPlacement({ x: 1, y: 1, w: 2, h: 2 }, region)).toBe("on");
  });

  it("classifies bounds touching an edge from inside (x = 0) as on — closed interval", () => {
    expect(classifyPlacement({ x: 0, y: 1, w: 2, h: 2 }, region)).toBe("on");
  });

  it("classifies bounds crossing the left edge as straddling", () => {
    expect(classifyPlacement({ x: -1, y: 1, w: 2, h: 1 }, region)).toBe("straddling");
  });

  it("classifies bounds crossing the right edge as straddling", () => {
    expect(classifyPlacement({ x: 7.5, y: 1, w: 2, h: 1 }, region)).toBe("straddling");
  });

  it("classifies bounds crossing the top edge as straddling", () => {
    expect(classifyPlacement({ x: 1, y: -1, w: 1, h: 2 }, region)).toBe("straddling");
  });

  it("classifies bounds crossing the bottom edge as straddling", () => {
    expect(classifyPlacement({ x: 1, y: 10, w: 1, h: 2 }, region)).toBe("straddling");
  });

  it("classifies bounds larger than the page, containing it, as straddling", () => {
    expect(classifyPlacement({ x: -1, y: -1, w: 10.5, h: 13 }, region)).toBe("straddling");
  });

  it("classifies bounds disjoint on the left as off", () => {
    expect(classifyPlacement({ x: -2, y: 1, w: 1, h: 1 }, region)).toBe("off");
  });

  it("classifies bounds disjoint on the right as off", () => {
    expect(classifyPlacement({ x: 9, y: 1, w: 1, h: 1 }, region)).toBe("off");
  });

  it("classifies bounds disjoint on the top as off", () => {
    expect(classifyPlacement({ x: 1, y: -2, w: 1, h: 1 }, region)).toBe("off");
  });

  it("classifies bounds disjoint on the bottom as off", () => {
    expect(classifyPlacement({ x: 1, y: 12, w: 1, h: 1 }, region)).toBe("off");
  });

  it("classifies bounds touching an edge from outside (x + w = 0) as straddling — ink at the edge is on the page", () => {
    expect(classifyPlacement({ x: -1, y: 1, w: 1, h: 1 }, region)).toBe("straddling");
  });

  it("classifies bounds inside the second rect of a two-rect region as on", () => {
    const twoUp = [PAGE, { x: 8.5, y: 0, w: 8.5, h: 11 }];
    expect(classifyPlacement({ x: 10, y: 1, w: 1, h: 1 }, twoUp)).toBe("on");
  });

  it("classifies bounds spanning both rects of a two-rect region as straddling — documented conservatism", () => {
    const twoUp = [PAGE, { x: 8.5, y: 0, w: 8.5, h: 11 }];
    expect(classifyPlacement({ x: 8, y: 1, w: 1, h: 1 }, twoUp)).toBe("straddling");
  });

  it("classifies everything as off against an empty region", () => {
    expect(classifyPlacement({ x: 1, y: 1, w: 1, h: 1 }, [])).toBe("off");
  });
});

describe("inkPadIn", () => {
  it("is 0 for an unstroked shape", () => {
    expect(inkPadIn(shapeRect({ stroke: null }))).toBe(0);
  });

  it("is 10/72 for a shape with a 1pt stroke", () => {
    expect(inkPadIn(shapeRect({ stroke: blackStroke(1) }))).toBe(10 / 72);
  });

  it("is 20/72 plus the medium head length for a line with a 2pt stroke and headSize m", () => {
    expect(inkPadIn(line({ stroke: blackStroke(2), headSize: "m" }))).toBe(
      20 / 72 + headLengthIn("m", 2),
    );
  });

  it("pads for a head length even when no head fields are set — cheap and safe", () => {
    expect(inkPadIn(line({ stroke: blackStroke(2) }))).toBe(20 / 72 + headLengthIn(undefined, 2));
  });

  it("is 1/(96×0.1) for a textFrame placeholder — the hairline at minimum zoom", () => {
    expect(inkPadIn(textFrame())).toBe(1 / (96 * 0.1));
  });
});

describe("inkBounds", () => {
  it("reads objectAabb: a 1×1 unstroked rect at the origin rotated 45° bounds ≈ √2 wide, centred on (0.5, 0.5)", () => {
    const bounds = inkBounds(shapeRect({ x: 0, y: 0, w: 1, h: 1, rotation: 45, stroke: null }));
    const half = Math.SQRT1_2;
    expect(bounds.w).toBeCloseTo(2 * half, 10);
    expect(bounds.h).toBeCloseTo(2 * half, 10);
    expect(bounds.x).toBeCloseTo(0.5 - half, 10);
    expect(bounds.y).toBeCloseTo(0.5 - half, 10);
  });

  it("carries the callout's tail overshoot along via objectAabb", () => {
    const bounds = inkBounds(
      shapeRect({
        shape: "callout",
        x: 2,
        y: 2,
        w: 1,
        h: 1,
        stroke: null,
        tailTip: { x: -0.3, y: 0.5 },
      }),
    );
    // The tail extends 0.3 × w left of the frame; unstroked, so no extra pad.
    expect(bounds.x).toBeCloseTo(1.7, 10);
  });
});

describe("objectPlacement", () => {
  const region = [PAGE];

  it("classifies an unstroked rect flush with the left edge (x = 0) as on", () => {
    expect(objectPlacement(shapeRect({ x: 0, y: 1, w: 1, h: 1, stroke: null }), region)).toBe(
      "on",
    );
  });

  it("classifies the same rect with a 1pt stroke as straddling — ink crosses the edge", () => {
    expect(
      objectPlacement(shapeRect({ x: 0, y: 1, w: 1, h: 1, stroke: blackStroke(1) }), region),
    ).toBe("straddling");
  });

  it("classifies an unstroked rect at x = -2, w = 1 as off", () => {
    expect(objectPlacement(shapeRect({ x: -2, y: 1, w: 1, h: 1, stroke: null }), region)).toBe(
      "off",
    );
  });

  it("classifies an unstroked rect at x = -0.5, w = 1 as straddling", () => {
    expect(objectPlacement(shapeRect({ x: -0.5, y: 1, w: 1, h: 1, stroke: null }), region)).toBe(
      "straddling",
    );
  });

  it("classifies a 1×1 unrotated square well inside the page as on", () => {
    expect(
      objectPlacement(shapeRect({ x: 0.2, y: 0.2, w: 1, h: 1, stroke: null }), region),
    ).toBe("on");
  });

  it("classifies the same square rotated 45° at the page corner as straddling — a corner pokes past the edge", () => {
    expect(
      objectPlacement(
        shapeRect({ x: 0.2, y: 0.2, w: 1, h: 1, rotation: 45, stroke: null }),
        region,
      ),
    ).toBe("straddling");
  });

  it("classifies a line from (-1, 1) to (1, 1) as straddling", () => {
    expect(
      objectPlacement(line({ x1: -1, y1: 1, x2: 1, y2: 1, stroke: blackStroke(1) }), region),
    ).toBe("straddling");
  });

  it("classifies a line from (-3, 1) to (-2, 1) as off", () => {
    expect(
      objectPlacement(line({ x1: -3, y1: 1, x2: -2, y2: 1, stroke: blackStroke(1) }), region),
    ).toBe("off");
  });
});

describe("clampGhostOpacity", () => {
  it("passes a value already in range through untouched", () => {
    expect(clampGhostOpacity(0.25)).toBe(0.25);
    expect(clampGhostOpacity(PASTEBOARD_GHOST_OPACITY)).toBe(PASTEBOARD_GHOST_OPACITY);
  });

  it("keeps both ends of the range — hidden and undimmed are both answers", () => {
    expect(clampGhostOpacity(GHOST_OPACITY_MIN)).toBe(GHOST_OPACITY_MIN);
    expect(clampGhostOpacity(GHOST_OPACITY_MAX)).toBe(GHOST_OPACITY_MAX);
  });

  it("clamps past either end", () => {
    expect(clampGhostOpacity(-0.4)).toBe(GHOST_OPACITY_MIN);
    expect(clampGhostOpacity(7)).toBe(GHOST_OPACITY_MAX);
  });

  it("falls back to the default on a non-finite read, not to an end of the range", () => {
    expect(clampGhostOpacity(Number.NaN)).toBe(PASTEBOARD_GHOST_OPACITY);
    expect(clampGhostOpacity(Number.POSITIVE_INFINITY)).toBe(PASTEBOARD_GHOST_OPACITY);
    expect(clampGhostOpacity(Number.NEGATIVE_INFINITY)).toBe(PASTEBOARD_GHOST_OPACITY);
  });
});
