import { NextResponse } from "next/server";
import { sniffImageMime } from "@/lib/import/image-meta";
// One AV seam for the whole suite: reuse the import stack's logging stub
// (plan §3.6 — "same seam as import"). Nothing scans yet; the seam exists so
// the engine decision (ClamAV vs commercial) has a single call site to fill.
import { avScanHook } from "@/lib/import/pub2raw";
import { convertHeicToJpeg, heicAvailable } from "@/lib/photo/heic";
import { cmykPreservePath, tificcAvailable } from "@/lib/photo/lcms";
import { MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS } from "@/lib/photo/limits";
import { intakeImage, type IntakeHostOutcome } from "@/lib/photo/render-host";
import { IntakeResponseSchema, type IntakeImagePayload, type IntakeResponse } from "@/lib/schema/photo";

/**
 * POST /api/photo/intake — the photo on-ramp (plan §3.3, §4 PE1). The client
 * is UNTRUSTED: a multipart upload is sniffed by its bytes (never the
 * extension/declared type), capped, AV-hooked, then decoded OUT OF PROCESS in
 * a jail (render-host.ts). The jail re-encodes a sanitized working master +
 * screen proxy and the ORIGINAL BYTES ARE DROPPED here — that transcode IS the
 * CDR sanitizer and the PII-ephemerality posture in one move (§3.6).
 *
 * CONTRACT: every response is exactly `IntakeResponseSchema` — a success leg
 * with base64 master/proxy + meta, or a typed error leg with counter-ready
 * copy. The shape is asserted in dev (below) and covered by the route tests.
 */

export const runtime = "nodejs";

/** Format sniffs the jail can actually decode (sharp/libvips + librsvg). */
const JAIL_DECODABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/svg+xml",
]);

/** Build a schema-checked JSON response (dev asserts the contract; tests too). */
function reply(status: number, body: IntakeResponse): NextResponse {
  if (process.env.NODE_ENV !== "production") IntakeResponseSchema.parse(body);
  return NextResponse.json(body, { status });
}

/** Typed error reply (keeps the discriminated code literal-checked). */
function fail(
  status: number,
  code:
    | "not-an-image"
    | "unsupported-here"
    | "too-large"
    | "too-many-pixels"
    | "decode-failed"
    | "timeout"
    | "engine-error",
  message: string,
): NextResponse {
  return reply(status, { ok: false, code, message });
}

/** Map a render-host outcome's failure onto the route's code + HTTP status. */
function mapHostFailure(outcome: Extract<IntakeHostOutcome, { ok: false }>): NextResponse {
  const mp = Math.round(MAX_PHOTO_PIXELS / 1_000_000);
  switch (outcome.error) {
    case "too-many-pixels":
      return fail(413, "too-many-pixels", `That image is over the ${mp} MP limit we can open here — try a smaller export.`);
    case "timeout":
      return fail(504, "timeout", "Opening that image took too long and was stopped — it may be damaged or extremely complex.");
    // resource-limit and a decode crash both surface as decode-failed (plan §4:
    // "resource-limit/decode death → decode-failed"); an RLIMIT_AS overrun is
    // the inherited pub2raw caveat — it dies at malloc and lands here.
    case "resource-limit":
    case "decode-failed":
      return fail(422, "decode-failed", "We couldn't open that image — it may be truncated, damaged, or not the format its bytes claim.");
    case "engine-error":
      return fail(500, "engine-error", "The image engine isn't available on this server right now — please try again.");
  }
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "not-an-image", "Expected a multipart form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "not-an-image", "Attach the image as the 'file' field.");
  }

  // Size cap BEFORE reading bytes into the jail (zip-bomb/DoS guard, §3.6) —
  // an oversize file never invokes the jail.
  if (file.size > MAX_PHOTO_BYTES) {
    const mb = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);
    return fail(413, "too-large", `That image is over the ${mb} MB limit. Try a smaller export.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Content-sniff — never trust the extension or declared type (§3.6).
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return fail(415, "not-an-image", "That file isn't an image we can open. It may be renamed or damaged.");
  }

  // HEIC: sniffed fine, but this server decodes it only where heif-convert is
  // installed — and PE1 ships the conversion stubbed regardless (the jailed
  // subprocess lands in PE7). Either way the honest answer is unsupported-here.
  if (mime === "image/heic") {
    if (!(await heicAvailable())) {
      return fail(
        422,
        "unsupported-here",
        "This server can't open HEIC (iPhone) photos yet — export a JPEG, or open it where HEIC decoding is installed.",
      );
    }
    const conv = await convertHeicToJpeg(bytes);
    if (!conv.ok) {
      return fail(422, "unsupported-here", "HEIC opening is coming soon — for now, export a JPEG from your phone.");
    }
    // PE7 wires the converted JPEG into intakeImage below; unreachable in PE1.
  }

  // BMP: prebuilt sharp ships no BMP codec — BMP opens client-side in the
  // browser's native decoder, so raw BMP reaching the server is a typed
  // unsupported-here (v1.4, §1.3).
  if (mime === "image/bmp") {
    return fail(422, "unsupported-here", "BMP images open right in your browser, not on the server — try re-adding the file.");
  }

  // Anything else sniffed-but-not-decodable here (wmf/emf metafiles): honest
  // unsupported-here rather than a jail decode we know will fail.
  if (!JAIL_DECODABLE.has(mime)) {
    return fail(422, "unsupported-here", "We can't open that image type here — try a JPEG, PNG, TIFF, WEBP, or SVG.");
  }

  // AV seam (§3.6) — same logging stub as import; nothing scans yet.
  await avScanHook(file.name, bytes);

  // Jailed decode → sanitized master + proxy. The original bytes drop out of
  // scope after this call (CDR — nothing persists them, §3.6).
  const outcome = await intakeImage(bytes, mime);
  if (!outcome.ok) return mapHostFailure(outcome);

  // CMYK-preserve seam (§1.3, PE5, v1.4): when a TIFF/JPEG arrives CMYK AND the
  // jailed tificc (lcms2-utils) path is available, keep the ORIGINAL bytes'
  // 4-channel separation — sharp's working master unpacked it to sRGB on decode.
  // The preserved TIFF rides back as a SECOND leg (cmykMaster) the client stores
  // under `photo:<id>:cmyk` and binds to source.cmykAssetId. Gated on the probe;
  // absent (this dev container) → the working RGB master is the only leg, honest.
  // (tificc reads TIFF only — a CMYK JPEG here fails the transform and falls back.)
  const notes = [...outcome.notes];
  let cmykMaster: IntakeImagePayload | undefined;
  const preserveEligible = (mime === "image/tiff" || mime === "image/jpeg") && outcome.colorSpace === "cmyk";
  if (preserveEligible && (await tificcAvailable())) {
    const preserved = await cmykPreservePath(bytes);
    if (preserved.ok) {
      cmykMaster = {
        b64: preserved.tiff.toString("base64"),
        mime: "image/tiff",
        // tificc preserves pixel dims and the working master keeps full res, so
        // the two legs share dimensions.
        width: outcome.master.width,
        height: outcome.master.height,
      };
      notes.push("Press-ready CMYK preserved alongside the working copy");
    }
  }

  return reply(200, {
    ok: true,
    master: {
      b64: outcome.master.bytes.toString("base64"),
      mime: outcome.master.mime,
      width: outcome.master.width,
      height: outcome.master.height,
    },
    proxy: {
      b64: outcome.proxy.bytes.toString("base64"),
      mime: outcome.proxy.mime,
      width: outcome.proxy.width,
      height: outcome.proxy.height,
    },
    ...(cmykMaster ? { cmykMaster } : {}),
    meta: {
      originalName: file.name,
      colorSpace: outcome.colorSpace,
      notes,
    },
  });
}
