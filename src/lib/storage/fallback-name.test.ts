import { describe, expect, it } from "vitest";
import { downloadSafeName } from "./fallback-provider";

describe("downloadSafeName", () => {
  it("keeps a plain name intact", () => {
    expect(downloadSafeName("Spring flyer.staples")).toBe("Spring flyer.staples");
  });

  it("trades characters the download attribute loses for dashes", () => {
    expect(downloadSafeName("Fall — menu.staples")).toBe("Fall - menu.staples");
  });

  it("keeps the extension after sanitizing, and falls back when nothing survives", () => {
    expect(downloadSafeName("café")).toBe("caf-.staples");
    expect(downloadSafeName("——")).toBe("document.staples");
  });
});
