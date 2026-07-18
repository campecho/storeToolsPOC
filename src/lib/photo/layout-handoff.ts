/**
 * "Open in Layout Editor →" handoff (PE7) — the photo-editor → layout-editor
 * leg. Kept OUT of client.ts and the two stores so the seam stays swappable:
 * this module is the only place that wires renderPhoto, the shared blob store,
 * and the layout store's asset library together for the conversion path.
 *
 *   openInLayoutEditor — flatten the applied recipe to a full-resolution PNG,
 *     register it as a layout asset (same {id, name, kind, mime, dims, bytes}
 *     shape the Assets-panel upload produces), place it via the layout store's
 *     normal placement logic (one undoable layout step, exactly like clicking an
 *     asset tile), then navigate to /layout.
 *
 * Every failure is a typed {ok:false, message}; nothing thrown reaches the panel.
 */

import type { useRouter } from "next/navigation";
import type { PhotoDocument } from "@/lib/schema/photo";
import { putAssetBlob } from "@/lib/assets/blob-store";
import { assetIdFor } from "@/lib/import/image-meta";
import { renderPhoto, isRenderError } from "@/lib/photo/client";
import { usePhotoStore } from "@/lib/store/photo-store";
import { useLayoutStore } from "@/lib/store/layout-store";

/** The slice of the App Router this handoff needs — just `push`. Derived from the
    real router type so it satisfies Next's typed-routes `push` signature. */
export type PushRouter = Pick<ReturnType<typeof useRouter>, "push">;

/** One typed outcome for the panel: success (it has navigated) or a friendly
    message to surface inline. No thrown error ever reaches the caller. */
export type LayoutHandoffResult = { ok: true } | { ok: false; message: string };

/** The layout asset's library label: the photo doc's filename re-stemmed to
    `.png` (the handoff always renders PNG). "IMG_4823.jpg" → "IMG_4823.png". */
export function layoutAssetName(docName: string): string {
  const trimmed = docName.trim();
  const dot = trimmed.lastIndexOf(".");
  const stem = (dot > 0 ? trimmed.slice(0, dot) : trimmed) || "photo";
  return `${stem}.png`;
}

/**
 * Pixel dimensions from a PNG's IHDR — width/height are big-endian u32s at byte
 * offsets 16 and 20, right after the 8-byte signature. Returns null for anything
 * that isn't a well-formed PNG so the caller falls back to the placement helper's
 * minimum-size behaviour instead of placing a zero-sized frame. The handoff only
 * ever renders PNG, so this is the single decode path we need.
 */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // \x89 P N G signature.
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** A fresh, content-derived id for the flattened result. The render is a pure
    function of (working-master bytes, applied recipe) and the master id is itself
    content-derived, so hashing that pair yields a stable id — the same handoff
    re-run overwrites the same blob, a different edit gets a different one. The
    `photo:` namespace + `:layout` suffix keeps it clear of the store's other legs
    (the shared blob store is namespaced per §1.4). */
function handoffAssetId(doc: PhotoDocument): string {
  const key = JSON.stringify({
    src: doc.source.assetId,
    recipe: doc.recipe.slice(0, doc.cursor),
  });
  return `photo:${assetIdFor(key)}:layout`;
}

/**
 * Photo Editor → Layout Editor (PE7 "Open in Layout Editor"). Renders the applied
 * recipe to a full-resolution PNG, stores it under a namespaced blob id, registers
 * it in the layout asset library, and places it with the store's normal placement
 * logic — the same one undoable step an asset-tile click produces (bind to a
 * selected picture frame, else a new centered picture frame). Then navigates.
 *
 * `rendering` guards a concurrent render (shared with Export) and is always
 * cleared. Errors surface inline via the panel; render failures carry the
 * server's friendly RenderError.message verbatim.
 */
export async function openInLayoutEditor(
  doc: PhotoDocument,
  router: PushRouter,
): Promise<LayoutHandoffResult> {
  const photo = usePhotoStore.getState();
  photo.setRendering(true);
  try {
    const result = await renderPhoto(doc, { format: "png" });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const size = readPngSize(bytes);

    const assetId = handoffAssetId(doc);
    await putAssetBlob(assetId, result.blob);

    const layout = useLayoutStore.getState();
    // Same metadata shape importAssetFile writes (id/name/kind/mime/dims/bytes),
    // so the placed frame sizes and renders exactly like an uploaded image.
    layout.addAsset({
      id: assetId,
      name: layoutAssetName(doc.name),
      kind: "image",
      mime: "image/png",
      width: size?.width,
      height: size?.height,
      bytes: result.blob.size,
    });
    // Normal placement logic: one undoable layout step, selects the frame.
    layout.placeAsset(assetId);

    router.push("/layout");
    return { ok: true };
  } catch (err) {
    const message = isRenderError(err)
      ? err.message
      : "Couldn't prepare the picture for the Layout Editor — try again.";
    console.warn("[layout-handoff] Open in Layout Editor failed:", message);
    return { ok: false, message };
  } finally {
    photo.setRendering(false);
  }
}
