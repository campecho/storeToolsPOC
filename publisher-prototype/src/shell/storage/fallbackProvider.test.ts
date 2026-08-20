import { describe, expect, it } from "vitest";
import { downloadSafeName } from "./fallbackProvider";

describe("downloadSafeName", () => {
  it("keeps a plain name intact", () => {
    expect(downloadSafeName("Spring flyer.staples")).toBe("Spring flyer.staples");
  });

  it("trades characters the download attribute loses for dashes", () => {
    expect(downloadSafeName("Harborline Newsletter — schema v3 kitchen sink.staples")).toBe(
      "Harborline Newsletter - schema v3 kitchen sink.staples",
    );
  });

  it("keeps the extension after sanitizing", () => {
    expect(downloadSafeName("café")).toBe("caf-.staples");
  });

  it("falls back when nothing survives", () => {
    expect(downloadSafeName("——")).toBe("document.staples");
  });
});
