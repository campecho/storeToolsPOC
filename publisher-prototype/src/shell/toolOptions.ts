import type { DrawStyle, LineExtras } from "../core/gestures";
import type { ArrowHead, ArrowHeadSize, LineDash, Paint, Stroke } from "../core/model";
import { toolRegistry } from "../core/registry";
import { hexToColorValue } from "../core/render/paint";

/**
 * Live tool-option values (PLAN.md §2 options bar, wired phase): App-level
 * React state keyed toolId → optionId, initialized from each contract's
 * option defaults so the registry stays the single source of the reviewable
 * option set. Deliberately not store state — option values are tool-ctx
 * inputs to the next gesture, not document or viewport state.
 */

export type ToolOptionValue = string | number | boolean;
export type ToolOptionValues = Record<string, Record<string, ToolOptionValue>>;

/** Every registry tool's options at their contract defaults. */
export function defaultToolOptions(): ToolOptionValues {
  const values: ToolOptionValues = {};
  for (const tool of toolRegistry) {
    const perTool: Record<string, ToolOptionValue> = {};
    for (const option of tool.options) perTool[option.id] = option.default;
    values[tool.id] = perTool;
  }
  return values;
}

/** Typed read with a fallback — values initialize from the contracts, so the
    fallback only guards a mistyped id or a wrong-kinded entry. */
export function optionNumber(
  values: ToolOptionValues,
  toolId: string,
  optionId: string,
  fallback: number,
): number {
  const value = values[toolId]?.[optionId];
  return typeof value === "number" ? value : fallback;
}

/** Boolean-option read with a fallback — same guard rule as optionNumber. */
export function optionBoolean(
  values: ToolOptionValues,
  toolId: string,
  optionId: string,
  fallback: boolean,
): boolean {
  const value = values[toolId]?.[optionId];
  return typeof value === "boolean" ? value : fallback;
}

/** Enum-option read: the live value if it is one of the contract's declared
    members, the fallback otherwise — same guard rule as optionNumber. */
export function optionEnum<T extends string>(
  values: ToolOptionValues,
  toolId: string,
  optionId: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = values[toolId]?.[optionId];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * The DrawStyle a draw machine's ctx consumes, from the tool's live options:
 * `fill`/`stroke` hex colors become literal rgb Paints (hexToColorValue),
 * `strokeWidth` is points per the contracts. A tool without a fill option
 * (line) draws with fill null; ditto stroke.
 */
const ARROW_HEADS: readonly ArrowHead[] = ["none", "arrow", "circle", "diamond"];
const HEAD_SIZES: readonly ArrowHeadSize[] = ["s", "m", "l"];
const DASHES: readonly LineDash[] = ["solid", "dashed", "dotted"];

/**
 * The line-decoration fields a line-family tool's options bake onto the
 * committed object (heads and dash). Schema defaults — "none", "m",
 * "solid" — are OMITTED rather than stored, per the additive rule: absent
 * means the default, and documents stay lean.
 */
export function lineExtrasFromOptions(values: ToolOptionValues, toolId: string): LineExtras {
  const extras: LineExtras = {};
  const headStart = optionEnum(values, toolId, "headStart", ARROW_HEADS, "none");
  const headEnd = optionEnum(values, toolId, "headEnd", ARROW_HEADS, "none");
  const headSize = optionEnum(values, toolId, "headSize", HEAD_SIZES, "m");
  const dash = optionEnum(values, toolId, "dash", DASHES, "solid");
  if (headStart !== "none") extras.headStart = headStart;
  if (headEnd !== "none") extras.headEnd = headEnd;
  if (headSize !== "m") extras.headSize = headSize;
  if (dash !== "solid") extras.dash = dash;
  return extras;
}

export function drawStyleFromOptions(values: ToolOptionValues, toolId: string): DrawStyle {
  const options = values[toolId] ?? {};
  const fillHex = typeof options.fill === "string" ? options.fill : null;
  const strokeHex = typeof options.stroke === "string" ? options.stroke : null;
  const strokeWidth = typeof options.strokeWidth === "number" ? options.strokeWidth : 1;
  const fill: Paint | null =
    fillHex === null ? null : { kind: "color", color: hexToColorValue(fillHex) };
  const stroke: Stroke | null =
    strokeHex === null
      ? null
      : { paint: { kind: "color", color: hexToColorValue(strokeHex) }, width: strokeWidth };
  return { fill, stroke };
}
