import { useCallback, useEffect, useState } from "react";
import type { Size } from "../core/geometry/viewport";
import { toolRegistry } from "../core/registry";
import type { ToolMode } from "../core/registry";
import { selectDocument } from "../core/store";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace";
import { DebugBar } from "./DebugBar";
import { Dock } from "./dock/Dock";
import { OptionsBar } from "./dock/OptionsBar";
import { useAppSelector } from "./hooks";
import { isTextEntryTarget } from "./isTextEntryTarget";
import { ControlPanel } from "./panels/ControlPanel";
import { useDocumentFile } from "./storage/useDocumentFile";
import {
  defaultToolOptions,
  optionNumber,
  type ToolOptionValue,
  type ToolOptionValues,
} from "./toolOptions";
import { useGlobalKeys } from "./useGlobalKeys";

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
  // canvas/useToolGestures.ts, where the ASSUMPTION note lives. The chords
  // that produce a selection out of nowhere — select all, paste, duplicate —
  // hand it over for the same reason, and because selection chrome draws
  // under the select tool only: without the switch they would look like
  // nothing happened.
  const activateSelectTool = useCallback(() => setActiveTool("select"), []);

  // The document's file lifecycle (§6.9): one hook owns the provider and the
  // retained handle; the debug bar renders its controls and the global
  // chords call its handlers.
  const file = useDocumentFile();

  const activeContract = toolRegistry.find((t) => t.id === activeTool);

  const switchMode = (next: AppMode) => {
    setMode(next);
    if (activeContract && activeContract.mode !== "both" && activeContract.mode !== next) {
      setActiveTool("pan");
    }
  };

  // Registry shortcuts activate tools within the current mode. A tool whose
  // contract carries no shortcut is dock-only: no keystroke reaches it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const tool = toolRegistry.find(
        (t) =>
          (t.mode === "both" || t.mode === mode) &&
          t.shortcut !== null &&
          t.shortcut.toLowerCase() === e.key.toLowerCase(),
      );
      if (tool) setActiveTool(tool.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  // The global chords (registry globalKeys.ts) — undo/redo, select all,
  // clipboard, duplicate, zoom keys. App owns them because they are not
  // gestures and because two of the three things they need — the page index
  // and the viewport size — are app state.
  useGlobalKeys({
    pageIndex: boundedPageIndex,
    vpSize,
    onSelectionSurfaced: activateSelectTool,
    file: { open: file.open, save: file.save, saveAs: file.saveAs },
  });

  return (
    <div className="app">
      <DebugBar
        mode={mode}
        onModeChange={switchMode}
        showProbe={showProbe}
        onProbeChange={setShowProbe}
        vpSize={vpSize}
        pageIndex={boundedPageIndex}
        onPageIndexChange={setPageIndex}
        file={file}
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
        />
        <CanvasWorkspace
          activeTool={activeTool}
          pageIndex={boundedPageIndex}
          showProbe={showProbe}
          toolOptions={toolOptions}
          onVpSizeChange={setVpSize}
          onObjectDrawn={activateSelectTool}
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
