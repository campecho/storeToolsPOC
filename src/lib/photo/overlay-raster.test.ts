import { describe, it, expect } from "vitest";
import { foldOverlays, overlayPlacement, hideOverlayOp, type OverlayOp } from "./overlay-raster";
import type { PhotoOp } from "@/lib/schema/photo";

/* The raster functions (rasterizeOverlay / paintOverlayContent) are browser-only
   — node-canvas is absent, so only the PURE fold + AABB math is exercised here. */

function text(
  id: string,
  opts: {
    label?: string;
    hidden?: boolean;
    box?: { x: number; y: number; w: number; h: number };
    rotation?: number;
    textValue?: string;
  } = {},
): PhotoOp {
  const base = {
    op: "textOverlay" as const,
    label: opts.label ?? `text ${id}`,
    id,
    text: opts.textValue ?? "Hi",
    font: { family: "Motiva Sans", size: 24, bold: false, italic: false },
    color: "#1a1a1a",
    align: "left" as const,
    box: opts.box ?? { x: 0, y: 0, w: 100, h: 40 },
    rotation: opts.rotation ?? 0,
  };
  return (opts.hidden ? { ...base, hidden: true } : base) as PhotoOp;
}

function logo(
  id: string,
  opts: { label?: string; hidden?: boolean; box?: { x: number; y: number; w: number; h: number } } = {},
): PhotoOp {
  const base = {
    op: "logoOverlay" as const,
    label: opts.label ?? `logo ${id}`,
    id,
    assetId: `photo:${id}:overlay`,
    box: opts.box ?? { x: 10, y: 10, w: 80, h: 60 },
    rotation: 0,
  };
  return (opts.hidden ? { ...base, hidden: true } : base) as PhotoOp;
}

const adjust: PhotoOp = { op: "adjust", label: "Brightness", param: "brightness", value: 5 };

describe("foldOverlays — last-wins per id, z = first appearance, hidden tombstone", () => {
  it("returns an empty list when there are no overlay ops", () => {
    expect(foldOverlays([adjust])).toEqual([]);
  });

  it("ignores non-overlay ops", () => {
    const folded = foldOverlays([adjust, text("a"), adjust]);
    expect(folded).toHaveLength(1);
    expect(folded[0].id).toBe("a");
  });

  it("keeps the LAST op per id (a whole-op upsert wins)", () => {
    const folded = foldOverlays([
      text("a", { textValue: "first" }),
      text("a", { textValue: "second", label: "Edit text" }),
    ]);
    expect(folded).toHaveLength(1);
    expect((folded[0] as Extract<OverlayOp, { op: "textOverlay" }>).text).toBe("second");
  });

  it("orders by FIRST appearance of each id, not by the latest op", () => {
    // Add A, add B, then edit A — A must still render before B (z order stable).
    const folded = foldOverlays([text("a"), logo("b"), text("a", { label: "Edit text" })]);
    expect(folded.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("drops an id whose latest op is hidden (the remove tombstone)", () => {
    const folded = foldOverlays([text("a"), logo("b"), text("a", { hidden: true, label: "Remove text" })]);
    expect(folded.map((o) => o.id)).toEqual(["b"]);
  });

  it("a hidden-then-visible id re-appears (last op wins in both directions)", () => {
    const folded = foldOverlays([
      text("a"),
      text("a", { hidden: true }),
      text("a", { textValue: "back" }),
    ]);
    expect(folded).toHaveLength(1);
    expect((folded[0] as Extract<OverlayOp, { op: "textOverlay" }>).text).toBe("back");
  });
});

describe("hideOverlayOp — builds the same-id tombstone", () => {
  it("carries the id + hidden:true + a fresh label, and folds away", () => {
    const op = text("a") as Extract<OverlayOp, { op: "textOverlay" }>;
    const removed = hideOverlayOp(op, "Remove text");
    expect(removed.op).toBe("textOverlay");
    expect((removed as { id: string }).id).toBe("a");
    expect((removed as { hidden?: boolean }).hidden).toBe(true);
    expect(removed.label).toBe("Remove text");
    expect(foldOverlays([op, removed])).toEqual([]);
  });
});

describe("overlayPlacement — AABB of the rotated box", () => {
  it("is the box itself at rotation 0", () => {
    const op = text("a", { box: { x: 12, y: 34, w: 100, h: 40 }, rotation: 0 }) as OverlayOp;
    expect(overlayPlacement(op)).toEqual({ left: 12, top: 34, width: 100, height: 40 });
  });

  it("swaps width/height at 90° and keeps the center", () => {
    const op = text("a", { box: { x: 0, y: 0, w: 100, h: 40 }, rotation: 90 }) as OverlayOp;
    const p = overlayPlacement(op);
    expect(p.width).toBe(40);
    expect(p.height).toBe(100);
    // center preserved: box center (50,20); AABB center = left+w/2, top+h/2
    expect(p.left + p.width / 2).toBeCloseTo(50, 6);
    expect(p.top + p.height / 2).toBeCloseTo(20, 6);
  });

  it("grows to the diagonal envelope at 45°", () => {
    const op = text("a", { box: { x: 0, y: 0, w: 100, h: 40 }, rotation: 45 }) as OverlayOp;
    const p = overlayPlacement(op);
    const expected = Math.round((100 + 40) * Math.SQRT1_2); // (w+h)·cos45
    expect(p.width).toBe(expected);
    expect(p.height).toBe(expected);
  });

  it("is unchanged by rotation sign (uses |cos|,|sin|)", () => {
    const box = { x: 5, y: 5, w: 80, h: 30 };
    const a = overlayPlacement(text("a", { box, rotation: 30 }) as OverlayOp);
    const b = overlayPlacement(text("a", { box, rotation: -30 }) as OverlayOp);
    expect(a).toEqual(b);
  });
});
