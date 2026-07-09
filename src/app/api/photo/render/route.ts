import { NextResponse } from "next/server";
// One AV seam for the whole suite: reuse the import stack's logging stub
// (plan §3.6 — "same seam as import"). Nothing scans yet; the call site exists
// so the engine decision has a single place to fill.
import { avScanHook } from "@/lib/import/pub2raw";
import { isGeometryOp } from "@/lib/photo/geometry";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { renderImage } from "@/lib/photo/render-host";
import {
  RenderErrorSchema,
  RenderPayloadSchema,
  type RenderError,
  type RenderErrorCode,
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
 * The tranche each non-geometry op renders from, for the `unsupported-op`
 * message ("'adjust' ops render from PE4"). Geometry ops (crop/rotate/flip/
 * straighten) render here and are absent from this map.
 */
const OP_TRANCHE: Record<string, string> = {
  adjust: "ops render from PE4",
  autoEnhance: "ops render from PE4",
  resize: "ops render from PE5",
  bleedExpand: "ops render from PE5",
  fitToSize: "ops render from PE5",
  textOverlay: "ops render from PE6",
  logoOverlay: "ops render from PE6",
  erase: "ops render from PE9",
};

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

  // 4. Op-tag screen: only crop/rotate/flip/straighten render at PE3. Name the
  //    first offender and its tranche so the panel can explain the wait.
  for (const op of payload.recipe) {
    if (!isGeometryOp(op)) {
      const tranche = OP_TRANCHE[op.op] ?? "ops aren't supported yet";
      return fail(422, "unsupported-op", `'${op.op}' ${tranche} — export supports crop, rotate, flip, and straighten for now.`);
    }
  }

  const master = Buffer.from(await file.arrayBuffer());

  // AV seam (§3.6) — same logging stub as import; nothing scans yet.
  await avScanHook(file.name, master);

  // 5. Replay in the jail. The master bytes drop out of scope after this call
  //    (nothing persists them — the stateless-server posture, §1.4).
  const result = await renderImage(master, payload);
  if (!result.ok) {
    return fail(STATUS_FOR[result.code] ?? 500, result.code, result.message);
  }

  // SUCCESS: stream the encoded bytes back as binary (never cached — the render
  // is derived from client-held bytes, not a durable resource).
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.mime,
      "Content-Length": String(result.bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
