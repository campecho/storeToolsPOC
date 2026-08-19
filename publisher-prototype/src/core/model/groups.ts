import type { Group } from "./document";
import type { LayoutObject } from "./objects";

/**
 * Group membership over the schema-v3 grouping model (SEAMS decision of
 * record 2026-08-17): `doc.groups` is a flat list of `{ id, parentGroupId? }`
 * and objects join via `groupId`. Groups own no geometry, so everything here
 * is pure id bookkeeping — this layer decides WHICH objects a selection
 * gesture acts on, and the transform machines then treat the result as any
 * other multi-selection.
 */

/**
 * The chain from `groupId` outward to its root: `[groupId, …, root]`, empty
 * for an ungrouped object. An unresolvable id or a parent cycle (a malformed
 * document) terminates the walk rather than looping — a group that cannot be
 * resolved simply stops contributing ancestors.
 */
export function groupAncestry(groups: readonly Group[], groupId: string | undefined): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = groupId;
  while (current !== undefined && !seen.has(current)) {
    const group = groups.find((g) => g.id === current);
    if (group === undefined) break;
    seen.add(current);
    chain.push(current);
    current = group.parentGroupId;
  }
  return chain;
}

/**
 * Every UNLOCKED object inside `groupId` at any nesting depth, in the
 * caller's order (the page's z-order). Locked members stay out: the select
 * tool skips locked objects by contract (`selectTool.hitTest.lockedObjects`),
 * so a locked member never joins a selection by being clicked and must not
 * join one by being grouped either.
 */
export function groupMemberIds(
  objects: readonly LayoutObject[],
  groups: readonly Group[],
  groupId: string,
): string[] {
  return objects
    .filter((o) => !o.locked && groupAncestry(groups, o.groupId).includes(groupId))
    .map((o) => o.id);
}

/** What a selection gesture resolves to: the object ids it acts on, plus the
    group context they were resolved in (null = the page's top level). */
export type SelectionUnit = { ids: string[]; enteredGroupId: string | null };

/**
 * The group a click lands on inside `enteredGroupId`, and the context that
 * survives the click. With no context the unit is the chain's ROOT group —
 * a group selects whole. Inside a context the unit is the one level below it,
 * so clicks reach a nested subgroup and then its members. A chain that does
 * not contain the context belongs to an object outside it, and the click
 * leaves the context (`context: null`).
 */
function resolveUnit(
  chain: readonly string[],
  enteredGroupId: string | null,
): { unit: string | undefined; context: string | null } {
  const at = enteredGroupId === null ? -1 : chain.indexOf(enteredGroupId);
  return {
    unit: chain[at === -1 ? chain.length - 1 : at - 1],
    context: at === -1 ? null : enteredGroupId,
  };
}

/**
 * The unit a click on `objectId` selects: the outermost group the object
 * belongs to, or the object itself when it is ungrouped or already at the
 * entered level — so a group moves, resizes and rotates as one thing until
 * it is entered.
 *
 * The returned `enteredGroupId` is the context the click ENDS in, which is
 * why callers apply both fields together: clicking outside the entered group
 * leaves it.
 */
export function selectionUnit(
  objects: readonly LayoutObject[],
  groups: readonly Group[],
  objectId: string,
  enteredGroupId: string | null,
): SelectionUnit {
  const object = objects.find((o) => o.id === objectId);
  const { unit, context } = resolveUnit(groupAncestry(groups, object?.groupId), enteredGroupId);
  return {
    ids: unit === undefined ? [objectId] : groupMemberIds(objects, groups, unit),
    enteredGroupId: context,
  };
}

/**
 * The context a double-click on `objectId` descends into and the sub-unit it
 * selects there (select.double-click-group.enters-group) — null when the
 * object is already at the current level and there is nothing deeper to
 * enter. Each double-click descends exactly one level, so a nested group is
 * reached by repeating it.
 */
export function enteredGroup(
  objects: readonly LayoutObject[],
  groups: readonly Group[],
  objectId: string,
  enteredGroupId: string | null,
): { groupId: string; ids: string[] } | null {
  const object = objects.find((o) => o.id === objectId);
  const { unit } = resolveUnit(groupAncestry(groups, object?.groupId), enteredGroupId);
  if (unit === undefined) return null;
  return { groupId: unit, ids: selectionUnit(objects, groups, objectId, unit).ids };
}
