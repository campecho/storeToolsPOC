/**
 * Shell-owned id source for drawn objects: gesture machines take ids through
 * an injected factory so core stays deterministic (same pointer stream, same
 * committed object); the randomness lives here, at the edge.
 */
export function createObjectId(): string {
  return crypto.randomUUID();
}

/** The same rule for the ids `object/groupCommitted` mints: a group is not an
    object, but its id is minted at this same edge and travels in the payload,
    so the reducer only ever applies one. */
export function createGroupId(): string {
  return crypto.randomUUID();
}
