/**
 * Tools whose canvas behavior is implemented (PLAN.md §7 Phase A posture:
 * every tool visible with its contract, nothing drawing yet). The registry's
 * tier stays pure specification; the shell derives "not wired yet" from this
 * set, which grows as Phase B groups land.
 */
export const WIRED_TOOLS: ReadonlySet<string> = new Set(["zoom", "pan"]);
