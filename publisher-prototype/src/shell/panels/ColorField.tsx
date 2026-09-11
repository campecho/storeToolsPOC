import { useEffect, useRef, useState } from "react";
import type { ColorValue } from "../../core/model";
import {
  clamp01,
  formatHex,
  hsvToRgb,
  parseHex,
  rgbToHsv,
  to255,
  toPercent,
  type Cmyk,
  type Hsv,
  type Rgb,
} from "../../core/color/convert";
import { isOutOfGamut, pressCmyk, proofCmyk, proofColor } from "../../core/color/proof";

/**
 * Panel colour entry (PLAN.md §4.3 Colour & swatches; SEAMS.md "Colour
 * entry"): CMYK first, then RGB and Hex. A saturation/brightness field and
 * hue strip on top; in CMYK and RGB modes one range slider and one number
 * field per channel; in Hex mode a text field. Below, the print preview
 * (proof.ts) with the value in the other space, and a gamut note when an
 * rgb colour will shift on press. Default controls with the CSS needed to
 * be usable and no more (§2) — the field is the one custom control.
 *
 * What is committed: in CMYK mode a `cmyk` literal with the typed numbers;
 * in RGB and Hex modes an `rgb` literal. The visual field commits in the
 * active mode — in CMYK mode the separation the press profile assigns the
 * picked screen colour. Switching modes converts for DISPLAY only.
 *
 * EDIT RUN: one visit to the control is one history entry, NumberField's
 * discipline widened to the whole field — typing all four CMYK channels,
 * or dragging the hue strip, is one undo step. The run opens on the first
 * commit and ends when focus leaves the control (or on Escape, which
 * reverts to the run's start colour inside the same run). Hex entry
 * commits once on Enter/blur and carries no run.
 *
 * Local draft state re-seeds only when an outside value arrives (undo, a
 * swatch click, the selection changing), never from its own commits —
 * conversion rounding would otherwise move the field under a drag.
 */

type Mode = "cmyk" | "rgb" | "hex";
const CMYK_LABELS = ["C", "M", "Y", "K"] as const;
const RGB_LABELS = ["R", "G", "B"] as const;

/** The Chromium EyeDropper API — not in lib.dom yet. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** A fresh run id per run — the NumberField rule: never per field instance. */
function createEditRunId(): string {
  return crypto.randomUUID();
}

function cssOf(rgb: Rgb): string {
  return `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`;
}

/** The screen-side rgb a colour stands for: an rgb literal as is, a cmyk
    literal as its proof — what the visual field and the RGB fields show. */
function screenRgb(color: ColorValue): Rgb {
  return color.space === "rgb" ? color.values : proofCmyk(color.values);
}

function cmykOf(color: ColorValue): Cmyk {
  return color.space === "cmyk" ? color.values : pressCmyk(color.values);
}

function roundCmyk([c, m, y, k]: Cmyk): ColorValue {
  return { space: "cmyk", values: [toPercent(c) / 100, toPercent(m) / 100, toPercent(y) / 100, toPercent(k) / 100] };
}

function roundRgb([r, g, b]: Rgb): ColorValue {
  return { space: "rgb", values: [to255(r) / 255, to255(g) / 255, to255(b) / 255] };
}

function colorKey(color: ColorValue | null): string {
  if (color === null) return "none";
  const scaled = color.space === "rgb" ? color.values.map(to255) : color.values.map(toPercent);
  return `${color.space}:${scaled.join(",")}`;
}

const DEFAULT_DRAFT: ColorValue = { space: "cmyk", values: [0, 0, 0, 1] };

export function ColorField({
  label,
  value,
  onCommit,
  disabled = false,
}: {
  label: string;
  /** The literal the selection carries (a swatch reference resolved by the
      caller); null when there is no paint to edit. */
  value: ColorValue | null;
  /** `editRun` groups the field's continuous commits into one history entry
      — pass it to `inEditRun` on the action the commit dispatches. */
  onCommit: (next: ColorValue, editRun: string | undefined) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("cmyk");
  const [draft, setDraft] = useState<ColorValue>(value ?? DEFAULT_DRAFT);
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(screenRgb(value ?? DEFAULT_DRAFT)));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [hexInvalid, setHexInvalid] = useState(false);
  const [canEyedrop, setCanEyedrop] = useState(false);
  const lastEmitted = useRef<string>(colorKey(value));
  const runRef = useRef<{ id: string; startValue: ColorValue } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = colorKey(value);
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    if (value !== null) {
      setDraft(value);
      setHsv(rgbToHsv(screenRgb(value)));
    }
    setHexDraft(null);
    setHexInvalid(false);
  }, [value]);

  // Support resolved after mount, never assumed from the user agent.
  useEffect(() => {
    setCanEyedrop("EyeDropper" in window);
  }, []);

  /** The run this edit belongs to, opened on the first commit of a visit. */
  const openRun = (): { id: string; startValue: ColorValue } => {
    const open = runRef.current;
    if (open !== null) return open;
    const started = { id: createEditRunId(), startValue: draft };
    runRef.current = started;
    return started;
  };

  const emit = (next: ColorValue, inRun: boolean): void => {
    setDraft(next);
    lastEmitted.current = colorKey(next);
    onCommit(next, inRun ? openRun().id : undefined);
  };

  /** Leaving the control: the next edit starts its own history entry. */
  const endRun = (): void => {
    runRef.current = null;
  };

  /** Escape: back to the run's start colour, inside the same run. */
  const revert = (): void => {
    const open = runRef.current;
    if (open !== null) {
      emit(open.startValue, true);
      setHsv(rgbToHsv(screenRgb(open.startValue)));
    }
    setHexDraft(null);
    setHexInvalid(false);
    endRun();
  };

  /** A screen colour picked visually, committed in the active mode. */
  const commitFromScreen = (rgb: Rgb): void => {
    if (mode === "cmyk") emit(roundCmyk(pressCmyk(rgb)), true);
    else emit(roundRgb(rgb), true);
  };

  const commitHsv = (next: Hsv): void => {
    setHsv(next);
    commitFromScreen(hsvToRgb(next));
  };

  const pickFromField = (e: React.PointerEvent): void => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = clamp01((e.clientX - rect.left) / rect.width);
    const v = clamp01(1 - (e.clientY - rect.top) / rect.height);
    commitHsv({ ...hsv, s, v });
  };

  const selectMode = (next: Mode): void => {
    setMode(next);
    setHexDraft(null);
    setHexInvalid(false);
    setHsv(rgbToHsv(screenRgb(draft)));
  };

  const eyedrop = async (): Promise<void> => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    try {
      const res = await new Ctor().open();
      const rgb = parseHex(res.sRGBHex);
      if (rgb) {
        setHsv(rgbToHsv(rgb));
        commitFromScreen(rgb);
        endRun();
      }
    } catch {
      // dismissed — nothing to apply
    }
  };

  const displayCmyk = cmykOf(draft);
  const displayRgb = screenRgb(draft);
  const proof = proofColor(draft);
  const outOfGamut = draft.space === "rgb" && isOutOfGamut(draft.values);
  const hexShown = hexDraft ?? formatHex(displayRgb);

  const channelRow = (
    channel: string,
    shown: number,
    max: number,
    set: (next: number) => void,
    track: string,
  ) => (
    <div className="field-row color-channel" key={channel}>
      <span className="color-channel-label">{channel}</span>
      <input
        type="range"
        min={0}
        max={max}
        value={shown}
        disabled={disabled}
        aria-label={`${channel} slider`}
        style={{ background: track }}
        className="color-slider"
        onChange={(e) => set(Number(e.target.value))}
      />
      <input
        type="number"
        min={0}
        max={max}
        value={shown}
        disabled={disabled}
        aria-label={channel}
        className="color-number"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value.trim() === "" || !Number.isFinite(n) || n < 0 || n > max) return;
          set(Math.round(n));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") revert();
        }}
      />
    </div>
  );

  const ramp = (sample: (t: number) => Rgb): string => {
    const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${cssOf(sample(t))} ${t * 100}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  };

  return (
    <div
      ref={rootRef}
      className="color-field"
      role="group"
      aria-label={label}
      onBlur={(e) => {
        // focus leaving the whole control ends the run; moving between its
        // channels does not
        if (!rootRef.current?.contains(e.relatedTarget)) endRun();
      }}
    >
      <div
        ref={fieldRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-disabled={disabled}
        className="color-sv"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pickFromField(e);
        }}
        onPointerMove={(e) => {
          if (!disabled && e.buttons & 1) pickFromField(e);
        }}
        onPointerUp={endRun}
        onKeyDown={(e) => {
          if (disabled) return;
          const step = e.shiftKey ? 0.1 : 0.01;
          const nudge: Partial<Hsv> | null =
            e.key === "ArrowLeft" ? { s: clamp01(hsv.s - step) } :
            e.key === "ArrowRight" ? { s: clamp01(hsv.s + step) } :
            e.key === "ArrowUp" ? { v: clamp01(hsv.v + step) } :
            e.key === "ArrowDown" ? { v: clamp01(hsv.v - step) } :
            null;
          if (e.key === "Escape") revert();
          if (!nudge) return;
          e.preventDefault();
          commitHsv({ ...hsv, ...nudge });
        }}
      >
        <span
          className="color-sv-thumb"
          style={{ left: `${hsv.s * 100}%`, bottom: `${hsv.v * 100}%`, background: cssOf(proof) }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(hsv.h)}
        disabled={disabled}
        aria-label="Hue"
        className="color-slider color-hue"
        onChange={(e) => commitHsv({ ...hsv, h: Number(e.target.value) })}
        onPointerUp={endRun}
      />

      <div className="field-row" role="radiogroup" aria-label="Color mode">
        {(["cmyk", "rgb", "hex"] as const).map((m) => (
          <label className="field" key={m}>
            <input
              type="radio"
              name={`${label}-mode`}
              aria-label={m.toUpperCase()}
              checked={mode === m}
              disabled={disabled}
              onChange={() => selectMode(m)}
            />
            {m === "cmyk" ? "CMYK" : m === "rgb" ? "RGB" : "Hex"}
          </label>
        ))}
      </div>

      {mode === "cmyk" &&
        CMYK_LABELS.map((channel, i) =>
          channelRow(
            channel,
            toPercent(displayCmyk[i] ?? 0),
            100,
            (next) => {
              const values: [number, number, number, number] = [...displayCmyk];
              values[i] = next / 100;
              emit(roundCmyk(values), true);
            },
            ramp((t) => {
              const v: [number, number, number, number] = [...displayCmyk];
              v[i] = t;
              return proofCmyk(v);
            }),
          ),
        )}

      {mode === "rgb" &&
        RGB_LABELS.map((channel, i) =>
          channelRow(
            channel,
            to255(displayRgb[i] ?? 0),
            255,
            (next) => {
              const values: [number, number, number] = [...displayRgb];
              values[i] = next / 255;
              emit(roundRgb(values), true);
            },
            ramp((t) => {
              const v: [number, number, number] = [...displayRgb];
              v[i] = t;
              return v;
            }),
          ),
        )}

      {mode === "hex" && (
        <div className="field-row">
          <label className="field">
            Hex
            <input
              type="text"
              value={hexShown}
              disabled={disabled}
              spellCheck={false}
              aria-label="Hex"
              aria-invalid={hexInvalid}
              className="color-hex"
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
                }
              }}
            />
          </label>
          {hexInvalid && <span className="panel-note">6 hex digits</span>}
        </div>
      )}

      <div className="field-row">
        <span className="swatch-chip color-preview" style={{ background: cssOf(proof) }} aria-hidden />
        <span className="panel-note" data-testid="color-readout">
          {mode === "cmyk"
            ? `Prints as shown · ${formatHex(proof)} on screen`
            : `Prints as C${toPercent(displayCmyk[0] ?? 0)} M${toPercent(displayCmyk[1] ?? 0)} Y${toPercent(displayCmyk[2] ?? 0)} K${toPercent(displayCmyk[3] ?? 0)}`}
        </span>
        {outOfGamut && (
          <span className="panel-note color-gamut" role="status">
            shifts on press
          </span>
        )}
        {canEyedrop && (
          <button type="button" disabled={disabled} onClick={() => void eyedrop()} aria-label="Pick a color from the screen">
            Eyedropper
          </button>
        )}
      </div>
    </div>
  );
}
