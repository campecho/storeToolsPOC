/**
 * Local device storage (PLAN.md §6.9): the .staples container format —
 * manifest schema, pack/unpack, and the file-name helper. Pure logic only;
 * the pickers, handles, and permissions live in the shell's StorageProvider.
 */
export * from "./manifest";
export * from "./container";
