import { describe, it, expect } from "vitest";
import { creditLine } from "./releases";
import { seedReleases } from "@/data";

describe("creditLine", () => {
  it("credits the store's own backing in red: 'Your store + N asked'", () => {
    // v1.4 fix "Bleed now fills on imported PDFs": 8 stores, yours
    const fix = seedReleases[0].fixes[0];
    expect(creditLine(fix)).toEqual({ text: "Your store + 7 asked", color: "#CC0000" });
  });

  it("credits other stores in gray: 'N stores asked'", () => {
    // v1.4 feature "One-click proof PDF": 10 stores, not yours
    const feature = seedReleases[0].features[0];
    expect(creditLine(feature)).toEqual({ text: "10 stores asked", color: "#999" });
  });

  it("renders no credit when no stores are recorded", () => {
    // v1.0 "Unified file intake and product picker": stores 0
    const launch = seedReleases[4].features[0];
    expect(creditLine(launch).text).toBe("");
  });
});
