import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tificcAvailable } from "@/lib/photo/lcms";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { IntakeResponseSchema } from "@/lib/schema/photo";
import { POST } from "./route";

// tificc is ABSENT on this dev container by design — the preserved-CMYK leg is
// then omitted (honest degradation); present only where lcms2-utils is installed.
const HAVE_TIFICC = await tificcAvailable();

/**
 * Adversarial + happy-path proof for POST /api/photo/intake (plan §5, §4 PE1).
 * Next 15 route handlers are plain functions over the platform Request, so the
 * attacks are constructed natively (Node 22 File/FormData/Request) — no server,
 * no HTTP. The core decode path is ALWAYS live (sharp ships with npm), so the
 * happy path and the truncated-file case spawn the real jail; only the
 * pre-jail gates (size/sniff) short-circuit before it.
 *
 * Every response MUST parse against IntakeResponseSchema — the route already
 * asserts this in dev (NODE_ENV !== production, which vitest satisfies), and we
 * re-assert it here so a drifted shape is a red test, not a broken client.
 */

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const BMP_MAGIC = [0x42, 0x4d]; // "BM"

function post(bytes: Uint8Array, filename: string): Promise<Response> {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(bytes)], filename));
  return POST(new Request("http://test/api/photo/intake", { method: "POST", body: fd }));
}

/** Parse the body and assert it satisfies the binding contract. */
async function parsed(res: Response) {
  const body = await res.json();
  expect(IntakeResponseSchema.safeParse(body).success).toBe(true);
  return body;
}

describe("POST /api/photo/intake — request-shape gates", () => {
  it("rejects a non-multipart body as not-an-image", async () => {
    const res = await POST(
      new Request("http://test/api/photo/intake", {
        method: "POST",
        body: JSON.stringify({ nope: true }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await parsed(res)).toMatchObject({ ok: false, code: "not-an-image" });
  });

  it("rejects multipart with no 'file' field", async () => {
    const fd = new FormData();
    fd.append("note", "hi");
    const res = await POST(new Request("http://test/api/photo/intake", { method: "POST", body: fd }));
    expect(res.status).toBe(400);
    expect(await parsed(res)).toMatchObject({ ok: false, code: "not-an-image" });
  });
});

describe("POST /api/photo/intake — size cap (413) fires before the jail", () => {
  it("rejects a file one byte over MAX_PHOTO_BYTES", async () => {
    // Oversize but never decoded: the cap reads file.size, so no jail spawns.
    const res = await post(new Uint8Array(MAX_PHOTO_BYTES + 1), "huge.png");
    expect(res.status).toBe(413);
    const body = await parsed(res);
    expect(body).toMatchObject({ ok: false, code: "too-large" });
    expect(body.message).toMatch(/MB/);
  });
});

describe("POST /api/photo/intake — content sniff owns the gate", () => {
  it("rejects a ZIP disguised as .jpg with not-an-image + friendly copy", async () => {
    const zip = new Uint8Array(64);
    zip.set(ZIP_MAGIC, 0);
    const res = await post(zip, "photo.jpg");
    expect(res.status).toBe(415);
    const body = await parsed(res);
    expect(body).toMatchObject({ ok: false, code: "not-an-image" });
    expect(body.message).toContain("isn't an image");
  });

  it("rejects raw BMP as unsupported-here (BMP decodes client-side, v1.4)", async () => {
    const bmp = new Uint8Array(64);
    bmp.set(BMP_MAGIC, 0);
    const res = await post(bmp, "art.bmp");
    expect(res.status).toBe(422);
    expect(await parsed(res)).toMatchObject({ ok: false, code: "unsupported-here" });
  });

  it("rejects HEIC as unsupported-here (no conversion in PE1)", async () => {
    // Minimal ISO-BMFF ftyp with a 'heic' major brand.
    const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]);
    const res = await post(heic, "IMG_4823.heic");
    expect(res.status).toBe(422);
    const body = await parsed(res);
    expect(body).toMatchObject({ ok: false, code: "unsupported-here" });
    expect(body.message).toMatch(/HEIC/);
  });
});

describe("POST /api/photo/intake — live jail decode", () => {
  it(
    "opens a valid PNG: success shape, dims sane, metadata note present",
    async () => {
      const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2277cc" } })
        .png()
        .toBuffer();
      const res = await post(png, "shot.png");
      expect(res.status).toBe(200);
      const body = await parsed(res);
      expect(body.ok).toBe(true);
      expect(body.master.width).toBe(800);
      expect(body.master.height).toBe(600);
      expect(body.master.b64.length).toBeGreaterThan(0);
      expect(body.proxy.width).toBeGreaterThan(0);
      expect(body.meta.originalName).toBe("shot.png");
      expect(body.meta.colorSpace).toBe("rgb");
      expect(body.meta.notes).toContain("Metadata removed when the file was opened");
    },
    15_000,
  );

  it(
    "classifies a truncated JPEG as decode-failed through the real jail",
    async () => {
      const trunc = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xde, 0xad, 0xbe, 0xef]);
      const res = await post(trunc, "broken.jpg");
      expect(res.status).toBe(422);
      expect(await parsed(res)).toMatchObject({ ok: false, code: "decode-failed" });
    },
    15_000,
  );
});

describe("POST /api/photo/intake — CMYK arrival (the CMYK-preserve seam)", () => {
  it(
    "opens a CMYK TIFF: colorSpace cmyk; the preserved cmykMaster leg is present only where tificc is installed",
    async () => {
      const cmyk = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#884422" } })
        .toColourspace("cmyk")
        .tiff()
        .toBuffer();
      const res = await post(cmyk, "press.tiff");
      expect(res.status).toBe(200);
      const body = await parsed(res); // the additive optional cmykMaster still validates
      expect(body.ok).toBe(true);
      expect(body.meta.colorSpace).toBe("cmyk");
      if (HAVE_TIFICC) {
        expect(body.cmykMaster).toBeDefined();
        expect(body.cmykMaster.mime).toBe("image/tiff");
        expect(body.cmykMaster.width).toBe(120);
        expect(body.meta.notes).toContain("Press-ready CMYK preserved alongside the working copy");
      } else {
        // Honest degradation on this dev container: no preserved leg.
        expect(body.cmykMaster).toBeUndefined();
      }
    },
    20_000,
  );
});

// Pixel-flood needs a lowered ceiling; caps load from env at module import, so
// shrink STP_MAX_PHOTO_PIXELS and re-import the route fresh (a small VALID
// image then exceeds it — libvips refuses at header read, before allocation).
describe("POST /api/photo/intake — pixel-flood → too-many-pixels", () => {
  const saved = process.env.STP_MAX_PHOTO_PIXELS;
  beforeEach(() => {
    process.env.STP_MAX_PHOTO_PIXELS = "1000";
    vi.resetModules();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.STP_MAX_PHOTO_PIXELS;
    else process.env.STP_MAX_PHOTO_PIXELS = saved;
    vi.resetModules();
  });

  it(
    "surfaces too-many-pixels (413) for an image over the shrunk ceiling",
    async () => {
      const { POST: FreshPOST } = await import("./route");
      const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#123456" } })
        .png()
        .toBuffer();
      const fd = new FormData();
      fd.append("file", new File([new Uint8Array(img)], "flood.png"));
      const res = await FreshPOST(new Request("http://test/api/photo/intake", { method: "POST", body: fd }));
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(IntakeResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toMatchObject({ ok: false, code: "too-many-pixels" });
    },
    15_000,
  );
});
