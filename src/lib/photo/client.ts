/**
 * The browser side of the photo seam (plan §3.2 / §10.7): the ONLY module that
 * talks to /api/photo/*. UI components call these functions and hand the result
 * to the store's `openDocument` — no component fetches the endpoint directly,
 * which is what keeps the POC intake/render service swappable for the
 * production conversion service (the import/client.ts pattern).
 *
 * Every response is Zod-validated here: a swapped backend that drifts from the
 * schema fails loudly at this seam, never as a broken canvas.
 */

import {
  IntakeResponseSchema,
  PhotoDiagnosticsSchema,
  type IntakeError,
  type IntakeErrorCode,
  type IntakeImagePayload,
  type PhotoDiagnostics,
  type PhotoDocument,
} from "@/lib/schema/photo";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { assetIdFor, decodeBase64, sniffImageMime } from "@/lib/import/image-meta";
import { putAssetBlob } from "@/lib/assets/blob-store";

/** The result of an open attempt — a ready document, or a typed error for the
    CapabilityBanner (the server's friendly copy is shown verbatim). */
export type OpenPhotoOutcome =
  | { ok: true; doc: PhotoDocument }
  | { ok: false; error: IntakeError };

/** Fired before the network round-trip for browser-decodable types so the
    canvas paints instantly and the <2 s open budget is met locally; the server
    proxy upgrades the surface underneath once intake completes. */
export type LocalPreview = (bitmap: ImageBitmap) => void;

function fail(code: IntakeErrorCode, message: string): OpenPhotoOutcome {
  return { ok: false, error: { ok: false, code, message } };
}

/** ISO-BMFF `ftyp` box with a HEIC-family brand — HEIC isn't in the raster
    magic-byte set (image-meta), but it is a server-supported capability, so we
    recognize it here to let it reach intake instead of a false client reject. */
function looksHeic(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  if (head[4] !== 0x66 || head[5] !== 0x74 || head[6] !== 0x79 || head[7] !== 0x70) return false; // "ftyp"
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif"].includes(brand);
}

/** XML declaration or a root <svg> — SVG rasterizes server-side (jailed). */
function looksSvg(head: Uint8Array): boolean {
  const text = new TextDecoder().decode(head).trimStart().toLowerCase();
  return text.startsWith("<?xml") || text.startsWith("<svg");
}

function payloadToBlob(p: IntakeImagePayload): Blob {
  // decodeBase64 is isomorphic and returns a generic Uint8Array<ArrayBufferLike>;
  // re-wrap so the Blob part is a definite ArrayBuffer-backed view.
  const bytes = new Uint8Array(decodeBase64(p.b64));
  return new Blob([bytes], { type: p.mime });
}

/** Swap a filename's extension (BMP → the PNG we actually upload). */
function withExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name) + "." + ext;
}

/** Decode a browser-native bitmap and re-encode it to PNG on a canvas. Used for
    BMP (v1.4): prebuilt sharp ships no BMP codec, so the server never sees BMP —
    the browser decodes it and we upload PNG bytes instead. */
async function bitmapToPng(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("bmp re-encode produced no bytes");
  return blob;
}

const MAX_MB = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);

/**
 * The full open flow (plan §3.3 "Open"):
 *  1. client-side early rejects — size cap + content sniff (fast reject unknown);
 *  2. instant local preview (browser decode, best-effort — HEIC will fail here,
 *     that's fine, the server does the real decode);
 *  3. BMP special-case — decode + re-encode to PNG so the server never sees BMP;
 *  4. POST to intake, Zod-validate the response;
 *  5. on success — bytes into the (namespaced, non-destructive) blob store and a
 *     fresh PhotoDocument returned for the store to open.
 */
export async function openPhotoFile(file: File, onLocalPreview?: LocalPreview): Promise<OpenPhotoOutcome> {
  if (file.size > MAX_PHOTO_BYTES) {
    return fail("too-large", `That photo is ${(file.size / 1024 / 1024).toFixed(0)} MB — over the ${MAX_MB} MB limit. Try a smaller file.`);
  }

  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const sniffed = sniffImageMime(head);
  const recognized = sniffed !== undefined || looksHeic(head) || looksSvg(head);
  if (!recognized) {
    return fail("not-an-image", "That doesn't look like an image file. Open a JPG, PNG, WEBP, TIFF, or HEIC photo.");
  }

  // Instant local preview + BMP re-encode share one decode. createImageBitmap
  // fails for HEIC/SVG in the browser — caught, preview simply skipped.
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }
  if (bitmap && onLocalPreview) onLocalPreview(bitmap);

  let uploadBlob: Blob = file;
  let uploadName = file.name;
  if (sniffed === "image/bmp") {
    if (!bitmap) return fail("decode-failed", "Couldn't read that BMP. Re-save it as PNG or JPG and try again.");
    try {
      uploadBlob = await bitmapToPng(bitmap);
      uploadName = withExt(file.name, "png");
    } catch {
      return fail("decode-failed", "Couldn't convert that BMP. Re-save it as PNG or JPG and try again.");
    }
  }

  const body = new FormData();
  body.append("file", uploadBlob, uploadName);

  let json: unknown;
  try {
    const res = await fetch("/api/photo/intake", { method: "POST", body });
    json = await res.json();
  } catch {
    return fail("engine-error", "The photo service is unreachable — check your connection and try again.");
  }

  const parsed = IntakeResponseSchema.safeParse(json);
  if (!parsed.success) {
    return fail("engine-error", "The photo service returned an unexpected response.");
  }
  if (!parsed.data.ok) {
    // A typed server error — pass its friendly copy straight to the banner.
    return { ok: false, error: parsed.data };
  }

  const success = parsed.data;

  // Namespaced, content-derived ids (v1.4): the blob store is shared with layout
  // assets, so photo writes carry a `photo:` prefix and never call the store's
  // replace/clear helpers (those wipe the whole shared store).
  const base = `photo:${assetIdFor(success.master.b64)}`;
  const masterId = `${base}:master`;
  const proxyId = `${base}:proxy`;
  await putAssetBlob(masterId, payloadToBlob(success.master));
  await putAssetBlob(proxyId, payloadToBlob(success.proxy));

  const doc: PhotoDocument = {
    version: 1,
    name: file.name,
    source: {
      assetId: masterId,
      proxyAssetId: proxyId,
      masterMime: success.master.mime,
      width: success.master.width,
      height: success.master.height,
      proxyWidth: success.proxy.width,
      proxyHeight: success.proxy.height,
      originalName: success.meta.originalName,
      colorSpace: success.meta.colorSpace,
      intakeNotes: success.meta.notes,
    },
    target: {
      size: null,
      product: null,
      bleed: 0,
      intent: success.meta.colorSpace === "cmyk" ? "cmyk" : "srgb",
    },
    recipe: [],
    cursor: 0,
  };
  return { ok: true, doc };
}

/**
 * The `/photo?demo=1` entry point: fetch the committed corpus photo, wrap it as
 * a File, and run it through the same open flow. The demo asset ships from
 * another stream — this codes against it existing at /photo-demo.jpg.
 */
export async function loadDemoPhoto(onLocalPreview?: LocalPreview): Promise<OpenPhotoOutcome> {
  let file: File;
  try {
    const res = await fetch("/photo-demo.jpg");
    if (!res.ok) throw new Error(`demo fetch ${res.status}`);
    const blob = await res.blob();
    file = new File([blob], "IMG_4823.jpg", { type: blob.type || "image/jpeg" });
  } catch {
    return fail("engine-error", "Couldn't load the demo photo — is /photo-demo.jpg deployed?");
  }
  return openPhotoFile(file, onLocalPreview);
}

/**
 * GET /api/photo — the capability matrix (mode + per-format support). Returns
 * null when the endpoint is unreachable or drifts from the schema; callers
 * surface an honest "diagnostics unavailable" rather than guessing.
 */
export async function fetchPhotoDiagnostics(): Promise<PhotoDiagnostics | null> {
  try {
    const res = await fetch("/api/photo");
    const json = await res.json();
    const parsed = PhotoDiagnosticsSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
