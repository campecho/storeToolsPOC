import {
  BASE_LAYER_ID,
  baseLayerDef,
  type LayerDef,
  type LayoutDocument,
  type LayoutObject,
  type LayoutPage,
  type PageLayer,
} from "@/lib/schema";

/**
 * Layer model helpers (schema v3, redesign Phase 5) — framework-free, pure.
 * Invariants they maintain:
 *  - `doc.layers` is bottom-to-top and never empty;
 *  - every page carries exactly one PageLayer per definition, same order;
 *  - whole-page z-order is the concatenation of layer contents.
 */

/** New-layer accent palette (figma "Layers Tab" row bars), cycled by index. */
export const LAYER_COLORS = ["#41b6e6", "#aed76f", "#cc0000", "#f5be2f", "#086dd2", "#bcbcbc"];

/** Whole-page z-order: layer contents concatenated bottom-to-top. Memoized
    per page object — pages are immutable between edits, and store selectors
    (`useLayoutStore(surfaceObjects)`) need a stable array identity per
    snapshot or React re-renders forever. */
const flatCache = new WeakMap<LayoutPage, LayoutObject[]>();
export function flattenPage(page: LayoutPage): LayoutObject[] {
  let flat = flatCache.get(page);
  if (!flat) {
    flat = page.layers.flatMap((l) => l.objects);
    flatCache.set(page, flat);
  }
  return flat;
}

/** The layer an object sits on, or undefined for an unknown id. */
export function layerOfObject(page: LayoutPage, objectId: string): string | undefined {
  return page.layers.find((l) => l.objects.some((o) => o.id === objectId))?.layerId;
}

/** Layer ids that render (visible). */
export function visibleLayerIds(doc: LayoutDocument): Set<string> {
  return new Set(doc.layers.filter((l) => l.visible).map((l) => l.id));
}

/** Layer ids that accept selection/editing (visible and not locked). */
export function editableLayerIds(doc: LayoutDocument): Set<string> {
  return new Set(doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
}

/**
 * Redistribute an edited FLAT object array back into a page's layers: every
 * surviving object stays on its layer, ordered by its position in `flat`;
 * objects with unknown ids (fresh draws, pastes) land on `targetLayerId`.
 * This is what keeps z-reorder actions clamped to their layer band — a
 * permutation of the flat array can only reorder objects *within* each layer.
 */
export function distributeToLayers(
  page: LayoutPage,
  flat: LayoutObject[],
  targetLayerId: string,
): PageLayer[] {
  const home = new Map<string, string>();
  for (const l of page.layers) for (const o of l.objects) home.set(o.id, l.layerId);
  const fallback = page.layers.some((l) => l.layerId === targetLayerId)
    ? targetLayerId
    : page.layers[0].layerId;
  const buckets = new Map<string, LayoutObject[]>(page.layers.map((l) => [l.layerId, []]));
  for (const o of flat) {
    const layerId = home.get(o.id) ?? fallback;
    (buckets.get(layerId) ?? buckets.get(fallback))!.push(o);
  }
  return page.layers.map((l) => ({ ...l, objects: buckets.get(l.layerId)! }));
}

/**
 * Normalize a document so every page carries one PageLayer per definition, in
 * definition order. Content on a page-layer whose definition vanished merges
 * into the base (first) layer rather than dropping. Cheap when already
 * normal — returns the input document unchanged.
 */
export function ensurePageLayers(doc: LayoutDocument): LayoutDocument {
  const defs = doc.layers.length ? doc.layers : [baseLayerDef()];
  const ids = defs.map((d) => d.id);
  let changed = doc.layers.length === 0;
  const pages = doc.pages.map((p) => {
    const inOrder =
      p.layers.length === ids.length && p.layers.every((l, i) => l.layerId === ids[i]);
    if (inOrder) return p;
    changed = true;
    const orphans = p.layers.filter((l) => !ids.includes(l.layerId)).flatMap((l) => l.objects);
    const layers = ids.map((id, i) => ({
      layerId: id,
      objects: [
        ...(i === 0 ? orphans : []),
        ...(p.layers.find((l) => l.layerId === id)?.objects ?? []),
      ],
    }));
    return { ...p, layers };
  });
  return changed ? { ...doc, layers: defs, pages } : doc;
}

let layerSeq = 0;
/** New empty layer on top of the stack, on every page. */
export function addLayer(doc: LayoutDocument, name?: string): { doc: LayoutDocument; id: string } {
  const id = `layer-${Date.now().toString(36)}-${(layerSeq++).toString(36)}`;
  const def: LayerDef = {
    id,
    name: name ?? `Layer ${doc.layers.length + 1}`,
    color: LAYER_COLORS[doc.layers.length % LAYER_COLORS.length],
    visible: true,
    locked: false,
    nonPrint: false,
  };
  return {
    id,
    doc: {
      ...doc,
      layers: [...doc.layers, def],
      pages: doc.pages.map((p) => ({ ...p, layers: [...p.layers, { layerId: id, objects: [] }] })),
    },
  };
}

/** Patch one layer definition (rename, visible/locked/nonPrint toggles). */
export function patchLayer(
  doc: LayoutDocument,
  layerId: string,
  patch: Partial<Omit<LayerDef, "id">>,
): LayoutDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
  };
}

/**
 * Merge a layer's contents into its neighbor and delete it — the figma's
 * "Merge Down" (the bottom layer merges up instead; the last layer refuses).
 * The merged content stacks ABOVE the receiving layer's existing objects,
 * preserving what was visually on top. Returns null when refused.
 */
export function mergeLayer(doc: LayoutDocument, layerId: string): LayoutDocument | null {
  const idx = doc.layers.findIndex((l) => l.id === layerId);
  if (idx === -1 || doc.layers.length < 2) return null;
  const intoIdx = idx > 0 ? idx - 1 : 1;
  const intoId = doc.layers[intoIdx].id;
  return {
    ...doc,
    layers: doc.layers.filter((l) => l.id !== layerId),
    pages: doc.pages.map((p) => {
      const from = p.layers.find((l) => l.layerId === layerId);
      return {
        ...p,
        layers: p.layers
          .filter((l) => l.layerId !== layerId)
          .map((l) =>
            l.layerId === intoId
              ? { ...l, objects: [...l.objects, ...(from?.objects ?? [])] }
              : l,
          ),
      };
    }),
  };
}

/** Move a layer to a new stack position (indexes into the bottom-to-top list). */
export function reorderLayer(doc: LayoutDocument, from: number, to: number): LayoutDocument {
  if (from === to || from < 0 || to < 0 || from >= doc.layers.length || to >= doc.layers.length) {
    return doc;
  }
  const move = <T>(arr: T[]): T[] => {
    const next = [...arr];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    return next;
  };
  return {
    ...doc,
    layers: move(doc.layers),
    pages: doc.pages.map((p) => ({ ...p, layers: move(p.layers) })),
  };
}

/** Move objects (by id) onto a layer, on the page that holds them — they
    stack above the target layer's existing content, keeping relative order. */
export function moveObjectsToLayer(
  doc: LayoutDocument,
  pageId: string,
  objectIds: string[],
  layerId: string,
): LayoutDocument {
  if (!doc.layers.some((l) => l.id === layerId)) return doc;
  const ids = new Set(objectIds);
  return {
    ...doc,
    pages: doc.pages.map((p) => {
      if (p.id !== pageId) return p;
      const picked = flattenPage(p).filter((o) => ids.has(o.id));
      if (!picked.length) return p;
      return {
        ...p,
        layers: p.layers.map((l) => ({
          ...l,
          objects:
            l.layerId === layerId
              ? [...l.objects.filter((o) => !ids.has(o.id)), ...picked]
              : l.objects.filter((o) => !ids.has(o.id)),
        })),
      };
    }),
  };
}

export { BASE_LAYER_ID };
