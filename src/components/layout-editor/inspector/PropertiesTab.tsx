"use client";

import { surfaceObjects, useLayoutStore } from "@/store";
import type { LayoutObject } from "@/schema";
import {
  OBJECT_PALETTE,
  STROKE_WIDTHS,
  bboxOf,
  withBBox,
  type BBox,
} from "@/lib/layout/objects";
import { Field, NumberField, SectionLabel } from "./Field";

/**
 * Properties inspector tab (wire region 7, live per L4): Transform X/Y/W/H
 * round-trips the selected object's bbox (a line's endpoints map through it),
 * plus minimal Fill and Stroke rows — grayscale ramp + brand red + none, the
 * wireframe language's ink set. No selection shows the wire's empty state.
 */

function Swatch({
  color,
  active,
  onPick,
  testId,
}: {
  color: string | null;
  active: boolean;
  onPick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={testId}
      aria-label={color ?? "None"}
      aria-pressed={active}
      className={`relative h-[18px] w-[18px] cursor-pointer rounded-[4px] border ${
        active ? "border-[1.5px] border-brand" : "border-[#d6d6d6]"
      }`}
      style={{ backgroundColor: color ?? "#ffffff" }}
    >
      {color === null && (
        // the classic "none" diagonal
        <span className="absolute inset-0 overflow-hidden rounded-[3px]">
          <span className="absolute left-1/2 top-1/2 h-[26px] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brand" />
        </span>
      )}
    </button>
  );
}

export function PropertiesTab() {
  const objects = useLayoutStore(surfaceObjects);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const transformObject = useLayoutStore((s) => s.transformObject);
  const setObjectProps = useLayoutStore((s) => s.setObjectProps);

  const obj: LayoutObject | undefined =
    selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) : undefined;

  if (!obj) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-dashed border-[#d8d8d8] bg-[#fafafa] p-4 text-center">
          <div className="text-[12px] text-[#888]">Nothing selected</div>
          <div className="mt-1 text-[11px] text-[#aaa]">
            Select an object on the page to edit its position, size, fill, and stroke.
          </div>
        </div>

        <div className="opacity-50">
          <SectionLabel>Transform</SectionLabel>
          <div className="mb-2 flex gap-2">
            <Field label="X" value="— in" muted />
            <Field label="Y" value="— in" muted />
          </div>
          <div className="flex gap-2">
            <Field label="W" value="— in" muted />
            <Field label="H" value="— in" muted />
          </div>
        </div>
      </div>
    );
  }

  const b = bboxOf(obj);
  const line = obj.type === "line";

  const commitBBox = (patch: Partial<BBox>) => {
    const next = withBBox(obj, { ...b, ...patch });
    transformObject(
      obj.id,
      next.type === "line"
        ? { x1: next.x1, y1: next.y1, x2: next.x2, y2: next.y2 }
        : { x: next.x, y: next.y, w: next.w, h: next.h },
    );
  };

  const stroke = obj.stroke;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Transform</SectionLabel>
        <div className="mb-2 flex gap-2">
          <NumberField label="X" value={b.x} onCommit={(v) => commitBBox({ x: v })} testId="prop-x" />
          <NumberField label="Y" value={b.y} onCommit={(v) => commitBBox({ y: v })} testId="prop-y" />
        </div>
        <div className="flex gap-2">
          <NumberField label="W" value={b.w} onCommit={(v) => commitBBox({ w: v })} testId="prop-w" />
          <NumberField label="H" value={b.h} onCommit={(v) => commitBBox({ h: v })} testId="prop-h" />
        </div>
      </div>

      {!line && (
        <div>
          <SectionLabel>Fill</SectionLabel>
          <div className="flex flex-wrap gap-[6px]">
            <Swatch
              color={null}
              active={obj.fill === null}
              onPick={() => setObjectProps(obj.id, { fill: null })}
              testId="fill-none"
            />
            {OBJECT_PALETTE.map((c) => (
              <Swatch
                key={c}
                color={c}
                active={obj.fill?.toLowerCase() === c.toLowerCase()}
                onPick={() => setObjectProps(obj.id, { fill: c })}
                testId={`fill-${c.slice(1)}`}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Stroke</SectionLabel>
        <div className="mb-2 flex flex-wrap gap-[6px]">
          {!line && (
            <Swatch
              color={null}
              active={stroke === null}
              onPick={() => setObjectProps(obj.id, { stroke: null })}
              testId="stroke-none"
            />
          )}
          {OBJECT_PALETTE.map((c) => (
            <Swatch
              key={c}
              color={c}
              active={stroke?.color.toLowerCase() === c.toLowerCase()}
              onPick={() =>
                setObjectProps(obj.id, { stroke: { color: c, width: stroke?.width ?? 1 } })
              }
              testId={`stroke-${c.slice(1)}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-[#999]">Width</div>
          <select
            value={stroke?.width ?? ""}
            onChange={(e) =>
              setObjectProps(obj.id, {
                stroke: { color: stroke?.color ?? "#555555", width: Number(e.target.value) },
              })
            }
            data-testid="stroke-width"
            aria-label="Stroke width"
            className="h-[26px] flex-1 cursor-pointer rounded-[5px] border border-[#d6d6d6] bg-white px-[6px] text-[12px] text-[#444] outline-none"
          >
            {stroke === null && (
              <option value="" disabled>
                —
              </option>
            )}
            {STROKE_WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w} px
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
