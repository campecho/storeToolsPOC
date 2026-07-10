import { NextResponse } from "next/server";
import { sniffImageMime } from "@/lib/import/image-meta";
// One AV seam for the whole suite: reuse the import stack's logging stub
// (plan §3.6 — "same seam as import"). Nothing scans yet; the call site exists
// so the engine decision has a single place to fill.
import { avScanHook } from "@/lib/import/pub2raw";
import { isGeometryOp } from "@/lib/photo/geometry";
import { cmykPreservePath, isCmykTiff, tificcAvailable } from "@/lib/photo/lcms";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { scanJpeg, wrapImagePdf } from "@/lib/photo/pdf-wrap";
import { GRACOL_IDENTIFIER, gracolProfileBytes, renderImage } from "@/lib/photo/render-host";
import {
  RenderErrorSchema,
  RenderPayloadSchema,
  type PhotoOp,
  type RenderError,
  type RenderErrorCode,
  type RenderPayload,
} from "@/lib/schema/photo";

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

/** HTTP status for each render failure code (plan §4 PE3 mapping). */
const STATUS_FOR: Record<RenderErrorCode, number> = {
  "bad-recipe": 400,
  "unsupported-op": 422,
  "too-large": 413,
  "too-many-pixels": 413,
  "decode-failed": 422,
  timeout: 504,
  "engine-error": 500,
};

/**
 * The tranche each still-unsupported op renders from, for the `unsupported-op`
 * message ("'textOverlay' ops render from PE6"). Ops that render HERE — geometry
 * (crop/rotate/flip/straighten + the PE5 print-geometry resize/bleedExpand/
 * fitToSize) and tone/colour (adjust/autoEnhance, PE4) — are absent from this map.
 */
const OP_TRANCHE: Record<string, string> = {
  textOverlay: "ops render from PE6",
  logoOverlay: "ops render from PE6",
  erase: "ops render from PE9",
};

/** The op tags the render spine can replay today: geometry (incl. the PE5
    print-geometry ops, via isGeometryOp) + PE4 tone/colour. */
function isRenderableOp(op: PhotoOp): boolean {
  return isGeometryOp(op) || op.op === "adjust" || op.op === "autoEnhance";
}

/** Build a schema-checked JSON error (dev asserts the contract; tests too). */
function fail(status: number, code: RenderErrorCode, message: string): NextResponse {
  const body: RenderError = { ok: false, code, message };
  if (process.env.NODE_ENV !== "production") RenderErrorSchema.parse(body);
  return NextResponse.json(body, { status });
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

  // 4. Op-tag screen: geometry (crop/rotate/flip/straighten) and tone/colour
  //    (adjust/autoEnhance, PE4) render here. Name the first offender and its
  //    tranche so the panel can explain the wait.
  for (const op of payload.recipe) {
    if (!isRenderableOp(op)) {
      const tranche = OP_TRANCHE[op.op] ?? "ops aren't supported yet";
      return fail(422, "unsupported-op", `'${op.op}' ${tranche} — export supports crop, rotate, flip, straighten, resize, bleed, fit-to-size, and tone/colour adjust for now.`);
    }
  }

  const master = Buffer.from(await file.arrayBuffer());

  // AV seam (§3.6) — same logging stub as import; nothing scans yet.
  await avScanHook(file.name, master);

  // 5. CMYK-arrival decision (PE5, §1.3 v1.4). The client sends the preserved
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

  // 6. PDF: the worker renders a JPEG (quality ≥ 92, colour per intent) and
  //    pdf-wrap frames it with the print boxes + (for cmyk) the GRACoL
  //    OutputIntent. pdf-wrap scans the JPEG internally for the Adobe /Decode
  //    inversion, so we don't double-handle it here.
  if (payload.format === "pdf") {
    return renderPdf(master, payload, reseparated);
  }

  // 7. Normal raster render (jpeg/png/tiff). Replay in the jail; the master
  //    bytes drop out of scope after (nothing persists them — §1.4).
  const result = await renderImage(master, payload);
  if (!result.ok) {
    return fail(STATUS_FOR[result.code] ?? 500, result.code, result.message);
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
): Promise<NextResponse> {
  const jpegPayload: RenderPayload = { ...payload, format: "jpeg", quality: Math.max(payload.quality, 92) };
  const result = await renderImage(master, jpegPayload);
  if (!result.ok) return fail(STATUS_FOR[result.code] ?? 500, result.code, result.message);

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
