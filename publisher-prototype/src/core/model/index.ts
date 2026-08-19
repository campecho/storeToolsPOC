/**
 * Schema v3 barrel (PLAN.md §6.6) — the document model's public surface.
 * Everything a consumer needs re-exports from here: color/paint, typography
 * and styles, the photo recipe vocabulary, canvas objects, the document root,
 * group membership traversal, and the round-trip/migrate-on-read functions.
 */
export * from "./color";
export * from "./typography";
export * from "./photo";
export * from "./objects";
export * from "./document";
export * from "./groups";
export * from "./parse";
