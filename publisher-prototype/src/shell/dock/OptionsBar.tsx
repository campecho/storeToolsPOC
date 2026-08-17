import type { OptionSpec, ToolContract } from "../../core/registry";
import type { ToolOptionValue } from "../toolOptions";
import { CONSUMED_OPTIONS, WIRED_TOOLS } from "../wiredTools";

/**
 * The contextual tool options bar (PLAN.md §2): renders the active tool's
 * option set straight from its contract — types, ranges, defaults. Wired
 * tools' CONSUMED options are live controls backed by App-level option
 * state; everything else — unwired tools wholesale, and wired tools' options
 * nothing consumes yet — keeps the disabled presentation, so the bar stays
 * an honest surface.
 */
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
        <label className="option">
          {option.label}
          <input
            type="color"
            aria-label={option.label}
            value={typeof value === "string" ? value : option.default}
            disabled={!editable}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
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
          key={option.id}
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
