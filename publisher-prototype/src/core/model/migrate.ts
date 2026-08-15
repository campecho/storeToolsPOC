import { CURRENT_VERSION } from "./document";

/**
 * Migrate-on-read (PLAN.md §6.6).
 *
 * No runtime migration is required today — v3 is the first version this model
 * writes, and its documents are its own fixtures. The mechanism ships anyway,
 * because the dev team's storage will need it and because a migration path
 * retrofitted after documents exist in the wild is a different, worse problem.
 *
 * A migration lifts a document one version forward. `migrateToCurrent` chains
 * them, so adding v4 means writing one function and registering it under 3.
 */

/** Lifts a raw document from version N to version N+1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered migrations, keyed by the version they read. Empty by design: v3
 * is the first version. The POC's v1→v2 lift is not carried over — v3 owns its
 * lineage rather than migrating from it.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({});

/** Raised when a document cannot be brought to the current version. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lift a raw parsed document to `CURRENT_VERSION`, applying each registered
 * migration in turn. Returns raw data — the caller validates it against
 * `DocumentSchema`, so a migration that produces something malformed fails at
 * the schema, not silently.
 *
 * `migrations` is injectable so the chaining behaviour is testable without a
 * second real version existing.
 */
export function migrateToCurrent(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new MigrationError("not a document: expected a JSON object");
  }

  const declared = raw.version;
  if (typeof declared !== "number" || !Number.isInteger(declared)) {
    throw new MigrationError("not a document: missing an integer `version`");
  }
  if (declared > CURRENT_VERSION) {
    throw new MigrationError(
      `document is version ${declared}, but this build reads up to ${CURRENT_VERSION} — it was written by a newer version`,
    );
  }

  let doc = raw;
  let version = declared;
  while (version < CURRENT_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new MigrationError(
        `no migration registered from version ${version} to ${version + 1}`,
      );
    }
    doc = migrate(doc);
    const next = doc.version;
    if (typeof next !== "number" || next <= version) {
      throw new MigrationError(
        `migration from version ${version} did not advance the version field`,
      );
    }
    version = next;
  }

  return doc;
}
