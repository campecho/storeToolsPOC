import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  PhotoDocumentSchema,
  type PhotoDocument,
  type PhotoOp,
  type PixelRect,
} from "@/lib/schema/photo";
import { effectiveDims } from "@/lib/photo/geometry";
import { DEFAULT_FAMILY } from "@/lib/layout/font-catalog";

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
/** F2 round-trip context (plan §3.4, PE8): present only when the layout editor
    opened this photo for a placed frame. `originalAssetId` is the frame's asset
    at entry — Done binds the rendered result and records it for one-step revert. */
export type PhotoReturnContext = {
  originName: string;
  objectId: string;
  originalAssetId: string;
} | null;

/** The in-flight crop the CropOverlay + CropPanel share while the Crop tool is
    open — the rect being dragged, the aspect preset id driving the lock, and the
    Shape choice — before "Apply crop" commits it as a `crop` op (plan §4 PE2).
    Session-only and stale the moment history moves, so it is cleared on any
    cursor change; null when no crop is being composed. */
export type PhotoCropDraft = {
  rect: PixelRect;
  ratioId: string;
  shape: "rect" | "rounded" | "circle";
} | null;

export interface PhotoEditorState {
  /** The working document — the recipe. Null until a photo is opened (PE1). */
  doc: PhotoDocument | null;
  /** Experience level (persisted; default "standard"). */
  level: PhotoLevel;
  /** The open tool panel (session-only; default "none"). */
  activeTool: PhotoTool;
  /** Set when the editor was entered from a layout picture (PE8) — session-only. */
  returnContext: PhotoReturnContext;

  /** The crop being composed while the Crop tool is open (session-only, null
      otherwise). Cleared whenever the tool changes or history moves. */
  cropDraft: PhotoCropDraft;
  /** A live-gesture preview op (a straighten mid-drag, a crop being framed)
      rendered on top of ops[0..cursor) WITHOUT entering the recipe — session-only.
      Null when no gesture is previewing. */
  previewOp: PhotoOp | null;
  /** Press-and-hold "Compare" peek at the original (before any ops) — session-only. */
  comparing: boolean;
  /** True while a full-resolution server render is in flight (PE3 export) —
      session-only, never persisted. Drives the status-bar progress chip and the
      Export panel's double-click guard; the canvas stays interactive throughout
      (the render is async and blocks nothing). Cleared on closeDocument. */
  rendering: boolean;
  /** The Adjust panel's before/after SPLIT-VIEW slider (Section D) — session-only,
      never persisted. Distinct from `comparing` (the press-and-hold peek at the
      original): split-view is a sticky mode, the peek is momentary. Cleared on
      closeDocument. */
  splitView: boolean;
  /** The overlay selected in the Text & image tool (PE6) — session-only, never
      persisted. Drives the OverlayHandles chrome (which mounts only when the text
      tool is active AND this is set) and the panel's Character controls. Cleared
      on tool change and doc open/close (a stale selection must not survive leaving
      the tool); it SURVIVES history moves and pushOp (editing an overlay keeps it
      selected). Null when nothing is selected. */
  selectedOverlayId: string | null;

  /** Open a schema-validated document; a malformed shape is refused. Resets
      the active tool to "none" and clears every session gesture field (a fresh
      document opens with no panel, no draft, no preview, not comparing). */
  openDocument: (doc: PhotoDocument) => void;
  /** Close the working document, collapse any open tool, and clear the session
      gesture fields. */
  closeDocument: () => void;
  setLevel: (level: PhotoLevel) => void;
  /** Switch tools; clears the crop draft + preview op and ends any compare peek
      (a stale gesture must never survive leaving its tool). */
  setActiveTool: (tool: PhotoTool) => void;
  setCropDraft: (draft: PhotoCropDraft) => void;
  setPreviewOp: (op: PhotoOp | null) => void;
  setComparing: (comparing: boolean) => void;
  /** Toggle the full-res render-in-flight flag (Export panel wraps its render
      call in setRendering(true)…setRendering(false)). */
  setRendering: (rendering: boolean) => void;
  /** Toggle the Adjust before/after split-view slider (Section D). */
  setSplitView: (splitView: boolean) => void;
  /** Select an overlay (PE6) — or clear the selection with null. */
  setSelectedOverlayId: (id: string | null) => void;
  /** Add a text overlay with sensible defaults (plan §4 PE6): text "New text",
      the first catalog family, size ≈ effective height / 12 (master px), a box
      centered on the effective image, label "Add text". Appends one history step
      (never coalesces — a fresh id) and SELECTS it. No-op with no document.

      Overlay EDITS do NOT go through here — a panel/handle edit rides
      `pushOp({ ...op, label }, { coalesce: true })`; a remove rides a same-id op
      with `hidden: true` (see overlay-raster `hideOverlayOp`). This action only
      MINTS a new overlay. */
  addTextOverlay: () => void;
  /** Add a logo overlay bound to an already-ingested overlay asset
      (client.ts `ingestOverlayImage` → `photo:<id>:overlay`). Places a default
      box centered on the effective image, scaled to the asset's aspect, label
      "Add image"; appends one history step and SELECTS it. No-op with no doc. */
  addLogoOverlay: (assetId: string, naturalW: number, naturalH: number) => void;
  /** Append an op at the cursor, dropping the redo tail; cursor -> recipe end.
      No-op when there is no document.

      `opts.coalesce`: when set and the op immediately before the cursor carries
      the SAME `op` tag, REPLACE it in place (cursor unchanged) instead of
      appending — the straighten-slider anti-spam rule (plan §3.4 gesture rule),
      so a whole drag collapses to one history step. With no matching trailing op
      (empty recipe, cursor at 0, or a different tag) it appends normally. */
  pushOp: (op: PhotoOp, opts?: { coalesce?: boolean }) => void;
  /** Step the cursor back one (clamped at 0); clears the crop draft + preview op
      (both stale once history moves). No-op when there is no document. */
  undo: () => void;
  /** Step the cursor forward one (clamped at recipe end); clears the crop draft +
      preview op. No-op with no doc. */
  redo: () => void;
  /** Jump the cursor to a history position, clamped into [0, recipe.length];
      clears the crop draft + preview op. */
  setCursor: (cursor: number) => void;
  setReturnContext: (ctx: PhotoReturnContext) => void;

  /** Replace the document's print TARGET metadata — size, product binding, and
      bleed — in one whole-target write (persisted via the `doc` in partialize).
      This is a DOCUMENT MUTATION, NOT a history op: the print target is print
      METADATA, not an image edit, so it does NOT move the cursor, does NOT push
      a recipe op, and does NOT truncate the redo tail — changing the target
      leaves the recipe (and any redo tail) exactly as it was. `intent` is owned
      by setIntent and preserved across a target change (this setter never
      touches it). No-op when there is no document. */
  setTarget: (target: {
    size: { w: number; h: number } | null;
    product: { sku: string; label: string } | null;
    bleed: number;
  }) => void;
  /** Set the export colour INTENT (cmyk/srgb, dev #6). Like setTarget this is a
      document mutation, NOT a history op — no cursor move, no recipe change —
      and it is INDEPENDENT of `source.colorSpace` (intent is the export choice;
      colorSpace is the arrival fact, never mutated here). No-op when there is no
      document, or when the intent is already set. */
  setIntent: (intent: "cmyk" | "srgb") => void;
}

/** Clamp a cursor into the valid [0, recipe.length] window for a document
    (rounded — the schema stores cursor as an int). */
function clampCursor(doc: PhotoDocument, cursor: number): number {
  return Math.max(0, Math.min(doc.recipe.length, Math.round(cursor)));
}

/**
 * Whether a coalescing `pushOp` should REPLACE the trailing op `prev` with the
 * incoming `next` (the straighten-slider anti-spam rule, plan §3.4). Matches on
 * the `op` tag — but is IDENTITY-AWARE for the two per-target op families:
 *   • `adjust` coalesces only when the SAME param (a Brightness drag never
 *     swallows a preceding Contrast op — both share `op: "adjust"`);
 *   • `textOverlay` / `logoOverlay` coalesce only when the SAME `id` — so a whole
 *     overlay drag/edit (many previewOps live + one pushOp on release, like
 *     straighten) collapses to ONE history step for THAT overlay, while editing a
 *     DIFFERENT overlay right after always appends its own step.
 * Every other tag coalesces on the tag alone.
 */
function coalesceMatch(prev: PhotoOp, next: PhotoOp): boolean {
  if (prev.op !== next.op) return false;
  if (prev.op === "adjust" && next.op === "adjust") {
    return prev.param === next.param;
  }
  if (prev.op === "textOverlay" && next.op === "textOverlay") {
    return prev.id === next.id;
  }
  if (prev.op === "logoOverlay" && next.op === "logoOverlay") {
    return prev.id === next.id;
  }
  return true;
}

/** A short, collision-resistant id for a fresh overlay (no crypto dependency —
    the store runs under vitest's node env too). */
function overlayId(): string {
  return `ov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

// Partial-state fragments spread into `set` returns so every history/tool move
// clears the same session gesture fields the same way (session-only — never
// persisted, so clearing them touches no saved state).
//   CLEAR_DRAFT    — a history move: the draft + live preview are stale, but a
//                    compare peek AND the overlay selection are independent and
//                    survive (editing an overlay must keep it selected).
//   CLEAR_GESTURES — leaving/opening/closing the surface: everything resets,
//                    including the overlay selection (tool change / doc close).
const CLEAR_DRAFT = { cropDraft: null, previewOp: null } as const;
const CLEAR_GESTURES = {
  cropDraft: null,
  previewOp: null,
  comparing: false,
  selectedOverlayId: null,
} as const;

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
      cropDraft: null,
      previewOp: null,
      comparing: false,
      rendering: false,
      splitView: false,
      selectedOverlayId: null,

      openDocument: (doc) =>
        set((s) => {
          const parsed = PhotoDocumentSchema.safeParse(doc);
          if (!parsed.success) {
            // A malformed document never enters the editor — opening is refused
            // rather than throwing (layout-store's defensive tone).
            console.warn("[photo-store] openDocument refused an invalid document");
            return s;
          }
          return {
            doc: parsed.data,
            activeTool: "none",
            ...CLEAR_GESTURES,
          };
        }),

      closeDocument: () =>
        // Any in-flight render belongs to the document that's leaving — drop the
        // flag with it (rendering + splitView are not "gestures", so they clear
        // explicitly rather than through CLEAR_GESTURES).
        set({ doc: null, activeTool: "none", rendering: false, splitView: false, ...CLEAR_GESTURES }),

      setLevel: (level) => set({ level }),
      // Leaving a tool drops any half-composed crop / previewing gesture and ends
      // a compare peek — a stale gesture must never survive its tool.
      setActiveTool: (activeTool) => set({ activeTool, ...CLEAR_GESTURES }),
      setCropDraft: (cropDraft) => set({ cropDraft }),
      setPreviewOp: (previewOp) => set({ previewOp }),
      setComparing: (comparing) => set({ comparing }),
      setRendering: (rendering) => set({ rendering }),
      setSplitView: (splitView) => set({ splitView }),
      setSelectedOverlayId: (selectedOverlayId) => set({ selectedOverlayId }),
      setReturnContext: (returnContext) => set({ returnContext }),

      // Overlay minting (PE6). Both append one non-coalescing history step (a
      // fresh id never matches the trailing op) with the cursor landing at the
      // recipe end, drop the redo tail like every commit, select the new overlay,
      // and clear the live draft/preview (CLEAR_DRAFT). Defaults resolve against
      // the EFFECTIVE image (the master with ops[0..cursor) applied) so a text/
      // logo lands centered on what the associate currently sees.
      addTextOverlay: () =>
        set((s) => {
          if (!s.doc) return s;
          const eff = effectiveDims(
            { w: s.doc.source.width, h: s.doc.source.height },
            s.doc.recipe.slice(0, s.doc.cursor),
          );
          const id = overlayId();
          const size = Math.max(1, Math.round(eff.h / 12));
          const boxW = Math.max(size, Math.round(eff.w * 0.6));
          const boxH = Math.max(1, Math.round(size * 1.4));
          const op: PhotoOp = {
            op: "textOverlay",
            label: "Add text",
            id,
            text: "New text",
            font: { family: DEFAULT_FAMILY, size, bold: false, italic: false },
            color: "#1a1a1a",
            align: "left",
            box: {
              x: Math.round((eff.w - boxW) / 2),
              y: Math.round((eff.h - boxH) / 2),
              w: boxW,
              h: boxH,
            },
            rotation: 0,
          };
          const recipe = [...s.doc.recipe.slice(0, s.doc.cursor), op];
          return {
            doc: { ...s.doc, recipe, cursor: recipe.length },
            selectedOverlayId: id,
            ...CLEAR_DRAFT,
          };
        }),

      addLogoOverlay: (assetId, naturalW, naturalH) =>
        set((s) => {
          if (!s.doc) return s;
          const eff = effectiveDims(
            { w: s.doc.source.width, h: s.doc.source.height },
            s.doc.recipe.slice(0, s.doc.cursor),
          );
          const id = overlayId();
          const aspect = naturalH > 0 ? naturalW / naturalH : 1;
          let boxW = Math.round(eff.w * 0.3);
          let boxH = Math.round(boxW / aspect);
          // Keep the default placement inside the image (cap the taller axis).
          const maxH = eff.h * 0.6;
          if (boxH > maxH) {
            boxH = Math.round(maxH);
            boxW = Math.round(boxH * aspect);
          }
          boxW = Math.max(1, boxW);
          boxH = Math.max(1, boxH);
          const op: PhotoOp = {
            op: "logoOverlay",
            label: "Add image",
            id,
            assetId,
            box: {
              x: Math.round((eff.w - boxW) / 2),
              y: Math.round((eff.h - boxH) / 2),
              w: boxW,
              h: boxH,
            },
            rotation: 0,
          };
          const recipe = [...s.doc.recipe.slice(0, s.doc.cursor), op];
          return {
            doc: { ...s.doc, recipe, cursor: recipe.length },
            selectedOverlayId: id,
            ...CLEAR_DRAFT,
          };
        }),

      pushOp: (op, opts) =>
        set((s) => {
          if (!s.doc) return s;
          const { recipe, cursor } = s.doc;
          // Coalesce: replace the trailing coalescible op in place, cursor
          // unchanged (the straighten-slider anti-spam rule, plan §3.4) — still
          // dropping any redo tail beyond the cursor, as every commit does. The
          // match is PARAM-AWARE for adjust (Brightness must not swallow Contrast).
          const prev = cursor > 0 ? recipe[cursor - 1] : undefined;
          if (opts?.coalesce && prev && coalesceMatch(prev, op)) {
            const next = [...recipe.slice(0, cursor - 1), op];
            return {
              doc: { ...s.doc, recipe: next, cursor },
              ...CLEAR_DRAFT,
            };
          }
          // Truncate the redo tail at the cursor, then append (plan §3.4:
          // "a new edit truncates it"). The cursor lands at the new recipe end.
          const next = [...recipe.slice(0, cursor), op];
          return {
            doc: { ...s.doc, recipe: next, cursor: next.length },
            ...CLEAR_DRAFT,
          };
        }),

      undo: () =>
        set((s) => {
          if (!s.doc) return s;
          const cursor = Math.max(0, s.doc.cursor - 1);
          if (cursor === s.doc.cursor) return s;
          return { doc: { ...s.doc, cursor }, ...CLEAR_DRAFT };
        }),

      redo: () =>
        set((s) => {
          if (!s.doc) return s;
          const cursor = Math.min(s.doc.recipe.length, s.doc.cursor + 1);
          if (cursor === s.doc.cursor) return s;
          return { doc: { ...s.doc, cursor }, ...CLEAR_DRAFT };
        }),

      setCursor: (cursor) =>
        set((s) => {
          if (!s.doc) return s;
          const next = clampCursor(s.doc, cursor);
          if (next === s.doc.cursor) return s;
          return { doc: { ...s.doc, cursor: next }, ...CLEAR_DRAFT };
        }),

      // Print metadata, NOT history: mutate doc.target only — no cursor move, no
      // recipe/tail change, and NO gesture clearing (the target changing doesn't
      // stale a half-composed crop). `intent` is preserved (setIntent owns it).
      setTarget: (target) =>
        set((s) => {
          if (!s.doc) return s;
          return {
            doc: {
              ...s.doc,
              target: { ...target, intent: s.doc.target.intent },
            },
          };
        }),

      setIntent: (intent) =>
        set((s) => {
          if (!s.doc) return s;
          if (s.doc.target.intent === intent) return s;
          return { doc: { ...s.doc, target: { ...s.doc.target, intent } } };
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
