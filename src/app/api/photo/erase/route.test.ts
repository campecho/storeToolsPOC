import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_MASK_BYTES, MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { RenderErrorSchema } from "@/lib/schema/photo";
import { POST } from "./route";

/**
 * Adversarial + happy-path proof for POST /api/photo/erase (plan §4 PE9). Mirrors
 * the render route tests: Next 15 route handlers are plain functions over the
 * platform Request, so the cases are built natively (Node 22 File/FormData/
 * Request) — no server, no HTTP. The fill core is ALWAYS live (sharp ships with
 * npm), so the happy path spawns the real erase jail; the pre-jail gates
 * (size/payload/op-screen/mask) short-circuit before it.
 *
 * SUCCESS is BINARY (the patch PNG + Content-Type); every FAILURE leg MUST parse
 * against RenderErrorSchema — a drifted error shape is a red test here, not a
 * broken client.
 */

function payloadPart(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

/** A small, valid PNG master (solid #3366aa blue). */
function png(w = 200, h = 150): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#3366aa" } }).png().toBuffer();
}

/** A grayscale-on-black mask PNG: white (255) over `box`, black elsewhere — the
    ErasePayloadSchema mask contract (luminance is the fill factor). */
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

/** A pre-rendered erase patch PNG (a prior erase op's stored fill). */
function patchPng(w = 40, h = 20): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
}

/** A stored-explicit erase op for a recipe slice (a PRIOR erase op). */
function eraseRecipeOp(id: string, rect: { x: number; y: number; w: number; h: number }) {
  return { op: "erase", label: "Remove object", maskAssetId: `photo:mask-${id}`, patch: { id, assetId: `photo:patch-${id}`, rect } };
}

/**
 * POST an erase request. `mask` omitted → no mask part; a Uint8Array → attached
 * verbatim. `eraseParts` attaches one `erase:<id>` patch part per entry.
 */
function postErase(opts: {
  file?: Uint8Array;
  filename?: string;
  payload?: unknown;
  mask?: Uint8Array;
  eraseParts?: Record<string, Uint8Array>;
}): Promise<Response> {
  const fd = new FormData();
  if (opts.file !== undefined) fd.append("file", new File([new Uint8Array(opts.file)], opts.filename ?? "master.png"));
  if (opts.payload !== undefined) fd.append("payload", payloadPart(opts.payload));
  if (opts.mask !== undefined) fd.append("mask", new File([new Uint8Array(opts.mask)], "mask.png"));
  for (const [id, bytes] of Object.entries(opts.eraseParts ?? {})) {
    fd.append(`erase:${id}`, new File([new Uint8Array(bytes)], `${id}.png`));
  }
  return POST(new Request("http://test/api/photo/erase", { method: "POST", body: fd }));
}

/** Parse an error body and assert it satisfies the binding error contract. */
async function parsedError(res: Response) {
  const body = await res.json();
  expect(RenderErrorSchema.safeParse(body).success).toBe(true);
  return body;
}

const RECT = { x: 70, y: 50, w: 60, h: 60 };
const MASK_BOX = { x0: 80, y0: 60, x1: 120, y1: 100 };
const okPayload = (recipe: unknown[] = []) => ({ recipe, mask: { width: 200, height: 150, rect: RECT } });

describe("POST /api/photo/erase — happy path (binary patch out)", () => {
  it(
    "returns the classical-fill patch as an image/png of the rect dims, no-store",
    async () => {
      const res = await postErase({
        file: new Uint8Array(await png(200, 150)),
        payload: okPayload(),
        mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toContain("no-store");
      const out = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe("png");
      expect([meta.width, meta.height]).toEqual([RECT.w, RECT.h]);
    },
    30_000,
  );
});

describe("POST /api/photo/erase — request-shape gates (bad-recipe)", () => {
  it("rejects a non-multipart body as bad-recipe (400)", async () => {
    const res = await POST(
      new Request("http://test/api/photo/erase", {
        method: "POST",
        body: JSON.stringify({ nope: true }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a missing 'file' part (400 bad-recipe)", async () => {
    const res = await postErase({ payload: okPayload(), mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)) });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a payload that isn't valid JSON (400 bad-recipe)", async () => {
    const res = await postErase({
      file: new Uint8Array(await png(64, 64)),
      payload: "{not json",
      mask: new Uint8Array(await maskPng(64, 64, { x0: 8, y0: 8, x1: 32, y1: 32 })),
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a payload whose shape fails Zod (bad mask rect) as bad-recipe (400)", async () => {
    const res = await postErase({
      file: new Uint8Array(await png(200, 150)),
      payload: { recipe: [], mask: { width: 200, height: 150, rect: { x: 0, y: 0, w: 0, h: 10 } } }, // w<1
      mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)),
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });
});

describe("POST /api/photo/erase — mask part gates (bad-recipe)", () => {
  it("rejects a request with no mask part (400 bad-recipe)", async () => {
    const res = await postErase({ file: new Uint8Array(await png(200, 150)), payload: okPayload() });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a mask over the 2 MB byte cap (400 bad-recipe) — before any decode", async () => {
    const huge = new Uint8Array(MAX_MASK_BYTES + 1); // never decoded
    const res = await postErase({ file: new Uint8Array(await png(200, 150)), payload: okPayload(), mask: huge });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a mask that isn't a PNG (400 bad-recipe)", async () => {
    const res = await postErase({
      file: new Uint8Array(await png(200, 150)),
      payload: okPayload(),
      mask: new Uint8Array([0x00, 0x01, 0x02, 0x03]), // no PNG magic
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it("rejects a mask whose header dims don't match the declared mask dims (400 bad-recipe)", async () => {
    const res = await postErase({
      file: new Uint8Array(await png(200, 150)),
      payload: { recipe: [], mask: { width: 100, height: 100, rect: RECT } }, // declared 100×100
      mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)), // actual 200×150
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });
});

describe("POST /api/photo/erase — prior erase patches + size cap", () => {
  it("rejects a prior erase op with no matching patch part (400 bad-recipe)", async () => {
    const res = await postErase({
      file: new Uint8Array(await png(200, 150)),
      payload: okPayload([eraseRecipeOp("prev", { x: 0, y: 0, w: 40, h: 20 })]),
      mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)),
      // no erase:prev part
    });
    expect(res.status).toBe(400);
    expect(await parsedError(res)).toMatchObject({ ok: false, code: "bad-recipe" });
  });

  it(
    "accepts a prior erase op WITH its patch part (200, patch of the rect dims)",
    async () => {
      const res = await postErase({
        file: new Uint8Array(await png(200, 150)),
        payload: okPayload([eraseRecipeOp("prev", { x: 0, y: 0, w: 40, h: 20 })]),
        mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)),
        eraseParts: { prev: new Uint8Array(await patchPng(40, 20)) },
      });
      expect(res.status).toBe(200);
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect([meta.width, meta.height]).toEqual([RECT.w, RECT.h]);
    },
    30_000,
  );

  it("rejects a master over MAX_PHOTO_BYTES as too-large (413) before the jail", async () => {
    const res = await postErase({
      file: new Uint8Array(MAX_PHOTO_BYTES + 1),
      filename: "huge.png",
      payload: okPayload(),
      mask: new Uint8Array(await maskPng(200, 150, MASK_BOX)),
    });
    expect(res.status).toBe(413);
    const body = await parsedError(res);
    expect(body).toMatchObject({ ok: false, code: "too-large" });
    expect(body.message).toMatch(/MB/);
  });
});
