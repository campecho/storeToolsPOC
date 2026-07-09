import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { intakeImage, probeEngine } from "./render-host";

/**
 * Live proof for the render-host jail seam (plan §3.6, §4 PE1). Unlike the
 * `.pub` import lane, there is NO fixture mode here — `sharp` ships with
 * `npm install`, so the core decode path is ALWAYS live: every case below
 * spawns the real photo-worker.mjs in a real scratch jail and asserts the
 * typed outcome. Fixtures are synthesized in-process with sharp (a small,
 * valid image is cheaper and more honest than a committed binary).
 *
 * The timeout/SIGXCPU classification is inherited verbatim from the proven
 * pub2raw seam (same execFile+prlimit+SIGKILL discipline) and is exercised
 * there; here we prove the photo-specific outcomes (success shape, decode
 * death, pixel-flood, jail cleanup).
 */

async function rgbPng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#3366aa" } }).png().toBuffer();
}

describe("probeEngine", () => {
  it("returns the sharp/libvips versions from a live probe job", async () => {
    const engine = await probeEngine();
    expect(engine).not.toBeNull();
    expect(engine?.name).toBe("sharp");
    expect(engine?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(engine?.libvips).toMatch(/^\d+\.\d+/);
  });

  it("caches the probe (a second call is the same object)", async () => {
    expect(await probeEngine()).toBe(await probeEngine());
  });
});

describe("intakeImage — success shape", () => {
  it(
    "decodes a valid RGB PNG to a JPEG master + JPEG proxy with the metadata note",
    async () => {
      const out = await intakeImage(await rgbPng(1200, 800), "image/png");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.colorSpace).toBe("rgb");
      // Opaque RGB → JPEG master (v1.4 spike codec choice).
      expect(out.master.mime).toBe("image/jpeg");
      expect(out.master.width).toBe(1200);
      expect(out.master.height).toBe(800);
      expect(out.master.bytes.length).toBeGreaterThan(0);
      expect(out.proxy.mime).toBe("image/jpeg");
      // 1200 px is under the 2048 proxy ceiling — not upscaled.
      expect(Math.max(out.proxy.width, out.proxy.height)).toBeLessThanOrEqual(2048);
      expect(out.notes).toContain("Metadata removed when the file was opened");
    },
    15_000,
  );

  it(
    "keeps alpha as a PNG master + PNG proxy",
    async () => {
      const apng = await sharp({
        create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
      })
        .png()
        .toBuffer();
      const out = await intakeImage(apng, "image/png");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.master.mime).toBe("image/png");
      expect(out.proxy.mime).toBe("image/png");
    },
    15_000,
  );

  it(
    "downscales the proxy to the 2048 long-edge ceiling",
    async () => {
      const out = await intakeImage(await rgbPng(4000, 2000), "image/png");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.master.width).toBe(4000); // master keeps full res
      expect(Math.max(out.proxy.width, out.proxy.height)).toBe(2048);
    },
    15_000,
  );

  it(
    "reports CMYK source space and notes the screen-RGB unpack",
    async () => {
      const cmyk = await sharp({ create: { width: 200, height: 150, channels: 3, background: "#884422" } })
        .toColourspace("cmyk")
        .tiff()
        .toBuffer();
      const out = await intakeImage(cmyk, "image/tiff");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.colorSpace).toBe("cmyk");
      expect(out.notes).toContain("Opened as screen RGB — CMYK-preserving master lands with the print tranche");
    },
    15_000,
  );

  it(
    "rasterizes an SVG to a PNG master with the rasterized note",
    async () => {
      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128"><rect width="256" height="128" fill="#0a0"/></svg>`,
      );
      const out = await intakeImage(svg, "image/svg+xml");
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.master.mime).toBe("image/png");
      expect(out.notes).toContain("Vector artwork rasterized to a bitmap when it was opened");
    },
    15_000,
  );
});

describe("intakeImage — decode death is a typed failure, never a throw", () => {
  it(
    "classifies a truncated JPEG (valid SOI then garbage) as decode-failed",
    async () => {
      const trunc = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xde, 0xad, 0xbe, 0xef]);
      const out = await intakeImage(trunc, "image/jpeg");
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toBe("decode-failed");
    },
    15_000,
  );
});

describe("intakeImage — jail cleanup", () => {
  it(
    "leaves no scratch jail behind after a job (success path)",
    async () => {
      const base = await mkdtemp(join(tmpdir(), "rh-cleanup-"));
      const saved = process.env.TMPDIR;
      process.env.TMPDIR = base; // os.tmpdir() re-reads env per call
      try {
        const out = await intakeImage(await rgbPng(64, 64), "image/png");
        expect(out.ok).toBe(true);
        // The jail (photo-host-*) was created under our TMPDIR and wiped in finally.
        const leftovers = (await readdir(base)).filter((n) => n.startsWith("photo-host-"));
        expect(leftovers).toEqual([]);
      } finally {
        if (saved === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = saved;
        await rm(base, { recursive: true, force: true });
      }
    },
    15_000,
  );
});

// The pixel-flood → too-many-pixels classification needs a lowered limit; the
// caps load from env AT MODULE IMPORT, so shrink STP_MAX_PHOTO_PIXELS and
// re-import render-host fresh (the pub2raw.test cache-defeat pattern). A small
// but VALID image then exceeds the limit — libvips reads its header dims and
// refuses at load, before any allocation.
describe("intakeImage — pixel-flood", () => {
  const saved = process.env.STP_MAX_PHOTO_PIXELS;
  beforeEach(() => {
    process.env.STP_MAX_PHOTO_PIXELS = "1000"; // 1000-pixel ceiling
    vi.resetModules();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.STP_MAX_PHOTO_PIXELS;
    else process.env.STP_MAX_PHOTO_PIXELS = saved;
    vi.resetModules();
  });

  it(
    "classifies a valid image over the (shrunk) pixel ceiling as too-many-pixels",
    async () => {
      const { intakeImage: freshIntake } = await import("./render-host");
      const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#123456" } })
        .png()
        .toBuffer();
      const out = await freshIntake(img, "image/png"); // 40 000 px ≫ 1000
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toBe("too-many-pixels");
    },
    15_000,
  );
});
