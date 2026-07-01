import { describe, it, expect } from "vitest";
import { similarItems, tokens } from "./similar";
import { seedItems } from "@/data";

describe("tokens", () => {
  it("lowercases, splits on non-alphanumerics, drops short words and stop words", () => {
    expect(tokens("The app CRASHES on big-file resize!")).toEqual(["app", "crashes", "big", "file", "resize"]);
  });

  it("returns nothing for empty input", () => {
    expect(tokens("")).toEqual([]);
  });
});

describe("similarItems", () => {
  it("shows nothing under 3 meaningful characters", () => {
    expect(similarItems(seedItems, "")).toEqual([]);
    expect(similarItems(seedItems, "re")).toEqual([]);
    expect(similarItems(seedItems, "  a ")).toEqual([]);
  });

  it("shows nothing for gibberish", () => {
    expect(similarItems(seedItems, "zzzqq xkcd")).toEqual([]);
  });

  it("matches on token overlap with title + area", () => {
    const result = similarItems(seedItems, "resize freezes");
    expect(result.map((i) => i.id)).toContain(2); // "Large-format resize crashes…"
  });

  it("ranks by overlap first, then votes", () => {
    // "resize crash" overlaps item 2 twice (resize, crash⊂crashes) — it must lead.
    const result = similarItems(seedItems, "resize crash");
    expect(result[0].id).toBe(2);
  });

  it("excludes delivered (done) items — you can't back what already shipped", () => {
    // Item 9 ("Background doesn't extend to the bleed…", done) is the strongest
    // textual match but must not surface.
    const result = similarItems(seedItems, "bleed on imported pdfs");
    expect(result.map((i) => i.id)).not.toContain(9);
    expect(result.map((i) => i.id)).not.toContain(10);
  });

  it("caps at 3 candidates", () => {
    const result = similarItems(seedItems, "the app crashes on import and resize of files");
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
