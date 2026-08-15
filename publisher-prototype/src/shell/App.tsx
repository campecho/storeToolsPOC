import { useEffect, useState } from "react";
import type { Size } from "../core/geometry/viewport";
import { toolRegistry } from "../core/registry";
import { CanvasWorkspace, type ActiveTool } from "./canvas/CanvasWorkspace";
import { DebugBar } from "./DebugBar";
import { isTextEntryTarget } from "./isTextEntryTarget";

/**
 * The shell frame. The specified three-region layout (dock · canvas ·
 * control panel, PLAN.md §2) arrives with the registry-driven dock; until
 * then the frame is debug bar + canvas region only, deliberately unstyled.
 */
export function App() {
  const [activeTool, setActiveTool] = useState<ActiveTool>("pan");
  const [showProbe, setShowProbe] = useState(false);
  const [vpSize, setVpSize] = useState<Size>({ w: 0, h: 0 });

  // Registry shortcuts (Z, H) activate tools from anywhere but a text field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const tool = toolRegistry.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool && (tool.id === "zoom" || tool.id === "pan")) setActiveTool(tool.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app">
      <DebugBar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        showProbe={showProbe}
        onProbeChange={setShowProbe}
        vpSize={vpSize}
      />
      <CanvasWorkspace activeTool={activeTool} showProbe={showProbe} onVpSizeChange={setVpSize} />
    </div>
  );
}
