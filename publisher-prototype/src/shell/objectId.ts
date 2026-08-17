/**
 * Shell-owned id source for drawn objects: gesture machines take ids through
 * an injected factory so core stays deterministic (same pointer stream, same
 * committed object); the randomness lives here, at the edge.
 */
export function createObjectId(): string {
  return crypto.randomUUID();
}
