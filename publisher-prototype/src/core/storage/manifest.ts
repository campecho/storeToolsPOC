import { z } from "zod";

/**
 * The .staples container manifest (PLAN.md §6.9): the container's own
 * version stamp plus the §13.2 document metadata — which app wrote the file,
 * when, and what the payload is, readable without parsing the document.
 *
 * The container version and the DOCUMENT schema version move independently:
 * `formatVersion` says how the ZIP is laid out, `document.schemaVersion`
 * says what document.json holds. parseDocument stays the one migrate-on-read
 * door for the payload; the manifest gate in container.ts covers only the
 * wrapper.
 *
 * Unknown manifest keys are deliberately tolerated (Zod strips rather than
 * rejects): §13.2 requires the format to accommodate additions without a
 * breaking version change, so a newer build may add fields an older reader
 * ignores.
 */

export const STAPLES_FORMAT_VERSION = 1;

export const StaplesManifestSchema = z.object({
  formatVersion: z.number().int().positive(),
  appVersion: z.string(),
  /** ISO timestamps — stamped by the caller; core never reads a clock. */
  created: z.string(),
  modified: z.string(),
  document: z.object({
    schemaVersion: z.number().int().positive(),
    // `kind` stays a plain string here: the payload schema is what rejects an
    // unknown kind, and a manifest-level enum would fail sibling-app files
    // with a wrapper error instead of the payload's actionable one.
    kind: z.string(),
    name: z.string(),
    pageCount: z.number().int().nonnegative(),
  }),
});

export type StaplesManifest = z.infer<typeof StaplesManifestSchema>;
