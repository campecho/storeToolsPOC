import { describe, expect, it } from "vitest";
import { inPageNumberBand, PAGE_NUMBER_BAND, substitutePageTokens } from "./page-number";

/**
 * The shared page-number rule (page-number.ts) — pure and unit-pinned, because
 * BOTH the mapper and the fidelity harness lean on it producing byte-identical
 * output on either side of the comparison.
 */

describe("PAGE_NUMBER_BAND / inPageNumberBand", () => {
  it("is the top/bottom 15% band", () => {
    expect(PAGE_NUMBER_BAND).toBe(0.15);
  });

  it("puts the ecl footer (center 10.75in of 11) in the band", () => {
    expect(inPageNumberBand(10.75, 11)).toBe(true);
  });

  it("catches the top band too", () => {
    expect(inPageNumberBand(1.0, 11)).toBe(true); // 1.0 <= 0.15×11 = 1.65
  });

  it("leaves body copy out of the band", () => {
    expect(inPageNumberBand(6.25, 11)).toBe(false); // ecl body frame center
    expect(inPageNumberBand(4.48, 11)).toBe(false); // labels body frame center
    expect(inPageNumberBand(5.5, 11)).toBe(false);
  });

  it("is inclusive at the exact band edges", () => {
    expect(inPageNumberBand(1.65, 11)).toBe(true); // 0.15×11
    expect(inPageNumberBand(9.35, 11)).toBe(true); // 0.85×11
    expect(inPageNumberBand(1.66, 11)).toBe(false);
    expect(inPageNumberBand(9.34, 11)).toBe(false);
  });
});

describe("substitutePageTokens", () => {
  it("replaces a standalone '#' at the end of a string", () => {
    expect(substitutePageTokens("Page | #", 5)).toEqual({ text: "Page | 5", hits: 1 });
  });

  it("replaces a standalone '#' at the start of a string", () => {
    expect(substitutePageTokens("# of 12", 7)).toEqual({ text: "7 of 12", hits: 1 });
  });

  it("replaces a lone '#' that is the whole string", () => {
    expect(substitutePageTokens("#", 3)).toEqual({ text: "3", hits: 1 });
  });

  it("replaces a '#' surrounded by spaces mid-string", () => {
    expect(substitutePageTokens("Total # of Cuts", 9)).toEqual({ text: "Total 9 of Cuts", hits: 1 });
  });

  it("treats a tab as a delimiter", () => {
    expect(substitutePageTokens("Page\t#", 4)).toEqual({ text: "Page\t4", hits: 1 });
    expect(substitutePageTokens("#\tof", 4)).toEqual({ text: "4\tof", hits: 1 });
  });

  it("replaces multiple standalone tokens, single-space separated", () => {
    expect(substitutePageTokens("# and #", 2)).toEqual({ text: "2 and 2", hits: 2 });
    expect(substitutePageTokens("# #", 6)).toEqual({ text: "6 6", hits: 2 });
  });

  it("leaves a '#' glued to following glyphs untouched", () => {
    expect(substitutePageTokens("#1 Store", 5)).toEqual({ text: "#1 Store", hits: 0 });
    expect(substitutePageTokens("Page #2", 5)).toEqual({ text: "Page #2", hits: 0 });
  });

  it("leaves a '#' glued to preceding glyphs untouched", () => {
    expect(substitutePageTokens("C#", 5)).toEqual({ text: "C#", hits: 0 });
    expect(substitutePageTokens("##", 5)).toEqual({ text: "##", hits: 0 });
    // labels' "…7mil: #3-#4…" after same-style spans merge — glued on both sides
    expect(substitutePageTokens("7mil: #3-#4", 5)).toEqual({ text: "7mil: #3-#4", hits: 0 });
  });

  it("is a no-op (hits 0) when there is no '#' at all", () => {
    expect(substitutePageTokens("Confidential", 5)).toEqual({ text: "Confidential", hits: 0 });
    expect(substitutePageTokens("", 5)).toEqual({ text: "", hits: 0 });
  });

  it("keeps the delimiter on the side it consumed (leading whitespace preserved)", () => {
    expect(substitutePageTokens("V. May-12   Page | #", 37)).toEqual({
      text: "V. May-12   Page | 37",
      hits: 1,
    });
  });
});
