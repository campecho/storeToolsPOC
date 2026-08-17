import type { z } from "zod";
import { LayoutDocumentSchema, type LayoutDocument } from "./document";

/**
 * Round-trip + migrate-on-read (PLAN.md §6.6): the JSON export/import is the
 * only proof the schema is complete, and the fixture mechanism for tests and
 * seeded content. parseDocument is the single door every stored document
 * enters through — it inspects `version` and routes; when v4 ships, its
 * migration slots in here and callers never change.
 */

const SUPPORTED_VERSION = 3;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Validate unknown data as a schema-v3 document. Throws with an actionable
    message for wrong versions and shapeless input — a wrong version fails
    whole rather than half-loading. */
export function parseDocument(data: unknown): LayoutDocument {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(
      "Not a layout document: expected a JSON object with a numeric `version` field.",
    );
  }
  const version = (data as { version?: unknown }).version;
  if (typeof version !== "number") {
    throw new Error(
      "Not a layout document: missing numeric `version` field. " +
        `This build reads schema v${SUPPORTED_VERSION} documents.`,
    );
  }
  if (version !== SUPPORTED_VERSION) {
    if (version < SUPPORTED_VERSION) {
      throw new Error(
        `Unsupported document version ${version}: v1/v2 are the POC lineage and no runtime ` +
          `migration exists (PLAN.md §6.6 — v3's documents are its own fixtures). ` +
          `Author the content as a v${SUPPORTED_VERSION} document instead.`,
      );
    }
    throw new Error(
      `Unsupported document version ${version}: this build reads schema v${SUPPORTED_VERSION} only. ` +
        "Open the document with the build that wrote it, or upgrade this one.",
    );
  }
  const result = LayoutDocumentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid v${SUPPORTED_VERSION} document: ${formatIssues(result.error)}`);
  }
  return result.data;
}

/** Stable 2-space JSON — the debug-bar export shape and the fixture format. */
export function serializeDocument(doc: LayoutDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** JSON.parse + parseDocument, with syntax errors wrapped actionably. */
export function deserializeDocument(text: string): LayoutDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Document text is not valid JSON: ${detail}`, { cause: error });
  }
  return parseDocument(data);
}

/** One blank US Letter portrait page — the document-slice defaults (8.5×11,
    1/8" bleed, 1/2" margin), one default layer, everything else empty. */
export function createEmptyDocument(): LayoutDocument {
  return {
    version: 3,
    kind: "layout",
    name: "Untitled",
    size: { w: 8.5, h: 11 },
    orientation: "portrait",
    bleed: 0.125,
    margin: 0.5,
    slug: 0,
    columns: 1,
    pages: [{ id: "page-1", masterId: null, objects: [] }],
    masters: [],
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        color: "#4A90D9",
        visible: true,
        locked: false,
        printing: true,
        opacity: 1,
        blend: "normal",
      },
    ],
    sections: [],
    anchors: [],
    paragraphStyles: [],
    characterStyles: [],
    swatches: [],
    groups: [],
    fonts: [],
    assets: {},
    guides: { v: [], h: [] },
  };
}
