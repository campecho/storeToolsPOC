import { useEffect, useState } from "react";
import type { Size } from "../core/geometry/viewport";
import { toolRegistry } from "../core/registry";
import type { ToolMode } from "../core/registry";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace";
import { DebugBar } from "./DebugBar";
import { Dock, type ShapePresentation } from "./dock/Dock";
import { OptionsBar } from "./dock/OptionsBar";
import { isTextEntryTarget } from "./isTextEntryTarget";
import { ControlPanel } from "./panels/ControlPanel";

export type AppMode = Exclude<ToolMode, "both">;

/**
 * The three-region frame (PLAN.md §2): tool dock · canvas · control panel
 * under the contextual options bar — no header, no menus. Photo mode reuses
 * the same regions with the photo-scoped dock and panel set; its canvas
 * surface arrives with the Images & photo group, so for now the mode switch
 * swaps the dock and panels only. The debug bar above it all is model
 * tooling, not specified surface.
 */
export function App() {
  const [mode, setMode] = useState<AppMode>("layout");
  const [activeTool, setActiveTool] = useState("pan");
  const [showProbe, setShowProbe] = useState(false);
  const [shapePresentation, setShapePresentation] = useState<ShapePresentation>("slots");
  const [vpSize, setVpSize] = useState<Size>({ w: 0, h: 0 });

  const activeContract = toolRegistry.find((t) => t.id === activeTool);

  const switchMode = (next: AppMode) => {
    setMode(next);
    if (activeContract && activeContract.mode !== "both" && activeContract.mode !== next) {
      setActiveTool("pan");
    }
  };

  // Registry shortcuts activate tools within the current mode.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const tool = toolRegistry.find(
        (t) =>
          (t.mode === "both" || t.mode === mode) && t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (tool) setActiveTool(tool.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  return (
    <div className="app">
      <DebugBar
        mode={mode}
        onModeChange={switchMode}
        shapePresentation={shapePresentation}
        onShapePresentationChange={setShapePresentation}
        showProbe={showProbe}
        onProbeChange={setShowProbe}
        vpSize={vpSize}
      />
      <OptionsBar tool={activeContract} />
      <div className="regions">
        <Dock
          mode={mode}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          shapePresentation={shapePresentation}
        />
        <CanvasWorkspace activeTool={activeTool} showProbe={showProbe} onVpSizeChange={setVpSize} />
        <ControlPanel mode={mode} activeTool={activeContract} />
      </div>
    </div>
  );
}
