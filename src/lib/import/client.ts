import { LayoutDocumentSchema, type LayoutDocument } from "@/schema";
import { MAX_PUB_BYTES } from "./limits";
import {
  ImportAssetsPayloadSchema,
  ImportReportSchema,
  type ImportAssetsPayload,
  type ImportReport,
} from "./report";

/**
 * The browser side of the import seam (plan §10.7 seam #2): the ONLY module
 * that talks to /api/import. UI components call `importPubFile` and hand the
 * result to the store's `openImportedDocument` — no component fetches the
 * endpoint directly, which is what keeps the POC service swappable for the
 * production conversion service.
 */

export type ImportOutcome =
  | { ok: true; doc: LayoutDocument; report: ImportReport; blobs: Record<string, Blob> }
  | { ok: false; message: string };

/** Decode the base64 asset payload (P3 transport) into renderable blobs. Throws
    on unreadable base64 — the caller turns that into an honest failure. */
function decodeAssets(payload: ImportAssetsPayload): Record<string, Blob> {
  const blobs: Record<string, Blob> = {};
  for (const [id, { mime, dataB64 }] of Object.entries(payload)) {
    const bytes = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
    blobs[id] = new Blob([bytes], { type: mime });
  }
  return blobs;
}

export async function importPubFile(file: File): Promise<ImportOutcome> {
  if (file.size > MAX_PUB_BYTES) {
    return { ok: false, message: `That file is over the ${Math.round(MAX_PUB_BYTES / 1024 / 1024)} MB import limit.` };
  }
  const body = new FormData();
  body.append("file", file);

  let json: unknown;
  try {
    const res = await fetch("/api/import", { method: "POST", body });
    json = await res.json();
  } catch {
    return { ok: false, message: "Import service unreachable — try again." };
  }

  const shaped = json as {
    ok?: boolean;
    message?: string;
    doc?: unknown;
    report?: unknown;
    assets?: unknown;
  };
  if (!shaped.ok) {
    return { ok: false, message: shaped.message ?? "Import failed." };
  }

  // Validate the contract client-side too — a swapped backend that drifts
  // from the schema fails loudly here, never as a broken canvas.
  const doc = LayoutDocumentSchema.safeParse(shaped.doc);
  const report = ImportReportSchema.safeParse(shaped.report);
  if (!doc.success || !report.success) {
    return { ok: false, message: "Import returned an unexpected document shape." };
  }

  // `assets` is the P3 image-bytes half. Absent means a P1-era backend that
  // extracted nothing — fine, open with no blobs (backward compat). A present
  // payload must be well-shaped: a drifted one fails loudly like doc/report.
  let blobs: Record<string, Blob> = {};
  if (shaped.assets != null) {
    const assets = ImportAssetsPayloadSchema.safeParse(shaped.assets);
    if (!assets.success) {
      return { ok: false, message: "Import returned an unexpected document shape." };
    }
    try {
      blobs = decodeAssets(assets.data);
    } catch {
      return { ok: false, message: "Import returned unreadable image data." };
    }
  }
  return { ok: true, doc: doc.data, report: report.data, blobs };
}
