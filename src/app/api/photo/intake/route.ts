import { NextResponse } from "next/server";
import { sniffImageMime } from "@/lib/import/image-meta";
// One AV seam for the whole suite: reuse the import stack's logging stub
// (plan §3.6 — "same seam as import"). Nothing scans yet; the seam exists so
// the engine decision (ClamAV vs commercial) has a single call site to fill.
import { avScanHook } from "@/lib/import/pub2raw";
import { convertHeicToJpeg, heicAvailable, type HeicConvertOutcome } from "@/lib/photo/heic";
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
    | "multi-page"
    | "too-large"
    | "too-many-pixels"
    | "decode-failed"
    | "timeout"
    | "engine-error",
  message: string,
): NextResponse {
  return reply(status, { ok: false, code, message });
}

/** Map a HEIC conversion failure onto the route's code + HTTP status (plan §4:
    timeout → timeout; resource-limit/decode-failed → decode-failed;
    unsupported-here → unsupported-here). */
function mapHeicFailure(error: Extract<HeicConvertOutcome, { ok: false }>["error"]): NextResponse {
  switch (error) {
    case "timeout":
      return fail(504, "timeout", "Opening that image took too long and was stopped — it may be damaged or extremely complex.");
    // A resource-limit death and an undecodable file both surface as
    // decode-failed — an RLIMIT_AS overrun is the inherited pub2raw caveat.
    case "resource-limit":
    case "decode-failed":
      return fail(422, "decode-failed", "We couldn't open that image — it may be truncated, damaged, or not the format its bytes claim.");
    case "unsupported-here":
      return fail(
        422,
        "unsupported-here",
        "This server can't open HEIC (iPhone) photos yet — export a JPEG, or open it where HEIC decoding is installed.",
      );
  }
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

  // Multi-page documents never open here — a PDF is a layout job, not a photo.
  // Checked BEFORE the sniff's not-an-image reject so the route-away copy wins
  // over the generic message (a PDF sniffs to no image mime otherwise).
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    return fail(
      422,
      "multi-page",
      "PDFs and other multi-page files don't open here — bring them into the Layout Editor instead.",
    );
  }

  // Content-sniff — never trust the extension or declared type (§3.6).
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return fail(415, "not-an-image", "That file isn't an image we can open. It may be renamed or damaged.");
  }

  // The bytes + mime the jail actually decodes. Everything decodes as sniffed
  // except HEIC, which sharp has no codec for: it is transcoded to JPEG in a
  // jail first (heic.ts) and the pipeline continues on that JPEG — the pixel cap
  // then applies to the DECODED JPEG (the enforcement point), like any arrival.
  let decodeBytes: Buffer = bytes;
  let decodeMime = mime;
  let convertedFromHeic = false;

  // HEIC: sniffed fine, but this server decodes it only where heif-convert is
  // installed. Absent → the honest unsupported-here; present → jailed transcode
  // to JPEG, mapping a conversion failure onto the route's codes (plan §4 PE7).
  if (mime === "image/heic") {
    if (!(await heicAvailable())) {
      return fail(
        422,
        "unsupported-here",
        "This server can't open HEIC (iPhone) photos yet — export a JPEG, or open it where HEIC decoding is installed.",
      );
    }
    const conv = await convertHeicToJpeg(bytes);
    if (!conv.ok) return mapHeicFailure(conv.error);
    decodeBytes = conv.jpeg;
    decodeMime = "image/jpeg";
    convertedFromHeic = true;
  }

  // BMP: prebuilt sharp ships no BMP codec — BMP opens client-side in the
  // browser's native decoder, so raw BMP reaching the server is a typed
  // unsupported-here (v1.4, §1.3).
  if (mime === "image/bmp") {
    return fail(422, "unsupported-here", "BMP images open right in your browser, not on the server — try re-adding the file.");
  }

  // Anything else sniffed-but-not-decodable here (wmf/emf metafiles): honest
  // unsupported-here rather than a jail decode we know will fail. A converted
  // HEIC is now `image/jpeg`, so it passes this gate.
  if (!JAIL_DECODABLE.has(decodeMime)) {
    return fail(422, "unsupported-here", "We can't open that image type here — try a JPEG, PNG, TIFF, WEBP, or SVG.");
  }

  // AV seam (§3.6) — same logging stub as import; nothing scans yet.
  await avScanHook(file.name, bytes);

  // Jailed decode → sanitized master + proxy. The decode bytes drop out of
  // scope after this call (CDR — nothing persists them, §3.6).
  const outcome = await intakeImage(decodeBytes, decodeMime);
  if (!outcome.ok) return mapHostFailure(outcome);

  // CMYK-preserve seam (§1.3, PE5, v1.4): when a TIFF/JPEG arrives CMYK AND the
  // jailed tificc (lcms2-utils) path is available, keep the ORIGINAL bytes'
  // 4-channel separation — sharp's working master unpacked it to sRGB on decode.
  // The preserved TIFF rides back as a SECOND leg (cmykMaster) the client stores
  // under `photo:<id>:cmyk` and binds to source.cmykAssetId. Gated on the probe;
  // absent (this dev container) → the working RGB master is the only leg, honest.
  // (tificc reads TIFF only — a CMYK JPEG here fails the transform and falls back.)
  const notes = [...outcome.notes];
  if (convertedFromHeic) notes.push("Converted from HEIC");
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
