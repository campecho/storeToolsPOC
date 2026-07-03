import { describe, expect, it } from "vitest";
import { ASSET_DND_TYPE, assetKind } from "./import";

describe("assetKind (plan L9)", () => {
  it("classifies images by their MIME prefix", () => {
    expect(assetKind("image/png")).toBe("image");
    expect(assetKind("image/jpeg")).toBe("image");
    expect(assetKind("image/svg+xml")).toBe("image");
  });

  it("classifies PDFs, and rejects everything else", () => {
    expect(assetKind("application/pdf")).toBe("pdf");
    expect(assetKind("text/plain")).toBeNull();
    expect(assetKind("application/zip")).toBeNull();
    expect(assetKind("")).toBeNull();
  });

  it("exposes a stable drag-payload MIME", () => {
    expect(ASSET_DND_TYPE).toBe("application/x-stp-asset");
  });
});
