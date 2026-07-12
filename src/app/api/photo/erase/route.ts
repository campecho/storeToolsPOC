import { NextResponse } from "next/server";
import { imageDimensions, sniffImageMime } from "@/lib/import/image-meta";
// One AV seam for the whole suite: reuse the import stack's logging stub
// (plan §3.6 — "same seam as import"). Nothing scans yet; the call site exists
// so the engine decision has a single place to fill.
import { avScanHook } from "@/lib/import/pub2raw";
import { MAX_ERASE_OPS, MAX_MASK_BYTES, MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { eraseFill } from "@/lib/photo/render-host";
import { ErasePayloadSchema } from "@/lib/schema/photo";
// Op-screen, status mapping, the JSON error builder, and the erase-patch
// collector are shared with the export route (render-support) so the untrusted
// client meets the SAME rules on both surfaces.
import { collectErasePatches, fail, failFrom, isRenderableOp } from "../render-support";

/**
 * POST /api/photo/erase — the classical erase-fill preview (plan §4 PE9, the
 * suggest-never-auto-apply loop every model op will inherit). A multipart upload
 * carries the working-master bytes (`file`), the brushed mask (`mask`, a
 * grayscale-on-black PNG), the recipe slice + fill rect (`payload`, JSON →
 * ErasePayloadSchema), and one `erase:<id>` part per PRIOR erase op in the
 * recipe. The render host replays the geometry + prior-erase slice at full
 * resolution in the jail, patch-from-surround + soft-mask-blends the rect window,
 * and returns the STORED-EXPLICIT patch the erase op will carry so replay
 * (canvas + export) never re-runs the fill. `sharp` never runs in this process
 * (§3.6).
 *
 * CONTRACT (mirrors the render route): SUCCESS is BINARY — the patch PNG streams
 * back with `image/png` + `Cache-Control: no-store`, NOT a JSON envelope. FAILURE
 * is JSON, exactly `RenderErrorSchema`, with the render route's status mapping.
 * The client is UNTRUSTED: the payload is Zod-validated, every op tag is screened,
 * and the mask is sniffed + size-capped BEFORE a byte reaches the jail; no field
 * reaches the filesystem or a shell (jail basenames are built server-side from
 * validated ids).
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1. Multipart parse. A non-multipart / malformed body is a bad request —
  //    there is nothing to fill.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad-recipe", "Expected a multipart form upload with 'file', 'mask', and 'payload' parts.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "bad-recipe", "Attach the working-master image as the 'file' part.");
  }

  // 2. Master size cap BEFORE reading bytes (DoS guard, §3.6) — an oversize
  //    master never invokes the jail.
  if (file.size > MAX_PHOTO_BYTES) {
    const mb = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);
    return fail(413, "too-large", `That image is over the ${mb} MB limit we can clean up here.`);
  }

  // 3. Payload: JSON.parse then Zod. Either failure is bad-recipe with friendly
  //    copy — never a stack trace to an untrusted client.
  const rawPayload = form.get("payload");
  if (typeof rawPayload !== "string") {
    return fail(400, "bad-recipe", "The erase 'payload' part must be a JSON string.");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
  } catch {
    return fail(400, "bad-recipe", "The cleanup request couldn't be read — its recipe wasn't valid JSON.");
  }
  const payloadResult = ErasePayloadSchema.safeParse(parsedJson);
  if (!payloadResult.success) {
    return fail(400, "bad-recipe", "That cleanup request wasn't in a shape we can process — please try again.");
  }
  const payload = payloadResult.data;

  // 4. Op-tag screen: the recipe slice must be renderable — the SAME rule the
  //    render route uses. `erase` is allowed (prior erase ops replay into the
  //    fill input); eraseFill strips adjust/autoEnhance/overlay ops before
  //    compiling, but a non-renderable tag is still rejected here first.
  for (const op of payload.recipe) {
    if (!isRenderableOp(op)) {
      return fail(422, "unsupported-op", `'${op.op}' ops can't be part of a cleanup preview.`);
    }
  }

  //    The recipe here is the PRIOR slice — approving this preview adds one more
  //    erase op. Gate against MAX_ERASE_OPS NOW (>= — the op being previewed is
  //    the +1), or the export route's own cap would later reject a document this
  //    route happily helped create, stranding an approved edit (the render
  //    collector counts the full applied recipe).
  const priorErases = payload.recipe.filter((op) => op.op === "erase").length;
  if (priorErases >= MAX_ERASE_OPS) {
    return fail(400, "bad-recipe", `This photo already has ${MAX_ERASE_OPS} cleaned-up areas — undo one before removing more.`);
  }

  // 5. Mask part: a grayscale-on-black PNG (the ErasePayloadSchema mask contract
  //    — luminance is the fill factor, alpha is ignored). Size-cap → sniff PNG →
  //    header dims must equal the declared mask dims, all before the jail. A
  //    supplementary raster part, so a cap/shape miss is a 400 bad-recipe (the
  //    overlay-part precedent), not a 413.
  const maskPart = form.get("mask");
  if (!(maskPart instanceof File)) {
    return fail(400, "bad-recipe", "Attach the brushed mask as the 'mask' part.");
  }
  if (maskPart.size > MAX_MASK_BYTES) {
    const mb = Math.round(MAX_MASK_BYTES / 1024 / 1024);
    return fail(400, "bad-recipe", `The brush mask is over the ${mb} MB limit.`);
  }
  const mask = Buffer.from(await maskPart.arrayBuffer());
  if (sniffImageMime(mask) !== "image/png") {
    return fail(400, "bad-recipe", "The brush mask must be a PNG image.");
  }
  const maskDims = imageDimensions(mask, "image/png");
  if (!maskDims || maskDims.width !== payload.mask.width || maskDims.height !== payload.mask.height) {
    return fail(400, "bad-recipe", `The brush mask must be a ${payload.mask.width}×${payload.mask.height} image to match the request.`);
  }

  // 6. Prior erase patches: the `erase:<id>` parts for any erase ops already in
  //    the recipe, so the jail replay composites them into the fill input just as
  //    export does (the shared collector — same gate as the render route).
  const eraseResult = await collectErasePatches(form, payload.recipe);
  if (!eraseResult.ok) return failFrom(eraseResult.code, eraseResult.message);

  const master = Buffer.from(await file.arrayBuffer());

  // AV seam (§3.6) — same logging stub as import; nothing scans yet.
  await avScanHook(file.name, master);

  // 7. Run the classical fill in the jail. eraseFill strips adjust/overlay ops
  //    defensively, validates the rect against the compiled output dims, and
  //    returns the patch bytes; a kill/typed failure maps onto the shared table.
  const result = await eraseFill(master, payload, mask, eraseResult.attachments);
  if (!result.ok) return failFrom(result.code, result.message);

  // SUCCESS: stream the patch PNG back as binary (never cached — it is derived
  // from client-held bytes and approved into the op by the PreviewApproveBar).
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(result.bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
