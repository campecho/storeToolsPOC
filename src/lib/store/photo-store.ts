import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { PhotoDocumentSchema, type PhotoDocument, type PhotoOp } from "@/lib/schema/photo";

/**
 * Photo-editor state (plan §3.4). The recipe IS the document, and history is a
 * CURSOR into that recipe — not a snapshot stack. ops[0..cursor) are applied;
 * the rest is the redo tail (see PhotoDocument.cursor). So undo/redo only move
 * `cursor`, and a new edit truncates the tail ("a new edit truncates it").
 *
 * This is the deliberate divergence from layout-store, whose undo/redo push
 * document snapshots onto bounded past/future stacks: there is NO history cap
 * here and NO past/future arrays — the recipe already holds the full timeline.
 *
 * Slices: document + experience level persist (under `stp-photo-v1`, beside
 * `stp-layout-v1` and the tracker's `stp-feedback-v1`); the active tool and the
 * PE8 return context are session-only. Persist/merge/skipHydration follow
 * layout-store's conventions (validate what came out of storage; rehydrate
 * after mount via StoreHydrator so SSR and client markup match).
 */

export type PhotoTool =
  | "crop"
  | "adjust"
  | "fixprint"
  | "text"
  | "cleanup"
  | "export"
  | "none";

/** Two levels, mirroring the layout editor's experience switch (plan §3.3). */
export type PhotoLevel = "simple" | "standard";

/** Where "Back to <origin>" returns after an edit (PE8 consumes it; stays null
    through PE1's standalone open, but the field + setter exist now). */
export type PhotoReturnContext = { originName: string; objectId: string } | null;

export interface PhotoEditorState {
  /** The working document — the recipe. Null until a photo is opened (PE1). */
  doc: PhotoDocument | null;
  /** Experience level (persisted; default "standard"). */
  level: PhotoLevel;
  /** The open tool panel (session-only; default "none"). */
  activeTool: PhotoTool;
  /** Set when the editor was entered from a layout picture (PE8) — session-only. */
  returnContext: PhotoReturnContext;

  /** Open a schema-validated document; a malformed shape is refused. Resets
      the active tool to "none" (a fresh document opens with no panel). */
  openDocument: (doc: PhotoDocument) => void;
  /** Close the working document and collapse any open tool. */
  closeDocument: () => void;
  setLevel: (level: PhotoLevel) => void;
  setActiveTool: (tool: PhotoTool) => void;
  /** Append an op at the cursor, dropping the redo tail; cursor -> recipe end.
      No-op when there is no document. */
  pushOp: (op: PhotoOp) => void;
  /** Step the cursor back one (clamped at 0). No-op when there is no document. */
  undo: () => void;
  /** Step the cursor forward one (clamped at recipe end). No-op with no doc. */
  redo: () => void;
  /** Jump the cursor to a history position, clamped into [0, recipe.length]. */
  setCursor: (cursor: number) => void;
  setReturnContext: (ctx: PhotoReturnContext) => void;
}

/** Clamp a cursor into the valid [0, recipe.length] window for a document
    (rounded — the schema stores cursor as an int). */
function clampCursor(doc: PhotoDocument, cursor: number): number {
  return Math.max(0, Math.min(doc.recipe.length, Math.round(cursor)));
}

/**
 * Rebuild state from a persisted payload (persist `merge`). Exported for the
 * merge test: layout-store keeps its merge inline, but the extra cursor clamp
 * here — belt-and-suspenders against hand-edited storage — is worth exercising
 * directly. Defensive like layout-store's merge:
 *   - a corrupt or foreign-shaped `doc` degrades to null;
 *   - a bogus `level` falls back to the current (default) value;
 *   - an out-of-range persisted `cursor` is clamped into range.
 * Only the document + experience level are restored; session-only fields keep
 * their current defaults.
 */
export function mergePhotoState(
  persisted: unknown,
  current: PhotoEditorState,
): PhotoEditorState {
  const p = persisted as { doc?: unknown; level?: unknown } | undefined;
  // Only override from a present, valid persisted value; otherwise keep the
  // current value (rehydration runs after mount, so a default here would
  // clobber a preference the user changed in that window — layout-store's note).
  const level: PhotoLevel =
    p?.level === "simple" || p?.level === "standard" ? p.level : current.level;
  const parsed = PhotoDocumentSchema.safeParse(p?.doc);
  if (!parsed.success) return { ...current, level, doc: null };
  const doc = parsed.data;
  const cursor = clampCursor(doc, doc.cursor);
  return {
    ...current,
    level,
    doc: cursor === doc.cursor ? doc : { ...doc, cursor },
  };
}

// SSR and the vitest node env have no localStorage — persistence becomes a
// silent no-op there (mirrors layout-store's noopStorage).
const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export const usePhotoStore = create<PhotoEditorState>()(
  persist(
    (set) => ({
      doc: null,
      level: "standard",
      activeTool: "none",
      returnContext: null,

      openDocument: (doc) =>
        set((s) => {
          const parsed = PhotoDocumentSchema.safeParse(doc);
          if (!parsed.success) {
            // A malformed document never enters the editor — opening is refused
            // rather than throwing (layout-store's defensive tone).
            console.warn("[photo-store] openDocument refused an invalid document");
            return s;
          }
          return { doc: parsed.data, activeTool: "none" };
        }),

      closeDocument: () => set({ doc: null, activeTool: "none" }),

      setLevel: (level) => set({ level }),
      setActiveTool: (activeTool) => set({ activeTool }),
      setReturnContext: (returnContext) => set({ returnContext }),

      pushOp: (op) =>
        set((s) => {
          if (!s.doc) return s;
          // Truncate the redo tail at the cursor, then append (plan §3.4:
          // "a new edit truncates it"). The cursor lands at the new recipe end.
          const recipe = [...s.doc.recipe.slice(0, s.doc.cursor), op];
          return { doc: { ...s.doc, recipe, cursor: recipe.length } };
        }),

      undo: () =>
        set((s) => {
          if (!s.doc) return s;
          const cursor = Math.max(0, s.doc.cursor - 1);
          if (cursor === s.doc.cursor) return s;
          return { doc: { ...s.doc, cursor } };
        }),

      redo: () =>
        set((s) => {
          if (!s.doc) return s;
          const cursor = Math.min(s.doc.recipe.length, s.doc.cursor + 1);
          if (cursor === s.doc.cursor) return s;
          return { doc: { ...s.doc, cursor } };
        }),

      setCursor: (cursor) =>
        set((s) => {
          if (!s.doc) return s;
          const next = clampCursor(s.doc, cursor);
          if (next === s.doc.cursor) return s;
          return { doc: { ...s.doc, cursor: next } };
        }),
    }),
    {
      // CONTRACT: the storage key + PhotoDocumentSchema are the saved shape — a
      // real backend persists the same document per photo. Sits beside
      // `stp-layout-v1` in localStorage; the zustand-level version stays 1.
      name: "stp-photo-v1",
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage,
      ),
      // SSR/first render start with no document; StoreHydrator rehydrates after
      // mount so server and client markup match (mirrors layout-store).
      skipHydration: true,
      // Only the document + experience level persist — the active tool and the
      // PE8 return context stay session-scoped.
      partialize: (s) => ({ doc: s.doc, level: s.level }),
      merge: (persisted, current) => mergePhotoState(persisted, current),
    },
  ),
);
