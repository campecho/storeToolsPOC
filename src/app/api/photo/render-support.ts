import { NextResponse } from "next/server";
import { imageDimensions, sniffImageMime } from "@/lib/import/image-meta";
import { isGeometryOp } from "@/lib/photo/geometry";
import { MAX_ERASE_OPS, MAX_ERASE_PATCH_BYTES } from "@/lib/photo/limits";
import {
  RenderErrorSchema,
  type PhotoOp,
  type RenderError,
  type RenderErrorCode,
} from "@/lib/schema/photo";

/**
 * Shared server glue for the two photo render surfaces — the export spine
 * (render/route.ts) and the erase-preview route (erase/route.ts, PE9). Both
 * screen recipe ops the SAME way, map failures onto the SAME status table, and
 * collect the SAME stored-explicit erase patch parts, so those rules live here
 * once rather than drifting across two handlers (the client is untrusted; a rule
 * that differs between routes is a hole). SERVER-ONLY: builds NextResponses.
 */

/** HTTP status for each render failure code (plan §4 PE3 mapping). */
export const STATUS_FOR: Record<RenderErrorCode, number> = {
  "bad-recipe": 400,
  "unsupported-op": 422,
  "too-large": 413,
  "too-many-pixels": 413,
  "decode-failed": 422,
  timeout: 504,
  "engine-error": 500,
};

/** Build a schema-checked JSON error (dev asserts the contract; tests too). */
export function fail(status: number, code: RenderErrorCode, message: string): NextResponse {
  const body: RenderError = { ok: false, code, message };
  if (process.env.NODE_ENV !== "production") RenderErrorSchema.parse(body);
  return NextResponse.json(body, { status });
}

/** A typed failure ({code, message}) → the schema-checked JSON response, status
    from the shared table. The bridge between the collector helpers (which return
    a code, not a NextResponse) and either route. */
export function failFrom(code: RenderErrorCode, message: string): NextResponse {
  return fail(STATUS_FOR[code] ?? 500, code, message);
}

/**
 * The op tags the render spine can replay: geometry (crop/rotate/flip/straighten
 * + the PE5 print-geometry ops, via isGeometryOp), PE4 tone/colour
 * (adjust/autoEnhance), the PE6 overlay ops (ACCEPTED and IGNORED by the geometry
 * fold — the pre-rendered rasters ride the `overlays` sidecar), and the PE9 erase
 * op (compiles to an inline patch composite; its patch raster rides an
 * `erase:<id>` part). Every current PhotoOp tag is renderable, so the route
 * op-screen is now defence in depth — it still names a future non-renderable tag
 * cleanly rather than letting it reach the jail.
 */
export function isRenderableOp(op: PhotoOp): boolean {
  return (
    isGeometryOp(op) ||
    op.op === "adjust" ||
    op.op === "autoEnhance" ||
    op.op === "textOverlay" ||
    op.op === "logoOverlay" ||
    op.op === "erase"
  );
}

/**
 * Collect, validate, and re-key the STORED-EXPLICIT erase patch rasters (PE9,
 * §3.3, §3.6) — the SAME untrusted-raster gate collectOverlays runs, shared by
 * the export replay (render route) and the fill-input replay (erase route, for
 * PRIOR erase ops). Every `erase` op in the recipe carries a `patch` (id + rect);
 * its pixels ride a SEPARATE multipart part `erase:<patch.id>`, one per op.
 * Failures BEFORE a byte reaches the jail:
 *   • an erase op with no `erase:<id>` part → bad-recipe;
 *   • an `erase:<id>` part with no matching erase op → bad-recipe;
 *   • a part over MAX_ERASE_PATCH_BYTES → bad-recipe (the DoS guard);
 *   • decoded PNG header dims ≠ the op's rect w×h → bad-recipe;
 *   • more than MAX_ERASE_OPS erase ops → bad-recipe.
 * Placement bounds are NOT checked here (unlike overlays): an erase rect addresses
 * the MID-RECIPE effective image, which this route can't cheaply know without
 * replaying geometry — compileRenderPlan's per-op clamp (render-host) is the
 * bound. The dims read is a cheap HEADER sniff (no decode — sharp never runs in
 * this process, §3.6); the worker's decode+resize+composite is the real re-encode
 * that sanitizes the raster. On success the map is keyed by the jail-local
 * basename `erase-<id>.png` the composite steps reference; `attachments` is left
 * undefined when the recipe carries no erase op (so the caller keeps `undefined`
 * and the CMYK identity-preserve fast path still triggers).
 */
export async function collectErasePatches(
  form: FormData,
  recipe: PhotoOp[],
): Promise<
  { ok: true; attachments?: Record<string, Buffer> } | { ok: false; code: RenderErrorCode; message: string }
> {
  const eraseOps = recipe.filter((op): op is Extract<PhotoOp, { op: "erase" }> => op.op === "erase");

  // Gather every `erase:<id>` part up front so an orphan part (no matching op) is
  // caught even when the recipe declares none.
  const parts = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("erase:")) continue;
    if (!(value instanceof File)) {
      return { ok: false, code: "bad-recipe", message: `The erase part '${key}' must be an uploaded image.` };
    }
    parts.set(key.slice("erase:".length), value);
  }

  if (eraseOps.length === 0 && parts.size === 0) return { ok: true };

  if (eraseOps.length > MAX_ERASE_OPS) {
    return { ok: false, code: "bad-recipe", message: `Too many erase steps to render at once (limit ${MAX_ERASE_OPS}).` };
  }

  const declaredIds = new Set(eraseOps.map((op) => op.patch.id));
  for (const id of parts.keys()) {
    if (!declaredIds.has(id)) {
      return { ok: false, code: "bad-recipe", message: `Erase patch 'erase:${id}' has no matching erase step in the request.` };
    }
  }

  const attachments: Record<string, Buffer> = {};
  for (const op of eraseOps) {
    const id = op.patch.id;
    const part = parts.get(id);
    if (!part) {
      return { ok: false, code: "bad-recipe", message: `Erase step '${id}' is missing its patch part 'erase:${id}'.` };
    }
    if (part.size > MAX_ERASE_PATCH_BYTES) {
      const mb = Math.round(MAX_ERASE_PATCH_BYTES / 1024 / 1024);
      return { ok: false, code: "bad-recipe", message: `Erase patch '${id}' is over the ${mb} MB limit for a placed image.` };
    }
    const bytes = Buffer.from(await part.arrayBuffer());
    const mime = sniffImageMime(bytes);
    const dims = mime ? imageDimensions(bytes, mime) : undefined;
    const rectW = Math.max(1, Math.round(op.patch.rect.w));
    const rectH = Math.max(1, Math.round(op.patch.rect.h));
    if (!dims || dims.width !== rectW || dims.height !== rectH) {
      return { ok: false, code: "bad-recipe", message: `Erase patch '${id}' must be a ${rectW}×${rectH} image to match its placement.` };
    }
    attachments[`erase-${id}.png`] = bytes;
  }

  return { ok: true, attachments };
}
