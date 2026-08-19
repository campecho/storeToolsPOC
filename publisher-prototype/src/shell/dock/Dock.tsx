import { TOOL_GROUP_ORDER, toolRegistry } from "../../core/registry";
import type { ToolContract, ToolMode } from "../../core/registry";
import { WIRED_TOOLS } from "../wiredTools";

function toolsForMode(mode: ToolMode): ToolContract[] {
  return toolRegistry.filter((t) => t.mode === mode || t.mode === "both");
}

function ToolButton({
  tool,
  active,
  onToolChange,
}: {
  tool: ToolContract;
  active: boolean;
  onToolChange: (id: string) => void;
}) {
  const wired = WIRED_TOOLS.has(tool.id);
  return (
    <button
      className={wired ? "dock-tool" : "dock-tool unwired"}
      aria-pressed={active}
      title={`${tool.label} (${tool.shortcut}) — ${tool.tier}${wired ? "" : ", not wired yet"}`}
      onClick={() => onToolChange(tool.id)}
    >
      <span className="dock-tool-label">{tool.label}</span>
      {tool.tier === "SURFACE" && <sup className="tier-badge">S</sup>}
    </button>
  );
}

/**
 * The tool dock (PLAN.md §2, §4.1): rendered entirely from the registry,
 * grouped in §4.1 order, one slot per tool. §4.1 kept a flyout rendering of
 * the ten shape tools alongside this one until the prototype review picked
 * between them; it picked individual slots, and the alternative is gone.
 * Every tool is selectable so its contract shows in the options bar; tools
 * without wired canvas behavior are dimmed (Phase A posture).
 */
export function Dock({
  mode,
  activeTool,
  onToolChange,
}: {
  mode: ToolMode;
  activeTool: string;
  onToolChange: (id: string) => void;
}) {
  const tools = toolsForMode(mode);

  return (
    <nav className="dock" aria-label="Tools" data-testid="dock">
      {TOOL_GROUP_ORDER.map((group) => {
        const groupTools = tools.filter((t) => t.group === group);
        if (groupTools.length === 0) return null;
        return (
          <div key={group} className="dock-group" data-group={group}>
            {groupTools.map((tool) => (
              <ToolButton
                key={tool.id}
                tool={tool}
                active={activeTool === tool.id}
                onToolChange={onToolChange}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
