import { NextResponse } from "next/server";
import { imageDimensions, sniffImageMime } from "@/lib/import/image-meta";
// One AV seam for the whole suite: reuse the import stack's logging stub
// (plan §3.6 — "same seam as import"). Nothing scans yet; the call site exists
// so the engine decision has a single place to fill.
import { avScanHook } from "@/lib/import/pub2raw";
import { cmykPreservePath, isCmykTiff, tificcAvailable } from "@/lib/photo/lcms";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { scanJpeg, wrapImagePdf } from "@/lib/photo/pdf-wrap";
import {
  compileRenderPlan,
  GRACOL_IDENTIFIER,
  gracolProfileBytes,
  masterDimensions,
  renderImage,
} from "@/lib/photo/render-host";
import { RenderPayloadSchema, type RenderPayload } from "@/lib/schema/photo";
// Op-screen, status mapping, the JSON error builder, and the erase-patch collector
// are shared with the erase-preview route (render-support) so the two surfaces
// can't drift on rules the untrusted client must not slip past.
import { collectErasePatches, fail, failFrom, isRenderableOp } from "../render-support";

/**
 * POST /api/photo/render — the export spine (plan §3.3 "Export", §4 PE3). A
 * multipart upload carries the working-master bytes (the `file` part) and the
 * recipe to replay (the `payload` part, a JSON string). The render host
 * compiles the recipe into dumb worker steps using the SAME geometry.ts the
 * client canvas uses — parity by shared code — and replays them at full
 * resolution in the jail. `sharp` never runs in this process (§3.6).
 *
 * CONTRACT: SUCCESS is BINARY — the encoded image streams back with an
 * `image/jpeg`|`image/png` Content-Type and `Cache-Control: no-store`, NOT a
 * JSON envelope. FAILURE is JSON, exactly `RenderErrorSchema` (asserted in dev,
 * covered by the route tests). The client is UNTRUSTED: the payload is
 * Zod-validated and every op tag is screened before a byte reaches the jail;
 * no field from the payload ever reaches the filesystem or a shell.
 */

export const runtime = "nodejs";

/**
 * Per-overlay raster byte cap (PE6, §3.6 — "overlay rasters size-capped and
 * re-encoded"). 8 MB is generous for a PNG placement rendered at export
 * resolution; anything larger is rejected before a byte reaches the jail. The
 * jail re-encode (worker decode+resize) is the sanitizer; this is the DoS guard.
 */
const MAX_OVERLAY_BYTES = 8 * 1024 * 1024;

/**
 * Collect, validate, and re-key the pre-rendered overlay rasters (PE6, §3.3,
 * §3.6). The pixels ride SEPARATE multipart parts named `overlay:<id>`, one per
 * `payload.overlays` entry. This gate is where the UNTRUSTED client raster meets
 * the server's rules BEFORE a byte reaches the jail:
 *   • a declared overlay with no `overlay:<id>` part → 400 bad-recipe;
 *   • an `overlay:<id>` part with no matching declaration → 400 bad-recipe;
 *   • a part over MAX_OVERLAY_BYTES → 400 bad-recipe (the DoS guard);
 *   • decoded header dims ≠ the DECLARED width/height → 400 bad-recipe;
 *   • a placement box that doesn't fit inside the final-output dims → 400.
 * The dims read is a cheap HEADER sniff (no decode in this process — sharp never
 * runs here, §3.6); the worker's decode+resize+composite is the real re-encode
 * that sanitizes the raster. On success the map is keyed by the jail-local
 * basename `overlay-<id>.png` the composite steps reference, ready for renderImage.
 */
async function collectOverlays(
  form: FormData,
  payload: RenderPayload,
  master: Buffer,
): Promise<
  { ok: true; attachments?: Record<string, Buffer> } | { ok: false; response: NextResponse }
> {
  const declared = payload.overlays ?? [];

  // Gather every `overlay:<id>` part up front so a part-without-declaration is
  // caught even when nothing was declared.
  const parts = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("overlay:")) continue;
    if (!(value instanceof File)) {
      return { ok: false, response: fail(400, "bad-recipe", `The overlay part '${key}' must be an uploaded image.`) };
    }
    parts.set(key.slice("overlay:".length), value);
  }

  if (declared.length === 0 && parts.size === 0) return { ok: true };

  const declaredIds = new Set(declared.map((o) => o.id));
  for (const id of parts.keys()) {
    if (!declaredIds.has(id)) {
      return { ok: false, response: fail(400, "bad-recipe", `Overlay image 'overlay:${id}' has no matching overlay in the request.`) };
    }
  }

  // Final-output pixel space (the effective dims after all geometry) — the
  // placements must fit here. compileRenderPlan is pure math; the op-screen has
  // already rejected any un-renderable op, so the catch is defence in depth.
  const dims = masterDimensions(master);
  if (!dims) {
    return { ok: false, response: fail(422, "decode-failed", "The image to render couldn't be read.") };
  }
  let out: { w: number; h: number };
  try {
    ({ out } = compileRenderPlan(payload.recipe, { w: dims.width, h: dims.height }));
  } catch {
    return { ok: false, response: fail(422, "unsupported-op", "This recipe can't be compiled for rendering.") };
  }

  const attachments: Record<string, Buffer> = {};
  for (const o of declared) {
    const part = parts.get(o.id);
    if (!part) {
      return { ok: false, response: fail(400, "bad-recipe", `Overlay '${o.id}' is missing its image part 'overlay:${o.id}'.`) };
    }
    if (part.size > MAX_OVERLAY_BYTES) {
      const mb = Math.round(MAX_OVERLAY_BYTES / 1024 / 1024);
      return { ok: false, response: fail(400, "bad-recipe", `Overlay '${o.id}' is over the ${mb} MB limit for a placed image.`) };
    }
    const bytes = Buffer.from(await part.arrayBuffer());
    const mime = sniffImageMime(bytes);
    const odims = mime ? imageDimensions(bytes, mime) : undefined;
    if (!odims || odims.width !== o.width || odims.height !== o.height) {
      return {
        ok: false,
        response: fail(400, "bad-recipe", `Overlay '${o.id}' must be a ${o.width}×${o.height} image to match its placement.`),
      };
    }
    if (o.left < 0 || o.top < 0 || o.left + o.width > out.w || o.top + o.height > out.h) {
      return {
        ok: false,
        response: fail(400, "bad-recipe", `Overlay '${o.id}' doesn't fit inside the ${out.w}×${out.h} export.`),
      };
    }
    attachments[`overlay-${o.id}.png`] = bytes;
  }

  return { ok: true, attachments };
}

export async function POST(req: Request) {
  // 1. Multipart parse. A non-multipart / malformed body is a bad request —
  //    there is no recipe to speak of.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad-recipe", "Expected a multipart form upload with 'file' and 'payload' parts.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "bad-recipe", "Attach the working-master image as the 'file' part.");
  }

  // 2. Size cap BEFORE reading bytes (DoS guard, §3.6) — an oversize master
  //    never invokes the jail.
  if (file.size > MAX_PHOTO_BYTES) {
    const mb = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);
    return fail(413, "too-large", `That image is over the ${mb} MB limit we can render here.`);
  }

  // 3. Payload: JSON.parse then Zod. Either failure is bad-recipe with friendly
  //    copy — never a stack trace to an untrusted client.
  const rawPayload = form.get("payload");
  if (typeof rawPayload !== "string") {
    return fail(400, "bad-recipe", "The render 'payload' part must be a JSON string.");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
  } catch {
    return fail(400, "bad-recipe", "The render request couldn't be read — its recipe wasn't valid JSON.");
  }
  const payloadResult = RenderPayloadSchema.safeParse(parsedJson);
  if (!payloadResult.success) {
    return fail(400, "bad-recipe", "That export request wasn't in a shape we can render — please try again.");
  }
  const payload = payloadResult.data;

  // 4. Op-tag screen (defence in depth): every current PhotoOp tag is renderable
  //    — geometry (crop/rotate/flip/straighten + the PE5 print-geometry ops),
  //    tone/colour (adjust/autoEnhance, PE4), the PE6 overlay ops (accepted +
  //    ignored by the fold), and the PE9 erase op — so this screen only bites a
  //    future non-renderable tag before it reaches the jail.
  for (const op of payload.recipe) {
    if (!isRenderableOp(op)) {
      return fail(422, "unsupported-op", `'${op.op}' ops aren't supported by export yet.`);
    }
  }

  const master = Buffer.from(await file.arrayBuffer());

  // AV seam (§3.6) — same logging stub as import; nothing scans yet.
  await avScanHook(file.name, master);

  // 5. Overlays (PE6) + erase patches (PE9): match the `overlay:<id>` /
  //    `erase:<id>` parts to the payload, size-cap + dimension-check each, and
  //    re-key them to the jail basenames the composite steps reference. Any
  //    mismatch is a friendly 400 before the jail.
  const overlayResult = await collectOverlays(form, payload, master);
  if (!overlayResult.ok) return overlayResult.response;

  const eraseResult = await collectErasePatches(form, payload.recipe);
  if (!eraseResult.ok) return failFrom(eraseResult.code, eraseResult.message);

  // Merge overlay + erase attachments into one map — disjoint jail basenames
  // (overlay-<id>.png vs erase-<id>.png). Keep `undefined` when there are neither,
  // so the CMYK identity-preserve fast path (which requires no attachments) still
  // triggers; an erase op forces a non-empty recipe, so it can't ride it anyway.
  let attachments: Record<string, Buffer> | undefined;
  if (overlayResult.attachments || eraseResult.attachments) {
    attachments = { ...overlayResult.attachments, ...eraseResult.attachments };
  }

  // 6. CMYK-arrival decision (PE5, §1.3 v1.4). The client sends the preserved
  //    CMYK master (a tificc TIFF) as `file` ONLY when there are no edits and the
  //    intent is cmyk; anything else arrives as the sharp RGB working master. The
  //    server decides purely from the bytes it holds:
  const inputIsCmykTiff = sniffImageMime(master) === "image/tiff" && isCmykTiff(master);
  const recipeEmpty = payload.recipe.length === 0;

  // PRESERVE path (no re-separation): a CMYK TIFF, unedited, exported as CMYK
  // TIFF rides the jailed tificc identity re-encode that KEEPS the original
  // separation. POC rule (documented): TIFF output ONLY — a CMYK TIFF → CMYK
  // JPEG/PDF without a sharp RGB unpack isn't possible here, so those (and any
  // edited or tificc-absent case) fall to the sharp separate-through-GRACoL path
  // below, marked X-Photo-Reseparated so the UI can say the separation was
  // recomputed. tificc absent (this dev container) → always the fallback.
  if (
    payload.intent === "cmyk" &&
    payload.format === "tiff" &&
    recipeEmpty &&
    !attachments && // overlays force the sharp composite path, never the identity preserve
    inputIsCmykTiff &&
    (await tificcAvailable())
  ) {
    const preserved = await cmykPreservePath(master);
    if (preserved.ok) {
      return new NextResponse(new Uint8Array(preserved.tiff), {
        status: 200,
        headers: {
          "Content-Type": "image/tiff",
          "Content-Length": String(preserved.tiff.length),
          "Cache-Control": "no-store",
          "X-Photo-Cmyk-Preserved": "1",
        },
      });
    }
    // tificc failed on a genuine CMYK TIFF — fall through to re-separation.
  }

  // A CMYK arrival that did NOT preserve above gets re-separated through GRACoL
  // by sharp; mark it honestly so the UI can surface the recomputed separation.
  const reseparated = payload.intent === "cmyk" && inputIsCmykTiff;

  // 7. PDF: the worker renders a JPEG (quality ≥ 92, colour per intent) and
  //    pdf-wrap frames it with the print boxes + (for cmyk) the GRACoL
  //    OutputIntent. pdf-wrap scans the JPEG internally for the Adobe /Decode
  //    inversion, so we don't double-handle it here.
  if (payload.format === "pdf") {
    return renderPdf(master, payload, reseparated, attachments);
  }

  // 8. Normal raster render (jpeg/png/tiff). Replay in the jail; the master
  //    bytes drop out of scope after (nothing persists them — §1.4).
  const result = await renderImage(master, payload, attachments);
  if (!result.ok) {
    return failFrom(result.code, result.message);
  }

  // SUCCESS: stream the encoded bytes back as binary (never cached — the render
  // is derived from client-held bytes, not a durable resource).
  const headers: Record<string, string> = {
    "Content-Type": result.mime,
    "Content-Length": String(result.bytes.length),
    "Cache-Control": "no-store",
  };
  // PNG can't carry CMYK — the worker downgraded to sRGB; surface it (dev #6).
  if (payload.format === "png" && payload.intent === "cmyk") headers["X-Photo-Intent-Downgraded"] = "srgb";
  if (reseparated) headers["X-Photo-Reseparated"] = "1";
  return new NextResponse(new Uint8Array(result.bytes), { status: 200, headers });
}

/**
 * PDF export (plan §4 PE5): the render worker encodes a JPEG (bumped to ≥ 92
 * quality — a PDF is a keep-forever artifact — and separated per intent), then
 * `wrapImagePdf` frames it with the print geometry. The page is the payload's
 * `printTarget` (trim + bleed boxes) or, absent one, the image's own size at
 * 300 DPI (a sensible print default). The GRACoL `/OutputIntent` rides only the
 * CMYK path (omitted for sRGB at POC — noted in pdf-wrap).
 */
async function renderPdf(
  master: Buffer,
  payload: RenderPayload,
  reseparated: boolean,
  attachments?: Record<string, Buffer>,
): Promise<NextResponse> {
  const jpegPayload: RenderPayload = { ...payload, format: "jpeg", quality: Math.max(payload.quality, 92) };
  const result = await renderImage(master, jpegPayload, attachments);
  if (!result.ok) return failFrom(result.code, result.message);

  const scan = scanJpeg(result.bytes);
  if (scan.width < 1 || scan.height < 1) {
    return fail(500, "engine-error", "The renderer produced an unreadable image for the PDF.");
  }

  const t = payload.printTarget;
  const hasTarget = t !== undefined && t.w > 0 && t.h > 0;
  const pdf = wrapImagePdf({
    jpeg: result.bytes,
    width: scan.width,
    height: scan.height,
    colorSpace: payload.intent === "cmyk" ? "cmyk" : "rgb",
    page: hasTarget
      ? { kind: "print", trimW: t!.w, trimH: t!.h, bleed: t!.bleed }
      : { kind: "image", dpi: 300 },
    outputIntent:
      payload.intent === "cmyk"
        ? { iccBytes: await gracolProfileBytes(), identifier: GRACOL_IDENTIFIER }
        : undefined,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Length": String(pdf.length),
    "Cache-Control": "no-store",
  };
  if (reseparated) headers["X-Photo-Reseparated"] = "1";
  return new NextResponse(new Uint8Array(pdf), { status: 200, headers });
}
