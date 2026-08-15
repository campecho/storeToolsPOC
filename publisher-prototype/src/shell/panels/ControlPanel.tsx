import { panelRegistry } from "../../core/registry";
import type { ToolContract, ToolMode } from "../../core/registry";

/**
 * The control panel region (PLAN.md §2, §4.3): the mode's panel set rendered
 * from the registry. Each panel shows its tier and what the requirements
 * oblige it to carry; panels that apply to the active tool are marked. The
 * panels' actual controls arrive with their Phase B groups.
 */
export function ControlPanel({ mode, activeTool }: { mode: ToolMode; activeTool: ToolContract | undefined }) {
  const panels = panelRegistry.filter((p) => p.mode === mode || p.mode === "both");
  const activePanelIds = new Set<string>(activeTool?.panels ?? []);
  return (
    <aside className="control-panel" aria-label="Panels" data-testid="control-panel">
      {panels.map((panel) => (
        <details key={panel.id} className={activePanelIds.has(panel.id) ? "panel applies" : "panel"}>
          <summary>
            {panel.label}
            <span className={`tier-chip tier-${panel.tier.toLowerCase()}`}>{panel.tier}</span>
            {activePanelIds.has(panel.id) && <span className="applies-chip">active tool</span>}
          </summary>
          <ul className="panel-carries">
            {panel.carries.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="panel-req">{panel.req.join(" · ")}</p>
        </details>
      ))}
    </aside>
  );
}
