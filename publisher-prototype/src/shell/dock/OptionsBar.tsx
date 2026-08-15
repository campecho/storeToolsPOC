import type { OptionSpec, ToolContract } from "../../core/registry";
import { WIRED_TOOLS } from "../wiredTools";

/**
 * The contextual tool options bar (PLAN.md §2): renders the active tool's
 * option set straight from its contract — types, ranges, defaults. Controls
 * are display-only until the owning tool's Phase B group wires them; showing
 * the complete reviewable option set is the Phase A deliverable.
 */
function OptionControl({ option }: { option: OptionSpec }) {
  switch (option.kind) {
    case "boolean":
      return (
        <label className="option">
          <input type="checkbox" defaultChecked={option.default} disabled />
          {option.label}
        </label>
      );
    case "number":
      return (
        <label className="option">
          {option.label}
          <input
            type="number"
            defaultValue={option.default}
            min={option.min}
            max={option.max}
            step={option.step}
            disabled
          />
          {option.unit !== undefined && <span className="option-unit">{option.unit}</span>}
        </label>
      );
    case "enum":
      return (
        <label className="option">
          {option.label}
          <select defaultValue={option.default} disabled>
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
          <input type="color" defaultValue={option.default} disabled />
        </label>
      );
  }
}

export function OptionsBar({ tool }: { tool: ToolContract | undefined }) {
  if (!tool) return <div className="options-bar" data-testid="options-bar" />;
  const wired = WIRED_TOOLS.has(tool.id);
  return (
    <div className="options-bar" data-testid="options-bar">
      <span className="options-tool-name">
        {tool.label}
        <span className={`tier-chip tier-${tool.tier.toLowerCase()}`}>{tool.tier}</span>
        {!wired && <span className="tier-chip not-wired">not wired yet</span>}
      </span>
      {tool.options.map((option) => (
        <OptionControl key={option.id} option={option} />
      ))}
      {tool.options.length === 0 && <span className="options-empty">no tool options</span>}
    </div>
  );
}
