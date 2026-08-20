import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { LayoutDocumentSchema, type LayoutDocument } from "@/schema";
import { V1LayoutDocumentSchema, migrateLegacyDocument } from "@/lib/schema/layout-v1";

/**
 * The .staples container for the host POC (docs/STORAGE_PLAN.md): a ZIP of
 * manifest.json + document.json + assets/<id>, byte-compatible with the
 * format the publisher prototype specifies in its PLAN.md §6.9 — the
 * prototype owns the spec; the POC copies it and names its own payload in
 * the manifest (schema v2 layout documents, migrating v1 on read exactly as
 * the localStorage merge does).
 */

export const STAPLES_EXTENSION = ".staples";
export const STAPLES_MIME = "application/vnd.staples-document";
export const STAPLES_FORMAT_VERSION = 1;

/** Mirrors package.json — manifest metadata only. */
export const APP_VERSION = "0.1.0";

const MANIFEST_ENTRY = "manifest.json";
const DOCUMENT_ENTRY = "document.json";
const ASSETS_PREFIX = "assets/";

/** Unknown keys tolerated on purpose (Zod strips): a newer build may add
    fields an older reader ignores — §13.2's no-breaking-additions rule. */
export const StaplesManifestSchema = z.object({
  formatVersion: z.number().int().positive(),
  appVersion: z.string(),
  created: z.string(),
  modified: z.string(),
  document: z.object({
    schemaVersion: z.number().int().positive(),
    kind: z.string(),
    name: z.string(),
    pageCount: z.number().int().nonnegative(),
  }),
});
export type StaplesManifest = z.infer<typeof StaplesManifestSchema>;

function zodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Validate an unknown document payload: v2 parses, v1 migrates on read
    (the persist merge's rule, applied to files), anything else fails whole
    with the version named. */
export function parseLayoutPayload(data: unknown): LayoutDocument {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Not a layout document: expected a JSON object with a `version` field.");
  }
  const version = (data as { version?: unknown }).version;
  if (version === 2) {
    const result = LayoutDocumentSchema.safeParse(data);
    if (!result.success) throw new Error(`Invalid v2 layout document: ${zodIssues(result.error)}`);
    return result.data;
  }
  if (version === 1) {
    const result = V1LayoutDocumentSchema.safeParse(data);
    if (!result.success) throw new Error(`Invalid v1 layout document: ${zodIssues(result.error)}`);
    return migrateLegacyDocument(result.data);
  }
  throw new Error(
    `Unsupported document version ${String(version)}: this build reads layout schema v2 ` +
      "(and migrates v1 on read). The file may come from a newer build — open it there.",
  );
}

export type PackStaplesInput = {
  doc: LayoutDocument;
  /** Raw bytes for embedded assets, keyed by the ids in doc.assets. An asset
      whose bytes are gone (orphaned blob) simply has no entry. */
  assets?: Record<string, Uint8Array>;
  created: string;
  modified: string;
};

export function packStaples({ doc, assets, created, modified }: PackStaplesInput): Uint8Array {
  const mtime = new Date(modified);
  if (Number.isNaN(mtime.getTime())) {
    throw new Error(`packStaples: \`modified\` must be a valid ISO timestamp, got "${modified}".`);
  }
  const manifest: StaplesManifest = {
    formatVersion: STAPLES_FORMAT_VERSION,
    appVersion: APP_VERSION,
    created,
    modified,
    document: {
      schemaVersion: doc.version,
      kind: "layout",
      name: doc.name,
      pageCount: doc.pages.length,
    },
  };
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest, null, 2)),
    [DOCUMENT_ENTRY]: strToU8(JSON.stringify(doc, null, 2)),
  };
  for (const [id, bytes] of Object.entries(assets ?? {})) {
    entries[ASSETS_PREFIX + id] = bytes;
  }
  // Fixed mtime keeps the archive byte-deterministic for identical input.
  return zipSync(entries, { mtime });
}

export type UnpackedStaples = {
  manifest: StaplesManifest;
  doc: LayoutDocument;
  assets: Record<string, Uint8Array>;
};

export function unpackStaples(bytes: Uint8Array): UnpackedStaples {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Not a ${STAPLES_EXTENSION} file: the data is not a ZIP archive.`, {
      cause: error,
    });
  }

  const manifestBytes = entries[MANIFEST_ENTRY];
  if (manifestBytes === undefined) {
    throw new Error(`Not a ${STAPLES_EXTENSION} file: the archive has no ${MANIFEST_ENTRY}.`);
  }
  let manifestData: unknown;
  try {
    manifestData = JSON.parse(strFromU8(manifestBytes));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${MANIFEST_ENTRY} is not valid JSON: ${detail}`, { cause: error });
  }
  const rawVersion =
    typeof manifestData === "object" && manifestData !== null && !Array.isArray(manifestData)
      ? (manifestData as { formatVersion?: unknown }).formatVersion
      : undefined;
  if (typeof rawVersion !== "number") {
    throw new Error(
      `Not a ${STAPLES_EXTENSION} file: ${MANIFEST_ENTRY} has no numeric \`formatVersion\`.`,
    );
  }
  if (rawVersion !== STAPLES_FORMAT_VERSION) {
    throw new Error(
      `Unsupported container format v${rawVersion}: this build reads ${STAPLES_EXTENSION} ` +
        `format v${STAPLES_FORMAT_VERSION} only` +
        (rawVersion > STAPLES_FORMAT_VERSION ? " — the file was written by a newer build." : "."),
    );
  }
  const manifestResult = StaplesManifestSchema.safeParse(manifestData);
  if (!manifestResult.success) {
    throw new Error(`Invalid ${MANIFEST_ENTRY}: ${zodIssues(manifestResult.error)}`);
  }
  const manifest = manifestResult.data;

  const docBytes = entries[DOCUMENT_ENTRY];
  if (docBytes === undefined) {
    throw new Error(`Not a ${STAPLES_EXTENSION} file: the archive has no ${DOCUMENT_ENTRY}.`);
  }
  let docData: unknown;
  try {
    docData = JSON.parse(strFromU8(docBytes));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${DOCUMENT_ENTRY} is not valid JSON: ${detail}`, { cause: error });
  }
  const doc = parseLayoutPayload(docData);

  const assets: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(ASSETS_PREFIX)) continue;
    const id = name.slice(ASSETS_PREFIX.length);
    if (id.length === 0 || id.includes("/")) continue;
    assets[id] = data;
  }

  return { manifest, doc, assets };
}

/** The suggested file name for a document: its name with the extension,
    never doubled, "document" when the name is blank. */
export function staplesFileName(name: string): string {
  const base = name.trim() === "" ? "document" : name.trim();
  return base.toLowerCase().endsWith(STAPLES_EXTENSION) ? base : base + STAPLES_EXTENSION;
}
