import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErasePayload } from "@/lib/schema/photo";
import { eraseFill, intakeImage, probeEngine } from "./render-host";

/**
 * Live proof for the render-host jail seam (plan §3.6, §4 PE1). Unlike the
 * `.pub` import lane, there is NO fixture mode here — `sharp` ships with
 * `npm install`, so the core decode path is ALWAYS live: every case below
 * spawns the real photo-worker.mjs in a real scratch jail and asserts the
 * typed outcome. Fixtures are synthesized in-process with sharp (a small,
 * valid image is cheaper and more honest than a committed binary).
 *
 * The timeout/SIGXCPU classification shares the execFile+prlimit+SIGKILL
 * discipline proven in the pub2raw seam; it is exercised HERE against the real
 * photo worker in photo-adversarial.test.ts (PE10b — wall-clock kill, the
 * prlimit invocation, SIGXCPU → resource-limit, and jail cleanup on the kill
 * paths). This file proves the photo-specific typed outcomes (success shape,
 * decode death, pixel-flood, success-path cleanup).
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

/* ------------------------------------------------------------------ */
/* eraseFill — the classical fill at preview time (PE9)                */
/* ------------------------------------------------------------------ */

/**
 * A 200×150 synthetic photo: a low-red horizontal gradient background with a
 * distinct RED marker block at [80,60)–[120,100). The gradient makes the
 * unmasked byte-match assertion meaningful (varying pixels, not a flat fill), and
 * the red marker (absent from the gradient) makes "the fill removed the marker" a
 * clean colour test.
 */
function markerImage(): Promise<Buffer> {
  const w = 200;
  const h = 150;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = 20; // R — low everywhere (the marker is the only red)
      raw[i + 1] = 80; // G
      raw[i + 2] = 100 + Math.floor((x / w) * 100); // B ramps across x
    }
  }
  for (let y = 60; y < 100; y++) {
    for (let x = 80; x < 120; x++) {
      const i = (y * w + x) * 3;
      raw[i] = 230;
      raw[i + 1] = 20;
      raw[i + 2] = 20;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** A grayscale-on-black mask PNG: white (255) over `box`, black (0) elsewhere —
    the ErasePayloadSchema mask contract (luminance is the fill factor). */
function maskPng(
  w: number,
  h: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): Promise<Buffer> {
  const raw = Buffer.alloc(w * h, 0);
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) raw[y * w + x] = 255;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

/** Decode a buffer to raw RGBA (alpha ensured) + its dims. */
async function rawRGBA(buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// The marker sits at [80,60)–[120,100); a padded rect [70,50)+60×60 encloses it
// with a ring of gradient background. In window coords that ring is everything
// OUTSIDE [10,50)×[10,50).
const RECT = { x: 70, y: 50, w: 60, h: 60 };
const MASK_BOX = { x0: 80, y0: 60, x1: 120, y1: 100 };
const basePayload = (recipe: ErasePayload["recipe"] = []): ErasePayload => ({
  recipe,
  mask: { width: 200, height: 150, rect: RECT },
});

describe("eraseFill — the classical fill (PE9)", () => {
  it(
    "removes the masked marker colour from the patch (no marker red survives the fill)",
    async () => {
      const out = await eraseFill(await markerImage(), basePayload(), await maskPng(200, 150, MASK_BOX));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect([out.width, out.height]).toEqual([60, 60]);
      const patch = await rawRGBA(out.bytes);
      // The marker ink was (230,20,20); the surround is a low-red gradient. After
      // the diffusion + soft-mask blend, no pixel is anywhere near the marker red.
      let redSurvivors = 0;
      for (let i = 0; i < patch.data.length; i += 4) {
        if (patch.data[i] > 120 && patch.data[i + 1] < 90 && patch.data[i + 2] < 90) redSurvivors++;
      }
      expect(redSurvivors).toBe(0);
    },
    30_000,
  );

  it(
    "leaves unmasked patch pixels byte-identical to the source region (a=0 keeps the original)",
    async () => {
      const master = await markerImage();
      const out = await eraseFill(master, basePayload(), await maskPng(200, 150, MASK_BOX));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const patch = await rawRGBA(out.bytes);
      // The effective image is the master (recipe empty → a lossless PNG round-trip
      // in the worker); its rect window is the source of truth for unmasked pixels.
      const srcWin = await sharp(master)
        .ensureAlpha()
        .extract({ left: RECT.x, top: RECT.y, width: RECT.w, height: RECT.h })
        .raw()
        .toBuffer();
      let mismatches = 0;
      for (let wy = 0; wy < RECT.h; wy++) {
        for (let wx = 0; wx < RECT.w; wx++) {
          const masked = wx >= 10 && wx < 50 && wy >= 10 && wy < 50; // the MASK_BOX in window coords
          if (masked) continue;
          const i = (wy * RECT.w + wx) * 4;
          if (
            patch.data[i] !== srcWin[i] ||
            patch.data[i + 1] !== srcWin[i + 1] ||
            patch.data[i + 2] !== srcWin[i + 2] ||
            patch.data[i + 3] !== srcWin[i + 3]
          ) {
            mismatches++;
          }
        }
      }
      expect(mismatches).toBe(0);
    },
    30_000,
  );

  it(
    "is deterministic — the same master + mask + rect yields byte-identical patches",
    async () => {
      const master = await markerImage();
      const mask = await maskPng(200, 150, MASK_BOX);
      const a = await eraseFill(master, basePayload(), mask);
      const b = await eraseFill(master, basePayload(), mask);
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.bytes.equals(b.bytes)).toBe(true);
    },
    45_000,
  );

  it(
    "strips adjust ops before compiling — the patch is identical with or without an adjust in the recipe",
    async () => {
      const master = await markerImage();
      const mask = await maskPng(200, 150, MASK_BOX);
      const plain = await eraseFill(master, basePayload(), mask);
      const toned = await eraseFill(
        master,
        basePayload([{ op: "adjust", label: "Brightness +50", param: "brightness", value: 50 }]),
        mask,
      );
      expect(plain.ok && toned.ok).toBe(true);
      if (!plain.ok || !toned.ok) return;
      // The adjust is stripped from the fill input, so the sampled surroundings —
      // and thus the patch bytes — are unchanged by its presence.
      expect(plain.bytes.equals(toned.bytes)).toBe(true);
    },
    45_000,
  );

  it(
    "rejects a rect that doesn't fit the compiled image (bad-recipe, never a jail job)",
    async () => {
      const payload: ErasePayload = {
        recipe: [],
        mask: { width: 200, height: 150, rect: { x: 180, y: 50, w: 60, h: 60 } }, // 180+60=240 > 200
      };
      const out = await eraseFill(await markerImage(), payload, await maskPng(200, 150, MASK_BOX));
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.code).toBe("bad-recipe");
    },
    15_000,
  );
});
