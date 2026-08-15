import { useEffect, useRef, useState } from "react";
import { TOOL_GROUP_ORDER, toolRegistry } from "../../core/registry";
import type { ToolContract, ToolMode } from "../../core/registry";
import { WIRED_TOOLS } from "../wiredTools";

export type ShapePresentation = "slots" | "flyout";

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
 * grouped in §4.1 order. The ten shape tools render either as individual
 * slots or as one slot with a flyout — the §4.1 presentation toggle, both
 * renderings bound to the same contracts. Every tool is selectable so its
 * contract shows in the options bar; tools without wired canvas behavior
 * are dimmed (Phase A posture).
 */
export function Dock({
  mode,
  activeTool,
  onToolChange,
  shapePresentation,
}: {
  mode: ToolMode;
  activeTool: string;
  onToolChange: (id: string) => void;
  shapePresentation: ShapePresentation;
}) {
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  // The flyout slot shows the last shape tool used, Publisher-style.
  const [lastShapeId, setLastShapeId] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyoutOpen) return;
    const close = (e: PointerEvent) => {
      if (flyoutRef.current && e.target instanceof Node && !flyoutRef.current.contains(e.target)) {
        setFlyoutOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [flyoutOpen]);

  const tools = toolsForMode(mode);

  return (
    <nav className="dock" aria-label="Tools" data-testid="dock">
      {TOOL_GROUP_ORDER.map((group) => {
        const groupTools = tools.filter((t) => t.group === group);
        if (groupTools.length === 0) return null;

        if (group === "shapes" && shapePresentation === "flyout") {
          const current =
            groupTools.find((t) => t.id === activeTool) ??
            groupTools.find((t) => t.id === lastShapeId) ??
            groupTools[0];
          if (!current) return null;
          return (
            <div key={group} className="dock-group dock-flyout" ref={flyoutRef} data-testid="shape-flyout">
              <ToolButton tool={current} active={activeTool === current.id} onToolChange={onToolChange} />
              <button
                className="dock-flyout-toggle"
                aria-label="More shape tools"
                aria-expanded={flyoutOpen}
                onClick={() => setFlyoutOpen((open) => !open)}
              >
                ▸
              </button>
              {flyoutOpen && (
                <div className="dock-flyout-menu" role="menu">
                  {groupTools.map((tool) => (
                    <ToolButton
                      key={tool.id}
                      tool={tool}
                      active={activeTool === tool.id}
                      onToolChange={(id) => {
                        setLastShapeId(id);
                        setFlyoutOpen(false);
                        onToolChange(id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={group} className="dock-group" data-group={group}>
            {groupTools.map((tool) => (
              <ToolButton
                key={tool.id}
                tool={tool}
                active={activeTool === tool.id}
                onToolChange={(id) => {
                  if (group === "shapes") setLastShapeId(id);
                  onToolChange(id);
                }}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
