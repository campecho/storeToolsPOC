import { LayoutDocumentSchema, type LayoutDocument } from "@/schema";
import { MAX_PUB_BYTES } from "./limits";
import { ImportReportSchema, type ImportReport } from "./report";

/**
 * The browser side of the import seam (plan §10.7 seam #2): the ONLY module
 * that talks to /api/import. UI components call `importPubFile` and hand the
 * result to the store's `openImportedDocument` — no component fetches the
 * endpoint directly, which is what keeps the POC service swappable for the
 * production conversion service.
 */

export type ImportOutcome =
  | { ok: true; doc: LayoutDocument; report: ImportReport }
  | { ok: false; message: string };

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

  const shaped = json as { ok?: boolean; message?: string; doc?: unknown; report?: unknown };
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
  return { ok: true, doc: doc.data, report: report.data };
}
