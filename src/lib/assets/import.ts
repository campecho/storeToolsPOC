import type { Asset } from "@/schema";
import { putAssetBlob } from "./blob-store";

/**
 * Bringing a device file into the asset store (plan L9) — shared by the
 * Assets panel's importer and the canvas's fill-on-click file picker, so both
 * paths write the same metadata + blob.
 */

/** The drag payload MIME for an asset dragged out of the Assets panel (L9). */
export const ASSET_DND_TYPE = "application/x-stp-asset";

/** Image / PDF / unsupported — the two kinds the library accepts, else null. */
export function assetKind(mime: string): "image" | "pdf" | null {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return null;
}

/** Natural pixel size via an off-DOM <img> — an SVG without intrinsic size reads 0×0. */
function imageDims(file: File): Promise<{ w: number; h: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(undefined);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export type ImportResult = { ok: true; asset: Asset } | { ok: false; reason: "unsupported" };

/**
 * Write a file's bytes to the blob store and return its `Asset` metadata —
 * the caller adds it to `doc.assets` (and, for a frame fill, binds it).
 * Unsupported types are reported, never silently dropped.
 */
export async function importAssetFile(file: File): Promise<ImportResult> {
  const kind = assetKind(file.type);
  if (!kind) return { ok: false, reason: "unsupported" };
  const id = crypto.randomUUID();
  const dims = kind === "image" ? await imageDims(file) : undefined;
  await putAssetBlob(id, file);
  return {
    ok: true,
    asset: { id, name: file.name, kind, mime: file.type, width: dims?.w, height: dims?.h, bytes: file.size },
  };
}
