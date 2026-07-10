import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { RenderErrorSchema } from "@/lib/schema/photo";
import { POST } from "./route";

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

  it("rejects a resize op naming its PE5 tranche", async () => {
    const res = await post(new Uint8Array(await png(64, 64)), "master.png", {
      recipe: [{ op: "resize", label: "Resize", mode: "percent", percent: 50 }],
      format: "png",
      quality: 90,
    });
    expect(res.status).toBe(422);
    const body = await parsedError(res);
    expect(body).toMatchObject({ ok: false, code: "unsupported-op" });
    expect(body.message).toContain("PE5");
  });
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
