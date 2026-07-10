import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tificcAvailable } from "@/lib/photo/lcms";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { RenderErrorSchema } from "@/lib/schema/photo";
import { POST } from "./route";

const GRACOL_PATH = join(process.cwd(), "src", "lib", "photo", "profiles", "GRACoL2013_CRPC6.icc");
// tificc is ABSENT on this dev container by design — the preserved-CMYK leg
// then falls back to sharp re-separation (always testable); the preserve leg is
// exercised only where the binary is installed (CI live-import lane).
const HAVE_TIFICC = await tificcAvailable();

/** The four box numbers for a named box in the PDF page dict (pdf-wrap.test.ts
    parser — no PDF library, that's the point). */
function boxOf(pdf: Buffer, name: string): number[] {
  const m = new RegExp(`/${name} \\[([-\\d. ]+)\\]`).exec(pdf.toString("latin1"));
  if (!m) throw new Error(`no /${name} in page`);
  return m[1].trim().split(/\s+/).map(Number);
}

/** A CMYK TIFF (4-channel, PhotometricInterpretation 5) — a "CMYK arrival". */
function cmykTiff(w = 64, h = 48): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#884422" } })
    .toColourspace("cmyk")
    .tiff()
    .toBuffer();
}

/**
 * Adversarial + happy-path proof for POST /api/photo/render (plan §5, §4 PE3).
 * Next 15 route handlers are plain functions over the platform Request, so the
 * cases are built natively (Node 22 File/FormData/Request) — no server, no HTTP.
 * The core path is ALWAYS live (sharp ships with npm), so the happy path spawns
 * the real render jail; the pre-jail gates (size/payload/op-screen) short-
 * circuit before it.
 *
 * SUCCESS is BINARY (image bytes + Content-Type); every FAILURE leg MUST parse
 * against RenderErrorSchema — a drifted error shape is a red test here, not a
 * broken client.
 */

function payloadPart(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

function post(fileBytes: Uint8Array, filename: string, payload?: unknown): Promise<Response> {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(fileBytes)], filename));
  if (payload !== undefined) fd.append("payload", payloadPart(payload));
  return POST(new Request("http://test/api/photo/render", { method: "POST", body: fd }));
}

/** A small, valid PNG master. */
function png(w = 400, h = 300): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#3366aa" } }).png().toBuffer();
}

/** Parse an error body and assert it satisfies the binding error contract. */
async function parsedError(res: Response) {
  const body = await res.json();
  expect(RenderErrorSchema.safeParse(body).success).toBe(true);
  return body;
}

describe("POST /api/photo/render — happy path (binary out)", () => {
  it(
    "renders a rotate recipe and streams PNG bytes with the right headers",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "master.png", {
        recipe: [{ op: "rotate", label: "Rotate", quarterTurns: 1 }],
        format: "png",
        quality: 90,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toContain("no-store");
      const out = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(out).metadata();
      // A quarter-turn swaps the dims.
      expect([meta.width, meta.height]).toEqual([300, 400]);
    },
    30_000,
  );

  it(
    "renders a crop recipe to JPEG with an image/jpeg Content-Type",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "master.png", {
        recipe: [{ op: "crop", label: "Crop", rect: { x: 0, y: 0, w: 200, h: 150 }, ratio: null, shape: "rect" }],
        format: "jpeg",
        quality: 80,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      const out = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe("jpeg");
      expect([meta.width, meta.height]).toEqual([200, 150]);
    },
    30_000,
  );

  it(
    "renders an adjust (tone/colour) recipe to PNG — PE4 ops are now supported, dims unchanged",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "master.png", {
        recipe: [
          { op: "adjust", label: "Brightness +20", param: "brightness", value: 20 },
          { op: "adjust", label: "Saturation +30", param: "saturation", value: 30 },
        ],
        format: "png",
        quality: 90,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const out = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(out).metadata();
      // A pointwise tone pass never moves the frame.
      expect([meta.width, meta.height]).toEqual([400, 300]);
    },
    30_000,
  );
});

describe("POST /api/photo/render — request-shape gates (bad-recipe)", () => {
  it("rejects a non-multipart body as bad-recipe (400)", async () => {
    const res = await POST(
      new Request("http://test/api/photo/render", {
        method: "POST",
        body: JSON.stringify({ nope: true }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects multipart with no 'file' part (400 bad-recipe)", async () => {
    const fd = new FormData();
    fd.append("payload", JSON.stringify({ recipe: [], format: "png" }));
    const res = await POST(new Request("http://test/api/photo/render", { method: "POST", body: fd }));
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a missing payload part (400 bad-recipe)", async () => {
    const res = await post(new Uint8Array(await png(64, 64)), "master.png"); // no payload
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a payload that isn't valid JSON (400 bad-recipe)", async () => {
    const res = await post(new Uint8Array(await png(64, 64)), "master.png", "{not json");
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a payload whose shape fails Zod (unknown format) as bad-recipe (400)", async () => {
    const res = await post(new Uint8Array(await png(64, 64)), "master.png", {
      recipe: [],
      format: "gif", // not in RenderFormatSchema
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects an out-of-range adjust value (hostile contrast 259) as bad-recipe (400) — the schema bound's teeth", async () => {
    // 259 would divide the classic contrast factor by zero (259 − v). The
    // AdjustOpSchema −100..+100 bound rejects it before a byte reaches the jail.
    const res = await post(new Uint8Array(await png(64, 64)), "master.png", {
      recipe: [{ op: "adjust", label: "Contrast +259", param: "contrast", value: 259 }],
      format: "png",
      quality: 90,
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });
});

describe("POST /api/photo/render — op screening (unsupported-op)", () => {
  it("rejects a textOverlay op with 422 unsupported-op, naming the op and its PE6 tranche", async () => {
    const res = await post(new Uint8Array(await png(64, 64)), "master.png", {
      recipe: [
        {
          op: "textOverlay",
          label: "Text",
          id: "t1",
          text: "hi",
          font: { family: "Arimo", size: 24, bold: false, italic: false },
          color: "#000000",
          align: "left",
          box: { x: 0, y: 0, w: 50, h: 20 },
          rotation: 0,
        },
      ],
      format: "png",
      quality: 90,
    });
    expect(res.status).toBe(422);
    const body = await parsedError(res);
    expect(body).toMatchObject({ ok: false, code: "unsupported-op" });
    expect(body.message).toContain("textOverlay");
    expect(body.message).toContain("PE6");
  });

  it("rejects an erase op naming its PE9 tranche (still unsupported)", async () => {
    const res = await post(new Uint8Array(await png(64, 64)), "master.png", {
      recipe: [{ op: "erase", label: "Remove object", maskAssetId: "mask-1" }],
      format: "png",
      quality: 90,
    });
    expect(res.status).toBe(422);
    const body = await parsedError(res);
    expect(body).toMatchObject({ ok: false, code: "unsupported-op" });
    expect(body.message).toContain("PE9");
  });
});

describe("POST /api/photo/render — PE5 print-geometry ops now render (200)", () => {
  it(
    "resize renders 200 with the target dims",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "m.png", {
        recipe: [{ op: "resize", label: "Resize", mode: "px", px: { width: 120, height: 90 }, targetPx: { width: 120, height: 90 } }],
        format: "png",
        quality: 90,
      });
      expect(res.status).toBe(200);
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect([meta.width, meta.height]).toEqual([120, 90]);
    },
    30_000,
  );

  it(
    "bleedExpand renders 200, growing the canvas by 2·px",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "m.png", {
        recipe: [{ op: "bleedExpand", label: "Expand bleed", strategy: "mirror", amount: 0.125, px: 20 }],
        format: "png",
        quality: 90,
      });
      expect(res.status).toBe(200);
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect([meta.width, meta.height]).toEqual([440, 340]);
    },
    30_000,
  );

  it(
    "fitToSize (fit/pad) renders 200 with padded dims",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "m.png", {
        recipe: [{ op: "fitToSize", label: "Fit", mode: "fit", anchor: "center", pad: { l: 0, t: 50, r: 0, b: 50 } }],
        format: "png",
        quality: 90,
      });
      expect(res.status).toBe(200);
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect([meta.width, meta.height]).toEqual([400, 400]);
    },
    30_000,
  );
});

describe("POST /api/photo/render — colour intent", () => {
  it(
    "intent cmyk + jpeg → a 4-channel CMYK JPEG with the GRACoL profile embedded",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "master.png", {
        recipe: [{ op: "crop", label: "Crop", rect: { x: 0, y: 0, w: 200, h: 150 }, ratio: null, shape: "rect" }],
        format: "jpeg",
        quality: 90,
        intent: "cmyk",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      // RGB arrival → first-time separation, NOT a re-separation.
      expect(res.headers.get("x-photo-reseparated")).toBeNull();
      const out = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(out).metadata();
      expect(meta.space).toBe("cmyk");
      expect(meta.channels).toBe(4);
      expect(meta.icc?.equals(readFileSync(GRACOL_PATH))).toBe(true);
    },
    30_000,
  );

  it(
    "intent cmyk + png → sRGB PNG with X-Photo-Intent-Downgraded (PNG has no CMYK)",
    async () => {
      const res = await post(new Uint8Array(await png(200, 150)), "master.png", {
        recipe: [],
        format: "png",
        quality: 90,
        intent: "cmyk",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("x-photo-intent-downgraded")).toBe("srgb");
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect(meta.space).not.toBe("cmyk");
    },
    30_000,
  );
});

describe("POST /api/photo/render — PDF export", () => {
  it(
    "pdf + printTarget + cmyk → application/pdf with print boxes, DeviceCMYK, and a GRACoL OutputIntent",
    async () => {
      const res = await post(new Uint8Array(await png(400, 300)), "master.png", {
        recipe: [{ op: "crop", label: "Crop", rect: { x: 0, y: 0, w: 210, h: 120 }, ratio: null, shape: "rect" }],
        format: "pdf",
        quality: 80,
        intent: "cmyk",
        printTarget: { w: 3.5, h: 2, bleed: 0.125 },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      const pdf = Buffer.from(await res.arrayBuffer());
      const s = pdf.toString("latin1");
      expect(s.startsWith("%PDF-1.6")).toBe(true);
      // 3.5×2 in + 0.125 bleed → MediaBox [0 0 270 162], TrimBox [9 9 261 153].
      expect(boxOf(pdf, "MediaBox")).toEqual([0, 0, 270, 162]);
      expect(boxOf(pdf, "TrimBox")).toEqual([9, 9, 261, 153]);
      expect(s).toContain("/OutputIntents");
      expect(s).toContain("/S /GTS_PDFX");
      expect(s).toContain("/ColorSpace /DeviceCMYK");
    },
    30_000,
  );

  it(
    "pdf + srgb + no printTarget → application/pdf, image-sized page, DeviceRGB, no OutputIntent",
    async () => {
      const res = await post(new Uint8Array(await png(300, 300)), "master.png", {
        recipe: [],
        format: "pdf",
        quality: 80,
        intent: "srgb",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      const s = Buffer.from(await res.arrayBuffer()).toString("latin1");
      expect(s).not.toContain("/OutputIntents");
      expect(s).toContain("/ColorSpace /DeviceRGB");
    },
    30_000,
  );
});

describe("POST /api/photo/render — CMYK TIFF arrival decision table", () => {
  it.skipIf(HAVE_TIFICC)(
    "tificc ABSENT: an unedited CMYK TIFF re-separates through sharp (X-Photo-Reseparated), still 4-channel CMYK",
    async () => {
      const res = await post(new Uint8Array(await cmykTiff()), "press.tiff", {
        recipe: [],
        format: "tiff",
        quality: 90,
        intent: "cmyk",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/tiff");
      expect(res.headers.get("x-photo-reseparated")).toBe("1");
      expect(res.headers.get("x-photo-cmyk-preserved")).toBeNull();
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect(meta.space).toBe("cmyk");
      expect(meta.channels).toBe(4);
    },
    30_000,
  );

  it.runIf(HAVE_TIFICC)(
    "tificc PRESENT: an unedited CMYK TIFF is preserved (X-Photo-Cmyk-Preserved), not re-separated",
    async () => {
      const res = await post(new Uint8Array(await cmykTiff()), "press.tiff", {
        recipe: [],
        format: "tiff",
        quality: 90,
        intent: "cmyk",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/tiff");
      expect(res.headers.get("x-photo-cmyk-preserved")).toBe("1");
      expect(res.headers.get("x-photo-reseparated")).toBeNull();
    },
    30_000,
  );

  it(
    "a CMYK TIFF WITH edits always re-separates (recipe non-empty ⇒ never preserved), regardless of tificc",
    async () => {
      const res = await post(new Uint8Array(await cmykTiff(200, 150)), "press.tiff", {
        recipe: [{ op: "crop", label: "Crop", rect: { x: 0, y: 0, w: 100, h: 100 }, ratio: null, shape: "rect" }],
        format: "tiff",
        quality: 90,
        intent: "cmyk",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/tiff");
      expect(res.headers.get("x-photo-reseparated")).toBe("1");
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect([meta.width, meta.height]).toEqual([100, 100]);
      expect(meta.space).toBe("cmyk");
    },
    30_000,
  );

  it(
    "a CMYK TIFF exported as PDF re-separates (non-TIFF output ⇒ never preserved)",
    async () => {
      const res = await post(new Uint8Array(await cmykTiff(120, 90)), "press.tiff", {
        recipe: [],
        format: "pdf",
        quality: 90,
        intent: "cmyk",
        printTarget: { w: 6, h: 4, bleed: 0.125 },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("x-photo-reseparated")).toBe("1");
    },
    30_000,
  );
});

describe("POST /api/photo/render — size cap (413) fires before the jail", () => {
  it("rejects a master one byte over MAX_PHOTO_BYTES as too-large", async () => {
    const res = await post(new Uint8Array(MAX_PHOTO_BYTES + 1), "huge.png", {
      recipe: [],
      format: "png",
    });
    expect(res.status).toBe(413);
    const body = await parsedError(res);
    expect(body).toMatchObject({ ok: false, code: "too-large" });
    expect(body.message).toMatch(/MB/);
  });
});
