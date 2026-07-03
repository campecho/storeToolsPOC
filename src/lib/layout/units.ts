/**
 * Display units (plan L11). The document stays canonical inches everywhere;
 * these convert for display and parse back on input. 96 px/in, 25.4 mm/in,
 * 72 pt/in. Only presentation depends on the unit — geometry never does.
 */

export type Unit = "in" | "mm" | "px" | "pt";

export const UNITS: readonly Unit[] = ["in", "mm", "px", "pt"];

export const UNIT_PER_IN: Record<Unit, number> = { in: 1, mm: 25.4, px: 96, pt: 72 };

/** Decimals kept per unit when formatting for display (trailing zeros trimmed). */
const UNIT_DECIMALS: Record<Unit, number> = { in: 4, mm: 2, px: 0, pt: 1 };

export function isUnit(v: unknown): v is Unit {
  return typeof v === "string" && (UNITS as readonly string[]).includes(v);
}

/** Inches → a trimmed display string in `unit` ("8.5", "216", "612"). */
export function formatLen(inches: number, unit: Unit): string {
  const v = inches * UNIT_PER_IN[unit];
  return Number(v.toFixed(UNIT_DECIMALS[unit])).toString();
}

/** A display string in `unit` → inches. NaN when unparseable (callers guard). */
export function parseLen(str: string, unit: Unit): number {
  return Number(str) / UNIT_PER_IN[unit];
}
