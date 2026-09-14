import { useState } from "react";
import type { ColorValue } from "../../core/model";
import type { OptionSpec, ToolContract } from "../../core/registry";
import { paintToCss } from "../../core/render/paint";
import { ColorField } from "../panels/ColorField";
import { isColorValue, type ToolOptionValue } from "../toolOptions";
import { CONSUMED_OPTIONS, WIRED_TOOLS } from "../wiredTools";

/**
 * The contextual tool options bar (PLAN.md §2): renders the active tool's
 * option set straight from its contract — types, ranges, defaults. Wired
 * tools' CONSUMED options are live controls backed by App-level option
 * state; everything else — unwired tools wholesale, and wired tools' options
 * nothing consumes yet — keeps the disabled presentation, so the bar stays
 * an honest surface.
 */
/** A colour option: a chip button showing the print preview of the value,
    opening the same CMYK-first colour field the panel uses. Option values are
    tool-ctx inputs, not document state, so the field's edit run is ignored. */
function ColorOption({
  option,
  value,
  editable,
  onChange,
}: {
  option: Extract<OptionSpec, { kind: "color" }>;
  value: ColorValue;
  editable: boolean;
  onChange: (value: ColorValue) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="option option-color">
      <button
        type="button"
        aria-label={option.label}
        aria-expanded={open && editable}
        disabled={!editable}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="swatch-chip" style={{ background: paintToCss({ kind: "color", color: value }, []) }} />
        {option.label}
      </button>
      {open && editable && (
        <span className="option-color-popover">
          <ColorField label={option.label} value={value} onCommit={(next) => onChange(next)} />
        </span>
      )}
    </span>
  );
}

function OptionControl({
  option,
  value,
  editable,
  onChange,
}: {
  option: OptionSpec;
  value: ToolOptionValue | undefined;
  editable: boolean;
  onChange: (value: ToolOptionValue) => void;
}) {
  switch (option.kind) {
    case "boolean":
      return (
        <label className="option">
          <input
            type="checkbox"
            aria-label={option.label}
            checked={typeof value === "boolean" ? value : option.default}
            disabled={!editable}
            onChange={(e) => onChange(e.target.checked)}
          />
          {option.label}
        </label>
      );
    case "number":
      return (
        <label className="option">
          {option.label}
          <input
            type="number"
            aria-label={option.label}
            value={typeof value === "number" ? value : option.default}
            min={option.min}
            max={option.max}
            step={option.step}
            disabled={!editable}
            onChange={(e) => {
              const next = e.target.valueAsNumber;
              if (Number.isFinite(next)) onChange(next);
            }}
          />
          {option.unit !== undefined && <span className="option-unit">{option.unit}</span>}
        </label>
      );
    case "enum":
      return (
        <label className="option">
          {option.label}
          <select
            aria-label={option.label}
            value={typeof value === "string" ? value : option.default}
            disabled={!editable}
            onChange={(e) => onChange(e.target.value)}
          >
            {option.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      );
    case "color":
      return (
        <ColorOption
          option={option}
          value={isColorValue(value) ? value : option.default}
          editable={editable}
          onChange={onChange}
        />
      );
  }
}

export function OptionsBar({
  tool,
  values,
  onOptionChange,
}: {
  tool: ToolContract | undefined;
  /** The active tool's live option values (App state). */
  values: Record<string, ToolOptionValue> | undefined;
  onOptionChange: (optionId: string, value: ToolOptionValue) => void;
}) {
  if (!tool) return <div className="options-bar" data-testid="options-bar" />;
  const wired = WIRED_TOOLS.has(tool.id);
  const consumed = CONSUMED_OPTIONS.get(tool.id);
  return (
    <div className="options-bar" data-testid="options-bar">
      <span className="options-tool-name">
        {tool.label}
        <span className={`tier-chip tier-${tool.tier.toLowerCase()}`}>{tool.tier}</span>
        {!wired && <span className="tier-chip not-wired">not wired yet</span>}
      </span>
      {tool.options.map((option) => (
        <OptionControl
          // keyed per tool, so switching tools never carries a control's open
          // state or draft across contracts
          key={`${tool.id}:${option.id}`}
          option={option}
          value={values?.[option.id]}
          editable={wired && (consumed?.has(option.id) ?? false)}
          onChange={(value) => onOptionChange(option.id, value)}
        />
      ))}
      {tool.options.length === 0 && <span className="options-empty">no tool options</span>}
    </div>
  );
}
