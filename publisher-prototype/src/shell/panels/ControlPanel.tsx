import { panelRegistry } from "../../core/registry";
import type { PanelSpec, ToolContract, ToolMode } from "../../core/registry";
import { WIRED_PANELS } from "../wiredTools";
import { AlignDistributePanel } from "./AlignDistributePanel";
import { ColorSwatchesPanel } from "./ColorSwatchesPanel";
import { TransformPanel } from "./TransformPanel";

/**
 * The control panel region (PLAN.md §2, §4.3): the mode's panel set rendered
 * from the registry. Each panel shows its tier and — once its Phase B group
 * lands and it joins WIRED_PANELS — its live controls; until then it shows
 * what the requirements oblige it to carry, with a "not wired yet" chip on
 * LIVE-tier panels so the surface stays honest (the options-bar rule).
 * Panels that apply to the active tool are marked.
 */
export function ControlPanel({
  mode,
  activeTool,
  pageIndex,
  nudgeIncrement,
  onNudgeIncrementChange,
}: {
  mode: ToolMode;
  activeTool: ToolContract | undefined;
  pageIndex: number;
  nudgeIncrement: number;
  onNudgeIncrementChange: (value: number) => void;
}) {
  const panels = panelRegistry.filter((p) => p.mode === mode || p.mode === "both");
  const activePanelIds = new Set<string>(activeTool?.panels ?? []);

  const liveContent = (panel: PanelSpec) => {
    switch (panel.id) {
      case "transform":
        return (
          <TransformPanel
            pageIndex={pageIndex}
            nudgeIncrement={nudgeIncrement}
            onNudgeIncrementChange={onNudgeIncrementChange}
          />
        );
      case "color-swatches":
        return <ColorSwatchesPanel pageIndex={pageIndex} />;
      case "align-distribute":
        return <AlignDistributePanel pageIndex={pageIndex} />;
      default:
        return null;
    }
  };

  return (
    <aside className="control-panel" aria-label="Panels" data-testid="control-panel">
      {panels.map((panel) => {
        const wired = WIRED_PANELS.has(panel.id);
        return (
          <details
            key={panel.id}
            className={activePanelIds.has(panel.id) ? "panel applies" : "panel"}
            data-testid={`panel-${panel.id}`}
            open={wired || undefined}
          >
            <summary>
              {panel.label}
              <span className={`tier-chip tier-${panel.tier.toLowerCase()}`}>{panel.tier}</span>
              {panel.tier === "LIVE" && !wired && (
                <span className="tier-chip not-wired">not wired yet</span>
              )}
              {activePanelIds.has(panel.id) && <span className="applies-chip">active tool</span>}
            </summary>
            {wired ? (
              liveContent(panel)
            ) : (
              <ul className="panel-carries">
                {panel.carries.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="panel-req">{panel.req.join(" · ")}</p>
          </details>
        );
      })}
    </aside>
  );
}
