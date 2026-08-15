import type { z } from "zod";
import { DocumentSchema, type Document } from "./document";
import { MigrationError, migrateToCurrent, type Migration } from "./migrate";

/**
 * JSON round-trip (PLAN.md §6.6, decision closed: in).
 *
 * A debug export/import of the full document as a file. It is the only proof
 * that the schema is complete — anything the schema cannot express is missing
 * after a round trip — and it is the fixture mechanism for tests and seeded
 * content. `core/model/` owns it; the shell exposes it in the debug bar.
 *
 * Reading always goes through migrate-on-read and then validation, so every
 * document entering the app is at `CURRENT_VERSION` and schema-valid.
 */

/** Reading a document either yields one or explains why it could not. */
export type ReadResult =
  | { ok: true; document: Document }
  | { ok: false; error: string };

/** Stable JSON for a document, suitable for a file or a fixture. */
export function serializeDocument(document: Document): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Turn already-parsed JSON into a document: migrate, then validate. Separate
 * from `readDocument` so callers holding parsed data (fixtures, tests, a
 * future storage layer) skip a redundant stringify.
 */
export function fromJson(
  raw: unknown,
  migrations?: Readonly<Record<number, Migration>>,
): ReadResult {
  let migrated: unknown;
  try {
    migrated = migrateToCurrent(raw, migrations);
  } catch (err) {
    if (err instanceof MigrationError) return { ok: false, error: err.message };
    throw err;
  }

  const parsed = DocumentSchema.safeParse(migrated);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error) };
  }
  return { ok: true, document: parsed.data };
}

/** Read a document from JSON text — the import half of the round trip. */
export function readDocument(
  text: string,
  migrations?: Readonly<Record<number, Migration>>,
): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${(err as Error).message}` };
  }
  return fromJson(raw, migrations);
}

/**
 * Throwing variant for callers that treat a bad document as a bug rather than
 * as input — fixtures loaded at startup, and tests.
 */
export function readDocumentOrThrow(text: string): Document {
  const result = readDocument(text);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/** Compact, path-first issue text — readable in a debug bar and in a test failure. */
function formatIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  const more = error.issues.length - issues.length;
  return more > 0
    ? `${issues.join("; ")}; and ${more} more issue(s)`
    : issues.join("; ");
}
