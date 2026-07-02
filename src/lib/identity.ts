import { z } from "zod";

/**
 * STUB: Station identity — returns the demo station hardcoded from the wires.
 * CONTRACT: getCurrentStation(): StationRef — keep this signature; every
 * surface that needs "which station is this" resolves it here and only here.
 * PROD-TODO: replace the body with real station/associate resolution (device
 * registration or SSO session). The swap touches only this file.
 */

export const StationRefSchema = z.object({
  /** Store number as displayed, e.g. "#1284". */
  id: z.string(),
});
export type StationRef = z.infer<typeof StationRefSchema>;

export function getCurrentStation(): StationRef {
  // ASSUMPTION: "#1284" is demo copy from the handoff wires, not a real store.
  return { id: "#1284" };
}
