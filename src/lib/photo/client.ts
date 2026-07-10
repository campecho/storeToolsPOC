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
  RenderErrorSchema,
  type IntakeError,
  type IntakeErrorCode,
  type IntakeImagePayload,
  type PhotoDiagnostics,
  type PhotoDocument,
  type PhotoIntent,
  type RenderError,
  type RenderFormat,
  type RenderPayload,
} from "@/lib/schema/photo";
import { MAX_PHOTO_BYTES } from "@/lib/photo/limits";
import { assetIdFor, decodeBase64, sniffImageMime } from "@/lib/import/image-meta";
import { getAssetUrl, putAssetBlob } from "@/lib/assets/blob-store";

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

  // Optional CMYK-preserving intake leg (§1.3, v1.4): a CMYK arrival that rode
  // the jailed lcms (tificc) seam ships a 4-channel `cmykMaster` payload ALONGSIDE
  // the sRGB working master, so the no-re-separation TIFF export (renderPhoto)
  // can send those 4-channel bytes untouched. Additive/optional on the intake
  // response — present only for CMYK arrivals; the dominant RGB path omits it.
  const cmykPayload = success.cmykMaster;

  // Namespaced, content-derived ids (v1.4): the blob store is shared with layout
  // assets, so photo writes carry a `photo:` prefix and never call the store's
  // replace/clear helpers (those wipe the whole shared store).
  const base = `photo:${assetIdFor(success.master.b64)}`;
  const masterId = `${base}:master`;
  const proxyId = `${base}:proxy`;
  await putAssetBlob(masterId, payloadToBlob(success.master));
  await putAssetBlob(proxyId, payloadToBlob(success.proxy));

  // The preserved-CMYK master rides its own namespaced blob (`photo:<id>:cmyk`)
  // and its id enters source.cmykAssetId (the no-re-separation upload rule).
  let cmykId: string | undefined;
  if (cmykPayload) {
    cmykId = `${base}:cmyk`;
    await putAssetBlob(cmykId, payloadToBlob(cmykPayload));
  }

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
      ...(cmykId ? { cmykAssetId: cmykId } : {}),
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

/* ------------------------------------------------------------------ */
/* Render / export (POST /api/photo/render) — plan §3.3 "Export", PE3  */
/* ------------------------------------------------------------------ */

/** Build a RenderError-shaped object so EVERY failure out of `renderPhoto`
    carries the same typed contract — a server error (parsed from the response),
    a network fault, or a missing local master all reach the panel as one shape,
    and the panel shows `.message` verbatim. */
function renderFail(code: RenderError["code"], message: string): RenderError {
  return { ok: false, code, message };
}

/** Narrow a caught value to a RenderError (the panel's `catch` is `unknown`).
    `renderPhoto` only ever throws RenderErrors, but a type guard keeps the call
    site honest against anything else that could bubble up. */
export function isRenderError(err: unknown): err is RenderError {
  return RenderErrorSchema.safeParse(err).success;
}

/** Read the working-master bytes back out of the blob store. The bytes live as a
    Blob under `doc.source.assetId`; the store hands back a cached object URL, so
    we fetch that URL to recover the Blob. A missing blob (cleared store, evicted
    IndexedDB) is a friendly typed error rather than a thrown TypeError. */
async function loadMasterBlob(assetId: string): Promise<Blob> {
  const url = await getAssetUrl(assetId);
  if (!url) {
    throw renderFail(
      "engine-error",
      "This photo's image data is missing — reopen the photo and try exporting again.",
    );
  }
  try {
    const res = await fetch(url);
    return await res.blob();
  } catch {
    throw renderFail(
      "engine-error",
      "Couldn't read this photo's image data — reopen the photo and try again.",
    );
  }
}

/** File-name stem + `-edited.` + the format's real extension.
    "IMG_4823.jpg" + jpeg → "IMG_4823-edited.jpg"; png → ".png"; tiff → ".tif";
    pdf → ".pdf" (the print pair, PE5). */
const EXPORT_EXT: Record<RenderFormat, string> = {
  jpeg: "jpg",
  png: "png",
  tiff: "tif",
  pdf: "pdf",
};

function suggestedExportName(name: string, format: RenderFormat): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}-edited.${EXPORT_EXT[format]}`;
}

/** Read a boolean-ish response header the render route MAY set (X-Photo-*).
    Present + not "0"/"false"/"" → true; absent → false. Robust to the header
    not being shipped yet (the sibling render route is mid-flight). */
function headerFlag(res: Response, name: string): boolean {
  const v = res.headers.get(name);
  if (v == null) return false;
  const t = v.trim().toLowerCase();
  return t !== "" && t !== "0" && t !== "false" && t !== "no";
}

/** The outcome of a successful export: the bytes, a suggested filename, and the
    two advisory response-header flags the render route MAY set (PE5) — surfaced
    as a small post-export note in the panel. Both default false when the route
    hasn't shipped the headers yet. */
export interface RenderResult {
  blob: Blob;
  suggestedName: string;
  /** X-Photo-Reseparated: the export re-separated RGB→CMYK through GRACoL (vs.
      passing preserved 4-channel CMYK straight through). */
  reseparated: boolean;
  /** X-Photo-Intent-Downgraded: a requested CMYK intent fell back to sRGB (e.g.
      PNG can't carry CMYK), so the file shipped sRGB. */
  intentDowngraded: boolean;
  /** X-Photo-Cmyk-Preserved: the export shipped the preserved 4-channel CMYK
      master untouched (the no-re-separation path, §1.3 v1.4). */
  cmykPreserved: boolean;
}

/**
 * Full-resolution export (plan §4 PE3, print colour + boxes PE5). Replays the
 * recipe server-side against the working master and returns the encoded bytes
 * ready to save.
 *
 * Contract (BINDING — the sibling's render route + schema):
 *  - master bytes go up as multipart `file`; the render payload as `payload`
 *    (JSON of {recipe, format, quality, intent, printTarget?});
 *  - `recipe` is `doc.recipe.slice(0, doc.cursor)` — the APPLIED ops only; the
 *    redo tail after the cursor never renders (same rule the canvas draws by);
 *  - SUCCESS = a binary image body (image/jpeg|png|tiff, application/pdf);
 *  - ERROR = a JSON RenderError + 4xx/5xx — parsed here and re-thrown typed so
 *    the panel surfaces the server's friendly `message` verbatim;
 *  - a network fault is reshaped to a RenderError too, so callers only ever see
 *    the one typed failure shape.
 *
 * PRESERVED-CMYK UPLOAD RULE (§1.3, v1.4 — the no-re-separation path): when the
 * export intent is CMYK, the source carried a preserved-CMYK master
 * (`source.cmykAssetId`, from the lcms intake leg), the applied recipe is EMPTY
 * (no op forces a re-decode through sRGB), and the format is TIFF, we upload the
 * 4-channel CMYK master blob INSTEAD of the sRGB working master — so those bytes
 * ride to the encoder untouched, never round-tripping through RGB. EVERY OTHER
 * combination (any op applied, non-TIFF, RGB arrival, sRGB intent) uploads the
 * working master and lets the render host's colour pass do the separation.
 */
export async function renderPhoto(
  doc: PhotoDocument,
  opts: {
    format: RenderFormat;
    quality?: number;
    /** Defaults to the document's export intent (dev #6) when omitted. */
    intent?: PhotoIntent;
    /** Print target in INCHES for the PDF box math; defaults from doc.target. */
    printTarget?: { w: number; h: number; bleed: number };
  },
): Promise<RenderResult> {
  // Applied ops only — ops[0..cursor). The tail past the cursor is the redo
  // stack and must not reach the render (plan §3.4 cursor semantics).
  const recipe = doc.recipe.slice(0, doc.cursor);
  const intent = opts.intent ?? doc.target.intent;

  // Preserved-CMYK rule — send the 4-channel master bytes only when EVERY
  // condition holds; otherwise the sRGB working master.
  const preserveCmyk =
    intent === "cmyk" &&
    doc.source.cmykAssetId != null &&
    recipe.length === 0 &&
    opts.format === "tiff";
  const uploadAssetId = preserveCmyk ? doc.source.cmykAssetId! : doc.source.assetId;
  const master = await loadMasterBlob(uploadAssetId);

  // The print target rides the payload only when a size is set (PDF box math).
  const printTarget =
    opts.printTarget ??
    (doc.target.size
      ? { w: doc.target.size.w, h: doc.target.size.h, bleed: doc.target.bleed }
      : undefined);

  const payload: RenderPayload = {
    recipe,
    format: opts.format,
    quality: opts.quality ?? 90,
    // The document's export intent rides every render (dev #6) — the PE5
    // panel makes it user-switchable; CMYK separates through GRACoL.
    intent,
    ...(printTarget ? { printTarget } : {}),
  };

  const body = new FormData();
  body.append("file", master, doc.source.originalName);
  body.append("payload", JSON.stringify(payload));

  let res: Response;
  try {
    res = await fetch("/api/photo/render", { method: "POST", body });
  } catch {
    throw renderFail(
      "engine-error",
      "The render service is unreachable — check your connection and try again.",
    );
  }

  if (!res.ok) {
    // A typed server error — parse the RenderError JSON and re-throw it so its
    // counter-ready copy reaches the panel unchanged.
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw renderFail("engine-error", "The render service returned an error we couldn't read.");
    }
    const parsed = RenderErrorSchema.safeParse(json);
    throw parsed.success
      ? parsed.data
      : renderFail("engine-error", "The render service returned an unexpected error.");
  }

  // SUCCESS: the response body IS the encoded image. Surface the two advisory
  // colour-path headers if the render route set them (both false if not shipped).
  const blob = await res.blob();
  return {
    blob,
    suggestedName: suggestedExportName(doc.name, opts.format),
    reseparated: headerFlag(res, "X-Photo-Reseparated"),
    intentDowngraded: headerFlag(res, "X-Photo-Intent-Downgraded"),
    cmykPreserved: headerFlag(res, "X-Photo-Cmyk-Preserved"),
  };
}

/**
 * Save a Blob to the associate's disk. THIS IS THE REPO'S FIRST SAVE-TO-DISK
 * AFFORDANCE — nothing anywhere else in the POC writes a file out (plan §1.2
 * finding 2: "no export/download path anywhere"). Handle this seam with care:
 * we mint a throwaway object URL, drive a hidden `<a download>`, then revoke the
 * URL so the bytes aren't pinned in memory. The revoke is deferred a tick — some
 * browsers cancel an in-flight download if the URL dies in the same frame as the
 * click.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  // Attaching to the DOM makes the synthetic click fire in every browser
  // (Firefox in particular ignores a click on a detached anchor).
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
