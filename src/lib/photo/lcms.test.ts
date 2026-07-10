import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cmykPreservePath, isCmykTiff, probeTificc, tificcAvailable } from "./lcms";

/**
 * The CMYK-preserving lcms seam (plan §1.3, §4 PE5, v1.4). `tificc` (lcms2-utils)
 * is ABSENT on this dev container by design, so the preserve path degrades
 * honestly; the `runIf(HAVE_TIFICC)` case exercises the live transform only where
 * the binary is installed (the Docker image / the CI live-import lane). The
 * probe, the honest-degradation branch, and the pure `isCmykTiff` header reader
 * run everywhere.
 */

const HAVE_TIFICC = await tificcAvailable();

async function cmykTiff(w = 32, h = 24): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#4169E1" } })
    .toColourspace("cmyk")
    .tiff()
    .toBuffer();
}

describe("probeTificc", () => {
  it("returns a typed, cached probe result (available boolean)", async () => {
    const a = await probeTificc();
    const b = await probeTificc();
    expect(typeof a.available).toBe("boolean");
    expect(a).toBe(b); // cached — same object
  });

  it("tificcAvailable mirrors the probe", async () => {
    expect(await tificcAvailable()).toBe((await probeTificc()).available);
  });
});

describe("cmykPreservePath", () => {
  it.skipIf(HAVE_TIFICC)(
    "degrades honestly to unsupported-here when tificc is absent (this dev container)",
    async () => {
      const out = await cmykPreservePath(await cmykTiff());
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toBe("unsupported-here");
    },
  );

  it.runIf(HAVE_TIFICC)(
    "round-trips a CMYK TIFF through the GRACoL identity transform, keeping 4 channels",
    async () => {
      const out = await cmykPreservePath(await cmykTiff(48, 36));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const meta = await sharp(out.tiff).metadata();
      expect(meta.space).toBe("cmyk");
      expect(meta.channels).toBe(4);
    },
    30_000,
  );
});

describe("isCmykTiff", () => {
  it("detects a CMYK (Separated) TIFF", async () => {
    expect(isCmykTiff(await cmykTiff())).toBe(true);
  });

  it("returns false for an RGB TIFF", async () => {
    const rgb = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#4169E1" } })
      .tiff()
      .toBuffer();
    expect(isCmykTiff(rgb)).toBe(false);
  });

  it("returns false for non-TIFF bytes (PNG, garbage, empty)", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000000" } })
      .png()
      .toBuffer();
    expect(isCmykTiff(png)).toBe(false);
    expect(isCmykTiff(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
    expect(isCmykTiff(Buffer.alloc(0))).toBe(false);
  });
});
