/**
 * Schema v3 — the document model (PLAN.md §6.6).
 *
 * The public surface of `core/model/`. The shell, the store, and every
 * generated handoff document import from here rather than reaching into the
 * modules, so the model's internal decomposition stays free to move.
 */

export * from "./primitives";
export * from "./color";
export * from "./photoOps";
export * from "./text";
export * from "./objects";
export * from "./document";
export * from "./defaults";
export * from "./migrate";
export * from "./roundTrip";
