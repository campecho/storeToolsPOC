import { useCallback, useEffect, useState } from "react";
import type { Size } from "../core/geometry/viewport";
import { toolRegistry } from "../core/registry";
import type { ToolMode } from "../core/registry";
import { selectDocument } from "../core/store";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace";
import { DebugBar } from "./DebugBar";
import { Dock, type ShapePresentation } from "./dock/Dock";
import { OptionsBar } from "./dock/OptionsBar";
import { useAppSelector } from "./hooks";
import { isTextEntryTarget } from "./isTextEntryTarget";
import { ControlPanel } from "./panels/ControlPanel";
import {
  defaultToolOptions,
  optionNumber,
  type ToolOptionValue,
  type ToolOptionValues,
} from "./toolOptions";

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
  // Which page renders is app-local React state, deliberately not store
  // state — the Pages panel (Phase B) owns real page navigation. Loading a
  // shorter document clamps the index rather than resetting it.
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = useAppSelector((s) => selectDocument(s).pages.length);
  const boundedPageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
  // Live option values for every tool, seeded from the registry defaults;
  // the options bar edits them and wired tools' gesture ctx consumes them.
  const [toolOptions, setToolOptions] = useState<ToolOptionValues>(defaultToolOptions);
  const setToolOption = useCallback((toolId: string, optionId: string, value: ToolOptionValue) => {
    setToolOptions((prev) => ({ ...prev, [toolId]: { ...prev[toolId], [optionId]: value } }));
  }, []);

  // A drawn object lands selected (selectionSlice), and the select tool is
  // what acts on a selection — so the draw tool hands the page back rather
  // than arming another shape. Reasoned at the commit door in
  // canvas/useToolGestures.ts, where the ASSUMPTION note lives.
  const selectDrawnObject = useCallback(() => setActiveTool("select"), []);

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
        pageIndex={boundedPageIndex}
        onPageIndexChange={setPageIndex}
      />
      <OptionsBar
        tool={activeContract}
        values={activeContract && toolOptions[activeContract.id]}
        onOptionChange={(optionId, value) => {
          if (activeContract) setToolOption(activeContract.id, optionId, value);
        }}
      />
      <div className="regions">
        <Dock
          mode={mode}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          shapePresentation={shapePresentation}
        />
        <CanvasWorkspace
          activeTool={activeTool}
          pageIndex={boundedPageIndex}
          showProbe={showProbe}
          toolOptions={toolOptions}
          onVpSizeChange={setVpSize}
          onObjectDrawn={selectDrawnObject}
        />
        <ControlPanel
          mode={mode}
          activeTool={activeContract}
          pageIndex={boundedPageIndex}
          nudgeIncrement={optionNumber(toolOptions, "select", "nudgeIncrement", 0.1)}
          onNudgeIncrementChange={(value) => setToolOption("select", "nudgeIncrement", value)}
        />
      </div>
    </div>
  );
}
