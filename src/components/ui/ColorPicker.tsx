"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pipette, TriangleAlert } from "lucide-react";
import type { ColorValue, Paint, Swatch } from "@/schema";
import {
  clamp01,
  colorEquals,
  formatHex,
  hsvToRgb,
  parseHex,
  rgbToHsv,
  to255,
  toPercent,
  type Cmyk,
  type Hsv,
  type Rgb,
} from "@/lib/color/convert";
import { paintKey, paintToCss, resolvePaintColor, solidPaint } from "@/lib/color/paint";
import { isOutOfGamut, pressCmyk, proofCmyk, proofColor } from "@/lib/color/proof";
import { Popover } from "./Popover";
import { TabStrip } from "./TabStrip";

/**
 * The color picker (redesign plan Phase 12): CMYK first, then RGB and Hex.
 * A visual saturation/brightness field and hue strip on top; per-channel
 * sliders with numeric fields in CMYK and RGB modes, a text field in Hex;
 * a proofed preview with the value in the other space and a gamut warning
 * for RGB colors that will shift on press; presets, document swatches, None,
 * and the eyedropper where the browser has one.
 *
 * What is stored: in CMYK mode a `cmyk` literal with the typed numbers; in
 * RGB and Hex modes an `rgb` literal. The visual field commits in the active
 * mode — in CMYK mode the separation the press profile assigns the picked
 * screen color. Switching modes converts for DISPLAY only; nothing is
 * written until the user edits.
 *
 * Every color the picker shows is the print preview (proof.ts). The picker
 * owns a draft and re-seeds only when an outside change arrives (the
 * "last emitted" rule), so conversion rounding never fights a drag.
 *
 * `onChange(paint, live)`: `live` is true for the continuous commits of a
 * pointer drag; consumers group those into one history entry between
 * `onDragStart` and `onDragEnd`. Shared primitive; no store dependency, so
 * the photo editor can use it too.
 */

export type ColorPreset = { id: string; color: ColorValue };

type Mode = "cmyk" | "rgb" | "hex";
const MODES: { id: Mode; label: string }[] = [
  { id: "cmyk", label: "CMYK" },
  { id: "rgb", label: "RGB" },
  { id: "hex", label: "Hex" },
];
const CMYK_LABELS = ["C", "M", "Y", "K"] as const;
const RGB_LABELS = ["R", "G", "B"] as const;

/** The Chromium EyeDropper API — not in lib.dom yet. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

function cssOf(rgb: Rgb): string {
  return `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`;
}

/** The screen-side rgb a draft stands for: an rgb literal as is, a cmyk
    literal as its proof — what the visual field and the RGB fields show. */
function screenRgb(color: ColorValue): Rgb {
  return color.space === "rgb" ? color.values : proofCmyk(color.values);
}

function cmykOf(color: ColorValue): Cmyk {
  return color.space === "cmyk" ? color.values : pressCmyk(color.values);
}

function roundCmyk(cmyk: Cmyk): ColorValue {
  return { space: "cmyk", values: [toPercent(cmyk[0]) / 100, toPercent(cmyk[1]) / 100, toPercent(cmyk[2]) / 100, toPercent(cmyk[3]) / 100] };
}

function roundRgb(rgb: Rgb): ColorValue {
  return { space: "rgb", values: [to255(rgb[0]) / 255, to255(rgb[1]) / 255, to255(rgb[2]) / 255] };
}

/** Slider track: the proofed ramp of one channel with the others held. */
function trackGradient(sample: (t: number) => Rgb): string {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${cssOf(sample(t))} ${t * 100}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Integer field with the NumberField discipline (draft, commit on Enter/blur,
    Escape reverts, clamp to range) — local because the picker must not
    depend on the layout store's unit setting. */
function ChannelInput({
  label,
  value,
  max,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  max: number;
  onCommit: (v: number) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const escaped = useRef(false);
  const commit = () => {
    if (escaped.current) {
      escaped.current = false;
      return;
    }
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n)) onCommit(Math.round(Math.min(max, Math.max(0, n))));
    setDraft(null);
  };
  return (
    <input
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          escaped.current = true;
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      inputMode="numeric"
      aria-label={label}
      data-testid={testId}
      className="h-[24px] w-[42px] rounded-[5px] border border-[#d6d6d6] bg-white px-[6px] text-right text-[11px] text-[#444] outline-none focus:border-[#b0b0b0]"
    />
  );
}

export function ColorPicker({
  value,
  onChange,
  onDragStart,
  onDragEnd,
  swatches = [],
  presets = [],
  allowNone = false,
  allowEyedropper = true,
  disabled = false,
  ariaLabel,
  testIdPrefix,
  children,
}: {
  value: Paint | null;
  onChange: (next: Paint | null, live: boolean) => void;
  /** A pointer drag on the field, hue strip, or a slider began / ended. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  swatches?: readonly Swatch[];
  presets?: readonly ColorPreset[];
  allowNone?: boolean;
  allowEyedropper?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  /** `${prefix}-trigger`, `-mode-cmyk|rgb|hex`, `-c|m|y|k|r|g|b`, `-hex`,
      `-preset-<id>`, `-swatch-<id>`, `-none`, `-eyedropper`, `-gamut`. */
  testIdPrefix: string;
  /** A custom trigger face; the default is a swatch square. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("cmyk");
  const literal = value ? resolvePaintColor(value, swatches) : null;
  const [draft, setDraft] = useState<ColorValue>(literal ?? { space: "cmyk", values: [0, 0, 0, 1] });
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(screenRgb(draft)));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [hexInvalid, setHexInvalid] = useState(false);
  const [canEyedrop, setCanEyedrop] = useState(false);
  const lastEmitted = useRef<string | null>(value ? paintKey(value) : null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Outside edits (undo, another control, a swatch swap) re-seed the draft;
  // our own emissions don't, because conversion rounding would move the field.
  useEffect(() => {
    const key = value ? paintKey(value) : null;
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    if (literal) {
      setDraft(literal);
      setHsv(rgbToHsv(screenRgb(literal)));
    }
    setHexDraft(null);
    setHexInvalid(false);
    // literal derives from value + swatches; value is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Support resolved after mount so server and first client render agree.
  useEffect(() => {
    setCanEyedrop(allowEyedropper && "EyeDropper" in window);
  }, [allowEyedropper]);

  function emit(next: ColorValue, live: boolean) {
    setDraft(next);
    const paint = solidPaint(next);
    lastEmitted.current = paintKey(paint);
    onChange(paint, live);
  }

  /** A screen color picked visually, committed in the active mode. */
  function commitFromScreen(rgb: Rgb, live: boolean) {
    if (mode === "cmyk") emit(roundCmyk(pressCmyk(rgb)), live);
    else emit(roundRgb(rgb), live);
  }

  function commitHsv(next: Hsv, live: boolean) {
    setHsv(next);
    commitFromScreen(hsvToRgb(next), live);
  }

  function pickFromField(e: React.PointerEvent, live: boolean) {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = clamp01((e.clientX - rect.left) / rect.width);
    const v = clamp01(1 - (e.clientY - rect.top) / rect.height);
    commitHsv({ ...hsv, s, v }, live);
  }

  function beginDrag() {
    if (dragging.current) return;
    dragging.current = true;
    onDragStart?.();
  }
  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    onDragEnd?.();
  }

  function selectMode(next: Mode) {
    setMode(next);
    setHexDraft(null);
    setHexInvalid(false);
    // the field follows the draft's screen color when the space changes
    setHsv(rgbToHsv(screenRgb(draft)));
  }

  function openPicker() {
    setMode("cmyk");
    setHexDraft(null);
    setHexInvalid(false);
    if (literal) {
      setDraft(literal);
      setHsv(rgbToHsv(screenRgb(literal)));
    }
    setOpen(true);
  }

  async function eyedrop() {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    try {
      const res = await new Ctor().open();
      const rgb = parseHex(res.sRGBHex);
      if (rgb) {
        setHsv(rgbToHsv(rgb));
        commitFromScreen(rgb, false);
      }
    } catch {
      // dismissed — nothing to apply
    }
  }

  const displayCmyk = cmykOf(draft);
  const displayRgb = screenRgb(draft);
  const proof = proofColor(draft);
  const proofCss = cssOf(proof);
  const outOfGamut = draft.space === "rgb" && isOutOfGamut(draft.values);
  const hexShown = hexDraft ?? formatHex(displayRgb);

  const p = testIdPrefix;
  const triggerCss = value ? paintToCss(value, swatches) : "#ffffff";

  return (
    <Popover open={open} onClose={() => setOpen(false)} trigger={
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid={`${p}-trigger`}
        title={ariaLabel}
        className={children ? "cursor-pointer disabled:cursor-not-allowed" : `relative h-[18px] w-[18px] cursor-pointer rounded-[4px] border disabled:cursor-not-allowed ${open ? "border-[1.5px] border-brand" : "border-[#d6d6d6]"}`}
        style={children ? undefined : { backgroundColor: triggerCss }}
      >
        {children}
        {!children && value === null && (
          <span className="absolute inset-0 overflow-hidden rounded-[3px]">
            <span className="absolute left-1/2 top-1/2 h-[26px] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brand" />
          </span>
        )}
      </button>
    } testId={`${p}-popover`}>
      {/* Saturation (x) × brightness (y) field at the current hue. */}
      <div
        ref={fieldRef}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        data-testid={`${p}-field`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          beginDrag();
          pickFromField(e, true);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) pickFromField(e, true);
        }}
        onPointerUp={(e) => {
          pickFromField(e, false);
          endDrag();
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          const nudge: Partial<Hsv> | null =
            e.key === "ArrowLeft" ? { s: clamp01(hsv.s - step) } :
            e.key === "ArrowRight" ? { s: clamp01(hsv.s + step) } :
            e.key === "ArrowUp" ? { v: clamp01(hsv.v + step) } :
            e.key === "ArrowDown" ? { v: clamp01(hsv.v - step) } :
            null;
          if (!nudge) return;
          e.preventDefault();
          commitHsv({ ...hsv, ...nudge }, false);
        }}
        className="relative h-[110px] w-full cursor-crosshair touch-none rounded-[5px] border border-[#d6d6d6] outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
        }}
      >
        <span
          className="pointer-events-none absolute h-[14px] w-[14px] -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
          style={{ left: `${hsv.s * 100}%`, bottom: `${hsv.v * 100}%`, background: proofCss }}
        />
      </div>

      {/* Hue strip. */}
      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(hsv.h)}
        onPointerDown={beginDrag}
        onPointerUp={endDrag}
        onChange={(e) => commitHsv({ ...hsv, h: Number(e.target.value) }, dragging.current)}
        aria-label="Hue"
        data-testid={`${p}-hue`}
        className="mt-2 block h-[10px] w-full cursor-pointer appearance-none rounded-full"
        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      />

      <TabStrip tabs={MODES} active={mode} onSelect={selectMode} testIdPrefix={`${p}-mode`} stretch className="mt-2 h-[28px] border-b border-[#ececec]" />

      <div className="mt-2 flex flex-col gap-[6px]">
        {mode === "cmyk" &&
          CMYK_LABELS.map((label, i) => {
            const pct = toPercent(displayCmyk[i]);
            const set = (next: number, live: boolean) => {
              const values = [...displayCmyk] as [number, number, number, number];
              values[i] = next / 100;
              emit({ space: "cmyk", values }, live);
            };
            return (
              <div key={label} className="flex items-center gap-2">
                <span className="w-[12px] text-[11px] font-semibold text-[#5f5f5f]">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  onPointerDown={beginDrag}
                  onPointerUp={endDrag}
                  onChange={(e) => set(Number(e.target.value), dragging.current)}
                  aria-label={`${label} percent`}
                  data-testid={`${p}-${label.toLowerCase()}-slider`}
                  className="h-[10px] flex-1 cursor-pointer appearance-none rounded-full"
                  style={{
                    background: trackGradient((t) => {
                      const v = [...displayCmyk] as [number, number, number, number];
                      v[i] = t;
                      return proofCmyk(v);
                    }),
                  }}
                />
                <ChannelInput label={`${label} percent`} value={pct} max={100} onCommit={(v) => set(v, false)} testId={`${p}-${label.toLowerCase()}`} />
              </div>
            );
          })}

        {mode === "rgb" &&
          RGB_LABELS.map((label, i) => {
            const n = to255(displayRgb[i]);
            const set = (next: number, live: boolean) => {
              const values = [...displayRgb] as [number, number, number];
              values[i] = next / 255;
              emit({ space: "rgb", values }, live);
            };
            return (
              <div key={label} className="flex items-center gap-2">
                <span className="w-[12px] text-[11px] font-semibold text-[#5f5f5f]">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={n}
                  onPointerDown={beginDrag}
                  onPointerUp={endDrag}
                  onChange={(e) => set(Number(e.target.value), dragging.current)}
                  aria-label={`${label} value`}
                  data-testid={`${p}-${label.toLowerCase()}-slider`}
                  className="h-[10px] flex-1 cursor-pointer appearance-none rounded-full"
                  style={{
                    background: trackGradient((t) => {
                      const v = [...displayRgb] as [number, number, number];
                      v[i] = t;
                      return v;
                    }),
                  }}
                />
                <ChannelInput label={`${label} value`} value={n} max={255} onCommit={(v) => set(v, false)} testId={`${p}-${label.toLowerCase()}`} />
              </div>
            );
          })}

        {mode === "hex" && (
          <div className="flex items-center gap-2">
            <span className="w-[12px] text-[11px] font-semibold text-[#5f5f5f]">#</span>
            <input
              value={hexShown.replace(/^#/, "")}
              onChange={(e) => {
                setHexDraft(e.target.value);
                setHexInvalid(false);
              }}
              onBlur={() => {
                if (hexDraft === null) return;
                const rgb = parseHex(hexDraft);
                if (!rgb) {
                  setHexInvalid(true);
                  return;
                }
                setHexDraft(null);
                setHsv(rgbToHsv(rgb));
                emit(roundRgb(rgb), false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setHexDraft(null);
                  setHexInvalid(false);
                  e.currentTarget.blur();
                }
              }}
              spellCheck={false}
              aria-label="Hex color"
              aria-invalid={hexInvalid}
              data-testid={`${p}-hex`}
              className={`h-[24px] flex-1 rounded-[5px] border bg-white px-[8px] font-mono text-[12px] uppercase text-[#444] outline-none ${
                hexInvalid ? "border-brand" : "border-[#d6d6d6] focus:border-[#b0b0b0]"
              }`}
            />
            {hexInvalid && (
              <span data-testid={`${p}-hex-invalid`} className="text-[10px] text-brand">
                6 hex digits
              </span>
            )}
          </div>
        )}
      </div>

      {/* Preview (the print proof) with the value in the other space. */}
      <div className="mt-3 flex items-center gap-2">
        <span
          data-testid={`${p}-preview`}
          className="h-[28px] w-[28px] shrink-0 rounded-[5px] border border-[#d6d6d6]"
          style={{ background: proofCss }}
          aria-hidden
        />
        <span className="flex-1 text-[10.5px] leading-tight text-[#777]">
          {mode === "cmyk" ? (
            <>Prints as shown · {formatHex(proof)} on screen</>
          ) : (
            <>
              Prints as C{toPercent(displayCmyk[0])} M{toPercent(displayCmyk[1])} Y{toPercent(displayCmyk[2])} K{toPercent(displayCmyk[3])}
            </>
          )}
        </span>
        {outOfGamut && (
          <span
            data-testid={`${p}-gamut`}
            title="Outside the press gamut — this color will print duller than it looks on screen"
            className="text-warn"
          >
            <TriangleAlert size={14} strokeWidth={2} />
          </span>
        )}
      </div>

      {(presets.length > 0 || swatches.length > 0 || allowNone || canEyedrop) && (
        <div className="mt-3 flex flex-wrap items-center gap-[6px] border-t border-[#ececec] pt-3">
          {allowNone && (
            <button
              type="button"
              onClick={() => {
                lastEmitted.current = null;
                onChange(null, false);
              }}
              aria-label="None"
              aria-pressed={value === null}
              data-testid={`${p}-none`}
              className={`relative h-[18px] w-[18px] cursor-pointer overflow-hidden rounded-[4px] border bg-white ${
                value === null ? "border-[1.5px] border-brand" : "border-[#d6d6d6]"
              }`}
            >
              <span className="absolute left-1/2 top-1/2 h-[26px] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brand" />
            </button>
          )}
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setHsv(rgbToHsv(screenRgb(preset.color)));
                emit(preset.color, false);
              }}
              aria-label={`Preset ${preset.id}`}
              aria-pressed={value !== null && colorEquals(draft, preset.color)}
              data-testid={`${p}-preset-${preset.id}`}
              className={`h-[18px] w-[18px] cursor-pointer rounded-[4px] border ${
                value !== null && colorEquals(draft, preset.color) ? "border-[1.5px] border-brand" : "border-[#d6d6d6]"
              }`}
              style={{ backgroundColor: cssOf(proofColor(preset.color)) }}
            />
          ))}
          {swatches.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              onClick={() => {
                const paint: Paint = { kind: "swatch", swatchId: swatch.id };
                lastEmitted.current = paintKey(paint);
                onChange(paint, false);
              }}
              aria-label={`Swatch ${swatch.name}`}
              aria-pressed={value?.kind === "swatch" && value.swatchId === swatch.id}
              title={swatch.name}
              data-testid={`${p}-swatch-${swatch.id}`}
              className={`h-[18px] w-[18px] cursor-pointer rounded-[4px] border ${
                value?.kind === "swatch" && value.swatchId === swatch.id ? "border-[1.5px] border-brand" : "border-[#d6d6d6]"
              }`}
              style={{ backgroundColor: paintToCss({ kind: "swatch", swatchId: swatch.id }, swatches) }}
            />
          ))}
          {canEyedrop && (
            <button
              type="button"
              onClick={() => void eyedrop()}
              aria-label="Pick a color from the screen"
              title="Pick a color from the screen"
              data-testid={`${p}-eyedropper`}
              className="ml-auto flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[5px] border border-[#d6d6d6] bg-white text-[#555] hover:bg-[#f6f6f6]"
            >
              <Pipette size={12} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
