import type { Group } from "./document";
import type { LayoutObject } from "./objects";

/**
 * Materializing copies of a selection — the one place objects and their
 * groups are cloned with fresh ids.
 *
 * Three bindings land here: select.alt-drag.duplicates (the drag's travel is
 * the offset), document.ctrl-d.duplicates-selection, and
 * document.ctrl-v.pastes-clipboard (both use a fixed offset). They differ
 * only in where the copies land, so they share the copying itself rather
 * than each growing a version of it.
 *
 * Group membership is copied, not shared: each group among the originals
 * gets a fresh id and the copies join those. Sharing the originals' ids would
 * silently enlarge the source group with objects the user meant to separate.
 */

export type CopyRequest = {
  /** The objects to copy, in z-order. */
  objects: readonly LayoutObject[];
  /** The groups to copy with them — `copiedGroups` decides which qualify. */
  groups: readonly Group[];
  dx: number;
  dy: number;
  idFactory: () => string;
  groupIdFactory: () => string;
};

/** One object shifted by (dx, dy): a frame by its origin, a line by both
    endpoints — the same split every translate here makes. */
export function translated(obj: LayoutObject, dx: number, dy: number): LayoutObject {
  return obj.type === "line"
    ? { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy }
    : { ...obj, x: obj.x + dx, y: obj.y + dy };
}

export function copiesOf(request: CopyRequest): { objects: LayoutObject[]; groups: Group[] } {
  const { dx, dy, idFactory, groupIdFactory } = request;
  // Old group id → fresh one, minted before any object reads it so nesting
  // and membership both resolve against the same map.
  const groupIds = new Map(request.groups.map((g) => [g.id, groupIdFactory()] as const));
  const groups: Group[] = request.groups.map((g) => {
    const parent = g.parentGroupId === undefined ? undefined : groupIds.get(g.parentGroupId);
    return {
      id: groupIds.get(g.id) ?? groupIdFactory(),
      // A parent outside the copied set stays behind: the copy joins the page
      // at that level rather than reaching into the original's tree.
      ...(parent === undefined ? {} : { parentGroupId: parent }),
      ...(g.rotation === undefined ? {} : { rotation: g.rotation }),
    };
  });
  const objects = request.objects.map((obj) => {
    const groupId = obj.groupId === undefined ? undefined : groupIds.get(obj.groupId);
    const copy = { ...translated(obj, dx, dy), id: idFactory() };
    if (groupId === undefined) delete copy.groupId;
    else copy.groupId = groupId;
    return copy;
  });
  return { objects, groups };
}
