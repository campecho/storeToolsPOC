import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { z } from "zod";
import { deserializeDocument, serializeDocument, type LayoutDocument } from "../model";
import {
  STAPLES_FORMAT_VERSION,
  StaplesManifestSchema,
  type StaplesManifest,
} from "./manifest";

/**
 * The .staples container (PLAN.md §6.9): a ZIP archive holding
 * `manifest.json`, `document.json` — schema v3 exactly as serializeDocument
 * emits it, so the saved file and the debug round-trip can never disagree —
 * and one `assets/<id>` entry per embedded asset, keyed by the ids in
 * `doc.assets`. Pure bytes-in/bytes-out: all IO lives in the shell's
 * StorageProvider.
 */

export const STAPLES_EXTENSION = ".staples";
export const STAPLES_MIME = "application/vnd.staples-document";

const MANIFEST_ENTRY = "manifest.json";
const DOCUMENT_ENTRY = "document.json";
const ASSETS_PREFIX = "assets/";

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export type PackStaplesInput = {
  doc: LayoutDocument;
  /** Raw bytes for embedded assets, keyed by asset id. Referenced-only
      assets simply have no entry (§13.2 supports both). */
  assets?: Record<string, Uint8Array>;
  appVersion: string;
  /** ISO timestamps from the caller's clock — created carries through from
      the file's first save; modified is stamped per save. Injected rather
      than read here so packing is deterministic and core stays clock-free. */
  created: string;
  modified: string;
};

export function packStaples({ doc, assets, appVersion, created, modified }: PackStaplesInput): Uint8Array {
  const mtime = new Date(modified);
  if (Number.isNaN(mtime.getTime())) {
    throw new Error(`packStaples: \`modified\` must be a valid ISO timestamp, got "${modified}".`);
  }
  const manifest: StaplesManifest = {
    formatVersion: STAPLES_FORMAT_VERSION,
    appVersion,
    created,
    modified,
    document: {
      schemaVersion: doc.version,
      kind: doc.kind,
      name: doc.name,
      pageCount: doc.pages.length,
    },
  };
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest, null, 2)),
    [DOCUMENT_ENTRY]: strToU8(serializeDocument(doc)),
  };
  for (const [id, bytes] of Object.entries(assets ?? {})) {
    entries[ASSETS_PREFIX + id] = bytes;
  }
  // A fixed mtime (the modified stamp) keeps the archive byte-deterministic
  // for identical input — zipSync would otherwise stamp entries with "now".
  return zipSync(entries, { mtime });
}

export type UnpackedStaples = {
  manifest: StaplesManifest;
  doc: LayoutDocument;
  /** Embedded asset bytes by id. Consumed once the client blob store lands
      (§6.9 S3); until then callers may ignore it. */
  assets: Record<string, Uint8Array>;
};

/** Unpack and validate a .staples container. The wrapper gates fail first
    and name the wrapper; the document payload then goes through
    deserializeDocument, the model's one migrate-on-read door, so a schema
    mismatch carries the same actionable message everywhere. */
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
  // Gate the container version off the raw data before shape validation, so
  // a newer container fails on the version — the actionable fact — and not
  // on whatever else the newer layout changed.
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
    if (rawVersion > STAPLES_FORMAT_VERSION) {
      throw new Error(
        `Unsupported container format v${rawVersion}: this build reads ${STAPLES_EXTENSION} ` +
          `format v${STAPLES_FORMAT_VERSION} only. The file was written by a newer build — ` +
          "open it there, or save it for this version from there.",
      );
    }
    throw new Error(
      `Unsupported container format v${rawVersion}: this build reads ${STAPLES_EXTENSION} ` +
        `format v${STAPLES_FORMAT_VERSION} only.`,
    );
  }
  const manifestResult = StaplesManifestSchema.safeParse(manifestData);
  if (!manifestResult.success) {
    throw new Error(`Invalid ${MANIFEST_ENTRY}: ${formatIssues(manifestResult.error)}`);
  }

  const docBytes = entries[DOCUMENT_ENTRY];
  if (docBytes === undefined) {
    throw new Error(`Not a ${STAPLES_EXTENSION} file: the archive has no ${DOCUMENT_ENTRY}.`);
  }
  const doc = deserializeDocument(strFromU8(docBytes));

  const assets: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(ASSETS_PREFIX)) continue;
    const id = name.slice(ASSETS_PREFIX.length);
    // The asset store is flat: directory placeholders and nested paths are
    // not asset ids, whatever else put them in the archive.
    if (id.length === 0 || id.includes("/")) continue;
    assets[id] = data;
  }

  return { manifest: manifestResult.data, doc, assets };
}

/** The suggested file name for a document: its name with the extension,
    never doubled, "document" when the name is blank. */
export function staplesFileName(name: string): string {
  const base = name.trim() === "" ? "document" : name.trim();
  return base.toLowerCase().endsWith(STAPLES_EXTENSION) ? base : base + STAPLES_EXTENSION;
}
