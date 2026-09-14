"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { surfaceObjects, useLayoutStore } from "@/store";
import type {
  ArrowHead,
  ArrowHeadSize,
  FrameObject,
  LayoutDocument,
  LayoutObject,
  LineDash,
  Paint,
  Swatch,
} from "@/schema";
import { paintToCss, solidPaint } from "@/lib/color/paint";
import { ColorPicker } from "@/components/ui/ColorPicker";
import {
  DEFAULT_STROKE_PRESET,
  OBJECT_PALETTE,
  STROKE_WIDTHS,
  bboxOf,
  withBBox,
  type BBox,
} from "@/lib/layout/objects";
import {
  BANNER_DEFAULT_HEIGHT,
  BANNER_DEFAULT_INSET,
  isParametricShape,
  tailTipFor,
} from "@/lib/layout/shape-paths";
import { openPlacedPictureInPhotoEditor } from "@/lib/photo/return-trip";
import { Field, NumberField, SectionLabel } from "./Field";

/**
 * Properties inspector tab (wire region 7, live per L4): Transform X/Y/W/H
 * round-trips the selected object's bbox (a line's endpoints map through it),
 * plus Fill and Stroke rows. Each row is the shared color picker (Phase 12:
 * CMYK first, RGB, hex) behind a full-width chip of the current paint — the
 * ONE colour-selection surface, as Phase 12 specifies; the ink set (grayscale
 * ramp + brand red) rides along as the picker's presets and None is the
 * picker's own button, so the standalone swatch rows are gone.
 * A picker drag is one history step:
 * the edits ride `transient` and commitGesture closes them at release.
 * No selection shows the wire's empty state.
 * Merged prototype surfaces: a Shape section drives a parametric shape's
 * stored parameters (the adjust handles' values, numerically), and a Line
 * section drives a line's dash and arrow heads — the prototype tool options
 * bar's functions, rehomed to the inspector per this app's pattern.
 */

/** The picker's trigger face for a Fill or Stroke row: a full-width chip of
    the paint's PRINT PREVIEW, or the classic "none" diagonal when the paint is
    null. `to top right` puts the band corner to corner at any chip size, so
    one rule covers the row however wide the inspector gets. */
function PaintChip({
  paint,
  swatches,
  testId,
}: {
  paint: Paint | null;
  swatches: readonly Swatch[];
  testId: string;
}) {
  return (
    <span
      data-testid={testId}
      data-none={paint === null ? "true" : undefined}
      className="block h-[26px] w-full rounded-[5px] border border-[#d6d6d6]"
      style={
        paint
          ? { backgroundColor: paintToCss(paint, swatches) }
          : {
              background:
                "linear-gradient(to top right, #fff calc(50% - 0.5px), var(--color-brand) calc(50% - 0.5px), var(--color-brand) calc(50% + 0.5px), #fff calc(50% + 0.5px))",
            }
      }
    />
  );
}

/** One 26px select row for the Line section's enum options. */
function DecorSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-[54px] shrink-0 text-[10px] text-[#999]">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        data-testid={testId}
        aria-label={label}
        className="h-[26px] flex-1 cursor-pointer rounded-[5px] border border-[#d6d6d6] bg-white px-[6px] text-[12px] text-[#444] outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const HEAD_OPTIONS: readonly { value: ArrowHead; label: string }[] = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow" },
  { value: "circle", label: "Circle" },
  { value: "diamond", label: "Diamond" },
];
const HEAD_SIZE_OPTIONS: readonly { value: ArrowHeadSize; label: string }[] = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
];
const DASH_OPTIONS: readonly { value: LineDash; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

/** The Shape section's parameter fields for one parametric kind — numeric
    twins of the canvas adjust handles, committing through the same store
    action (adjustShape clamps). */
function ShapeParams({ obj }: { obj: FrameObject }) {
  const adjustShape = useLayoutStore((s) => s.adjustShape);
  const two = (v: number) => (Math.round(v * 100) / 100).toString();
  if (obj.type === "roundedRect") {
    return (
      <div className="flex gap-2">
        <NumberField
          label="Corner radius"
          value={obj.cornerRadius ?? 0}
          onCommit={(v) => adjustShape(obj.id, { cornerRadius: v })}
          testId="prop-corner-radius"
        />
        <div className="flex-1" />
      </div>
    );
  }
  if (obj.type === "starPolygon") {
    return (
      <div className="flex gap-2">
        <NumberField
          label="Points"
          value={obj.points ?? 5}
          onCommit={(v) => adjustShape(obj.id, { points: v })}
          testId="prop-star-points"
          raw
          format={(v) => String(Math.round(v))}
        />
        <NumberField
          label="Inner radius"
          value={obj.innerRadiusRatio ?? 0.5}
          onCommit={(v) => adjustShape(obj.id, { innerRadiusRatio: v })}
          testId="prop-star-ratio"
          raw
          format={two}
        />
      </div>
    );
  }
  if (obj.type === "callout") {
    const tip = obj.tailTip ?? tailTipFor("bottom-left");
    return (
      <div className="flex gap-2">
        <NumberField
          label="Tail X"
          value={tip.x}
          onCommit={(v) => adjustShape(obj.id, { tailTip: { ...tip, x: v } })}
          testId="prop-tail-x"
          raw
          format={two}
        />
        <NumberField
          label="Tail Y"
          value={tip.y}
          onCommit={(v) => adjustShape(obj.id, { tailTip: { ...tip, y: v } })}
          testId="prop-tail-y"
          raw
          format={two}
        />
      </div>
    );
  }
  // banner — the two ribbon parameters, as fractions of the frame
  return (
    <div className="flex gap-2">
      <NumberField
        label="Panel inset"
        value={obj.panelInset ?? BANNER_DEFAULT_INSET}
        onCommit={(v) => adjustShape(obj.id, { panelInset: v })}
        testId="prop-panel-inset"
        raw
        format={two}
      />
      <NumberField
        label="Panel height"
        value={obj.panelHeight ?? BANNER_DEFAULT_HEIGHT}
        onCommit={(v) => adjustShape(obj.id, { panelHeight: v })}
        testId="prop-panel-height"
        raw
        format={two}
      />
    </div>
  );
}

export function PropertiesTab() {
  const objects = useLayoutStore(surfaceObjects);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const transformObject = useLayoutStore((s) => s.transformObject);
  const setObjectProps = useLayoutStore((s) => s.setObjectProps);
  const commitGesture = useLayoutStore((s) => s.commitGesture);
  const swatches = useLayoutStore((s) => s.doc.swatches);
  const setLineDecor = useLayoutStore((s) => s.setLineDecor);
  const revertPhotoEdit = useLayoutStore((s) => s.revertPhotoEdit);
  const dragBefore = useRef<LayoutDocument | null>(null);
  const docName = useLayoutStore((s) => s.doc.name);
  const router = useRouter();
  const [photoNote, setPhotoNote] = useState<string | null>(null);

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
  const dragStart = () => {
    dragBefore.current = useLayoutStore.getState().doc;
  };
  const dragEnd = () => {
    if (dragBefore.current) commitGesture(dragBefore.current);
    dragBefore.current = null;
  };
  const setFill = (fill: Paint | null, live: boolean) => setObjectProps(obj.id, { fill }, live);
  const setStrokePaint = (paint: Paint | null, live: boolean) =>
    setObjectProps(obj.id, { stroke: paint ? { paint, width: stroke?.width ?? 1 } : null }, live);

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
        {!line && (
          <div className="mt-2 flex gap-2">
            <NumberField
              label="Rotation"
              value={obj.rotation}
              onCommit={(v) => transformObject(obj.id, { rotation: v })}
              testId="prop-rotation"
              raw
              suffix="°"
              ariaUnit="degrees"
              format={(v) => String(Math.round(v))}
            />
            <div className="flex-1" />
          </div>
        )}
      </div>

      {obj.type !== "line" && isParametricShape(obj) && (
        <div>
          <SectionLabel>Shape</SectionLabel>
          <ShapeParams obj={obj} />
        </div>
      )}

      {obj.type === "picture" && (
        <div>
          <SectionLabel>Photo</SectionLabel>
          <button
            type="button"
            data-testid="layout-edit-in-photo"
            disabled={!obj.assetId}
            title={
              obj.assetId
                ? "Open this picture in the Photo Editor — comes right back to this page"
                : "Add an image to this frame first"
            }
            onClick={() => {
              setPhotoNote(null);
              void openPlacedPictureInPhotoEditor(obj, docName, router).then((res) => {
                if (!res.ok) setPhotoNote(res.message);
              });
            }}
            className={`flex h-[28px] w-full items-center justify-center gap-1 rounded-[5px] border text-[11px] font-semibold ${
              obj.assetId
                ? "cursor-pointer border-brand text-brand hover:bg-[#fff5f5]"
                : "cursor-not-allowed border-[#e0e0e0] text-[#bbb]"
            }`}
          >
            Edit in Photo Editor →
          </button>
          <div className="mt-1 text-[10px] leading-snug text-[#aaa]">
            Full tools — comes right back to this page.
          </div>
          {obj.photoEdit && (
            <button
              type="button"
              data-testid="layout-revert-photo-edits"
              onClick={() => {
                setPhotoNote(null);
                revertPhotoEdit(obj.id);
              }}
              title="Restore the original image and drop the photo edits (one step)"
              className="mt-2 flex h-[26px] w-full cursor-pointer items-center justify-center rounded-[5px] border border-[#d6d6d6] bg-white text-[11px] text-[#555] hover:border-[#c0c0c0] hover:bg-[#fafafa]"
            >
              Revert photo edits
            </button>
          )}
          {photoNote && (
            <div className="mt-2 rounded-[5px] border border-[#f0c9c9] bg-[#FBEBEB] px-2 py-1 text-[10px] leading-snug text-[#9a1818]">
              {photoNote}
            </div>
          )}
        </div>
      )}

      {!line && (
        <div>
          <SectionLabel>Fill</SectionLabel>
          <ColorPicker
            value={obj.fill}
            onChange={setFill}
            onDragStart={dragStart}
            onDragEnd={dragEnd}
            swatches={swatches}
            presets={OBJECT_PALETTE}
            allowNone
            ariaLabel="Fill color"
            testIdPrefix="fill-picker"
            triggerClassName="block w-full"
          >
            <PaintChip paint={obj.fill} swatches={swatches} testId="fill-chip" />
          </ColorPicker>
        </div>
      )}

      <div>
        <SectionLabel>Stroke</SectionLabel>
        <div className="mb-2">
          <ColorPicker
            value={stroke?.paint ?? null}
            onChange={setStrokePaint}
            onDragStart={dragStart}
            onDragEnd={dragEnd}
            swatches={swatches}
            presets={OBJECT_PALETTE}
            allowNone={!line}
            ariaLabel="Stroke color"
            testIdPrefix="stroke-picker"
            triggerClassName="block w-full"
          >
            <PaintChip paint={stroke?.paint ?? null} swatches={swatches} testId="stroke-chip" />
          </ColorPicker>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-[#999]">Width</div>
          <select
            value={stroke?.width ?? ""}
            onChange={(e) =>
              setObjectProps(obj.id, {
                stroke: { paint: stroke?.paint ?? solidPaint(DEFAULT_STROKE_PRESET), width: Number(e.target.value) },
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

      {obj.type === "line" && (
        <div>
          <SectionLabel>Line</SectionLabel>
          <div className="flex flex-col gap-2">
            <DecorSelect
              label="Dash"
              value={obj.dash ?? "solid"}
              options={DASH_OPTIONS}
              onChange={(v) => setLineDecor(obj.id, { dash: v })}
              testId="prop-line-dash"
            />
            <DecorSelect
              label="Start head"
              value={obj.headStart ?? "none"}
              options={HEAD_OPTIONS}
              onChange={(v) => setLineDecor(obj.id, { headStart: v })}
              testId="prop-head-start"
            />
            <DecorSelect
              label="End head"
              value={obj.headEnd ?? "none"}
              options={HEAD_OPTIONS}
              onChange={(v) => setLineDecor(obj.id, { headEnd: v })}
              testId="prop-head-end"
            />
            <DecorSelect
              label="Head size"
              value={obj.headSize ?? "m"}
              options={HEAD_SIZE_OPTIONS}
              onChange={(v) => setLineDecor(obj.id, { headSize: v })}
              testId="prop-head-size"
            />
          </div>
        </div>
      )}
    </div>
  );
}
