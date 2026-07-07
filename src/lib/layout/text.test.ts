import { describe, it, expect } from "vitest";
import {
  applyToAllRuns,
  DEFAULT_FAMILY,
  FONT_FAMILIES,
  fontStack,
  isOverflowing,
  matchTextStyle,
  plainToParagraphs,
  ptToPx,
  textContent,
  textSummary,
  TEXT_STYLES,
} from "./text";
import { createTextFrame } from "./objects";

describe("font families (§7.6 posture)", () => {
  it("Motiva Sans leads and falls back to system faces", () => {
    expect(FONT_FAMILIES[0].name).toBe(DEFAULT_FAMILY);
    expect(fontStack("Motiva Sans")).toContain("system-ui");
  });

  it("unknown families fall to the default stack", () => {
    expect(fontStack("Comic Sans MS")).toBe(fontStack(DEFAULT_FAMILY));
  });

  it("every curated family resolves a stack", () => {
    for (const f of FONT_FAMILIES) {
      expect(fontStack(f.name)).toBe(f.stack);
    }
  });
});

describe("ptToPx", () => {
  it("converts print points to CSS px at zoom", () => {
    expect(ptToPx(72, 1)).toBe(96);
    expect(ptToPx(11, 1)).toBeCloseTo(14.6667, 3);
    expect(ptToPx(24, 0.5)).toBe(16);
  });
});

describe("isOverflowing", () => {
  it("flags content taller than the frame, with a subpixel cushion", () => {
    expect(isOverflowing(100, 100)).toBe(false);
    expect(isOverflowing(100.9, 100)).toBe(false);
    expect(isOverflowing(102, 100)).toBe(true);
  });
});

describe("style bundles", () => {
  it("a fresh text frame matches Body · Normal", () => {
    const frame = createTextFrame(0, 0, 3, 1);
    expect(matchTextStyle(frame.text!)).toBe("body");
  });

  it("applying the Heading bundle matches back as heading", () => {
    const frame = createTextFrame(0, 0, 3, 1);
    const styled = applyToAllRuns(frame.text!, TEXT_STYLES.heading.props);
    expect(matchTextStyle(styled)).toBe("heading");
  });

  it("off-bundle values match nothing (the picker face reads Custom)", () => {
    const frame = createTextFrame(0, 0, 3, 1);
    const custom = applyToAllRuns(frame.text!, { lineSpacing: 1.5 });
    expect(matchTextStyle(custom)).toBeUndefined();
  });

  it("bundles leave the family alone", () => {
    expect("family" in TEXT_STYLES.body.props).toBe(false);
    expect("family" in TEXT_STYLES.heading.props).toBe(false);
  });
});

describe("schema-v2 text helpers", () => {
  const run = (text: string, over: Partial<{ size: number; bold: boolean; color: string }> = {}) => ({
    text,
    font: { family: "Arial", size: over.size ?? 11, bold: over.bold ?? false, italic: false, underline: false },
    color: over.color ?? "#111111",
  });

  it("textContent joins runs and paragraphs (runs may hold soft breaks)", () => {
    const t = {
      paragraphs: [
        { align: "left" as const, lineSpacing: 1.2, runs: [run("Grand "), run("Opening", { bold: true })] },
        { align: "left" as const, lineSpacing: 1.2, runs: [run("Sat\n10am")] },
      ],
    };
    expect(textContent(t)).toBe("Grand Opening\nSat\n10am");
  });

  it("plainToParagraphs round-trips through textContent", () => {
    const style = { font: run("").font, color: "#111111" };
    const t = { paragraphs: plainToParagraphs("A\nB\n\nC", style) };
    expect(textContent(t)).toBe("A\nB\n\nC");
    expect(t.paragraphs).toHaveLength(4);
  });

  it("textSummary picks the dominant style by character weight", () => {
    const t = {
      paragraphs: [
        {
          align: "center" as const,
          lineSpacing: 1.19,
          runs: [run("x", { size: 24, bold: true }), run("long body of label text", { size: 10 })],
        },
      ],
    };
    const s = textSummary(t);
    expect(s.font.size).toBe(10);
    expect(s.align).toBe("center");
    expect(s.uniform).toBe(false);
  });

  it("applyToAllRuns patches every run but preserves per-run differences it doesn't touch", () => {
    const t = {
      paragraphs: [
        { align: "left" as const, lineSpacing: 1.2, runs: [run("a", { color: "#ffffff" }), run("b", { size: 24 })] },
      ],
    };
    const next = applyToAllRuns(t, { bold: true });
    expect(next.paragraphs[0].runs.every((r) => r.font.bold)).toBe(true);
    expect(next.paragraphs[0].runs[0].color).toBe("#ffffff");
    expect(next.paragraphs[0].runs[1].font.size).toBe(24);
  });
});
