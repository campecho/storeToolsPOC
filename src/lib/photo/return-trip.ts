/**
 * Placed-picture round-trip orchestration (F2, PE8) — the layout-editor ⇄
 * photo-editor loop. Kept OUT of client.ts and the two stores so the seam stays
 * swappable: this module is the only place that wires the layout store's
 * `applyPhotoEdit`, the photo store's `returnContext`, and the render/intake
 * client together. Nothing here mutates client.ts or photo-store.ts.
 *
 *   openPlacedPictureInPhotoEditor — layout → photo: read the frame's asset
 *     bytes, run them through the same intake as any open, seed the return
 *     context, and navigate to /photo.
 *   finishReturnTrip ("Done")       — photo → layout: render the recipe to a PNG,
 *     store it as a new asset, land it on the frame as ONE revertable layout
 *     step, clear the context, and navigate back to /layout.
 *   cancelReturnTrip ("Cancel")     — photo → layout: a TRUE no-op on the layout
 *     document — clear the context, close the doc, navigate back. No layout
 *     mutation, so no history step.
 */

import type { useRouter } from "next/navigation";
import type { FrameObject } from "@/schema";
import type { PhotoDocument } from "@/lib/schema/photo";
import { getAssetUrl, putAssetBlob } from "@/lib/assets/blob-store";
import { assetIdFor } from "@/lib/import/image-meta";
import { openPhotoFile, renderPhoto, isRenderError } from "@/lib/photo/client";
import { usePhotoStore, type PhotoReturnContext } from "@/lib/store/photo-store";
import { useLayoutStore } from "@/lib/store/layout-store";

/** The slice of the App Router this loop needs — just `push`. Derived from the
    real router type so it satisfies Next's typed-routes `push` signature. */
export type PushRouter = Pick<ReturnType<typeof useRouter>, "push">;

/** Every entry/exit reports the same shape so call sites can surface the message
    through the layout editor's transient note or the banner's inline error. */
export type ReturnTripResult = { ok: true } | { ok: false; message: string };

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tif",
};

/** A readable File name for the intake leg — e.g. `Spring flyer picture.png`.
    Extension is cosmetic (intake sniffs by content, not name) but kept honest. */
function placedPictureName(docName: string, mime: string): string {
  const stem = docName.trim() || "layout";
  const ext = EXT_BY_MIME[mime] ?? "png";
  return `${stem} picture.${ext}`;
}

/**
 * Layout → Photo Editor (F2 entry). Reads the placed frame's bound asset bytes
 * out of the shared blob store, wraps them as a File, and runs the standard open
 * flow (openPhotoFile — the <2 s local-preview path rides along for free). On
 * success it opens the document in the photo store, seeds `returnContext` with
 * the frame's identity and its CURRENT asset (the revert anchor), and navigates.
 * On any failure it navigates nowhere and returns a friendly message.
 */
export async function openPlacedPictureInPhotoEditor(
  frame: FrameObject,
  layoutDocName: string,
  router: PushRouter,
): Promise<ReturnTripResult> {
  if (frame.type !== "picture" || !frame.assetId) {
    return { ok: false, message: "This picture frame has no image to edit yet." };
  }
  const assetId = frame.assetId;

  const url = await getAssetUrl(assetId);
  if (!url) {
    const message = "This picture's image data is missing — re-place the image and try again.";
    console.warn("[return-trip] " + message);
    return { ok: false, message };
  }

  let file: File;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    file = new File([blob], placedPictureName(layoutDocName, blob.type), {
      type: blob.type || "image/png",
    });
  } catch {
    const message = "Couldn't read this picture's image data — try again.";
    console.warn("[return-trip] " + message);
    return { ok: false, message };
  }

  const outcome = await openPhotoFile(file);
  if (!outcome.ok) {
    // The intake's own counter-ready copy — surfaced verbatim.
    console.warn("[return-trip] intake refused the placed picture:", outcome.error.code);
    return { ok: false, message: outcome.error.message };
  }

  const photo = usePhotoStore.getState();
  photo.openDocument(outcome.doc);
  photo.setReturnContext({
    originName: layoutDocName,
    objectId: frame.id,
    originalAssetId: assetId,
  });
  router.push("/photo");
  return { ok: true };
}

/** A fresh, content-derived asset id for the rendered result. The render is a
    pure function of (working-master bytes, applied recipe), and the master id is
    itself content-derived, so hashing that pair yields a stable id — the same
    edit re-Done overwrites the same blob, a different edit gets a different id. */
function editedAssetId(doc: PhotoDocument): string {
  const key = JSON.stringify({
    src: doc.source.assetId,
    recipe: doc.recipe.slice(0, doc.cursor),
  });
  return `photo:${assetIdFor(key)}:edit`;
}

/**
 * Photo Editor "Done" (F2 exit). Renders the applied recipe to a full-resolution
 * PNG, stores it under a fresh namespaced blob id, lands it on the origin frame
 * as ONE revertable layout history step (applyPhotoEdit), then clears the return
 * context, closes the photo document, and navigates back to /layout.
 *
 * Errors surface inline in the banner (RenderError.message); `rendering` guards
 * a double-submit and is always cleared. NOTE: `applyPhotoEdit` lands on the
 * layout store's active surface — the layout editor's active page is unchanged
 * across the round-trip (the store is a session singleton), so the origin frame
 * is still on it.
 */
export async function finishReturnTrip(
  doc: PhotoDocument,
  ctx: NonNullable<PhotoReturnContext>,
  router: PushRouter,
): Promise<ReturnTripResult> {
  const photo = usePhotoStore.getState();
  photo.setRendering(true);
  try {
    const result = await renderPhoto(doc, { format: "png" });
    const assetId = editedAssetId(doc);
    await putAssetBlob(assetId, result.blob);

    useLayoutStore.getState().applyPhotoEdit(ctx.objectId, {
      assetId,
      recipe: doc.recipe.slice(0, doc.cursor),
      originalAssetId: ctx.originalAssetId,
    });

    photo.setReturnContext(null);
    photo.closeDocument();
    router.push("/layout");
    return { ok: true };
  } catch (err) {
    const message = isRenderError(err)
      ? err.message
      : "Couldn't apply the edit — try again.";
    console.warn("[return-trip] Done render failed:", message);
    return { ok: false, message };
  } finally {
    // closeDocument already drops the flag on success; the finally covers the
    // error path so the banner re-enables Done.
    photo.setRendering(false);
  }
}

/**
 * Photo Editor "Cancel" (F2 exit). A TRUE no-op on the layout document — it never
 * calls a layout mutation, so no history step is pushed. Just clears the return
 * context, closes the photo document, and navigates back.
 */
export function cancelReturnTrip(router: PushRouter): void {
  const photo = usePhotoStore.getState();
  photo.setReturnContext(null);
  photo.closeDocument();
  router.push("/layout");
}
