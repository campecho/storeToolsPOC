import { useEffect, useState } from "react";
import { clampZoom, fitZoom, zoomInStep, zoomOutStep, type Size } from "../core/geometry/viewport";
import {
  stressFixtureCleared,
  stressFixtureLoaded,
  zoomFitCommitted,
  zoomSetCommitted,
  zoomStepCommitted,
} from "../core/store";
import { toolRegistry } from "../core/registry";
import type { ActiveTool } from "./canvas/CanvasWorkspace";
import { buildStressFixture } from "./debug/stressFixture";
import { useFps } from "./debug/useFps";
import { useAppDispatch, useAppSelector } from "./hooks";

/**
 * The debug bar (PLAN.md §6.6, §4.1): model-development controls that are
 * not part of the specified surface — registry-driven presentation toggles,
 * JSON round-trip, and here the viewport controls, alignment probe, and the
 * §6.2 spike-gate stress fixture with its FPS readout. Deliberately plain.
 */
const isActiveTool = (id: string): id is ActiveTool => id === "zoom" || id === "pan";

export function DebugBar({
  activeTool,
  onToolChange,
  showProbe,
  onProbeChange,
  vpSize,
}: {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
  showProbe: boolean;
  onProbeChange: (show: boolean) => void;
  vpSize: Size;
}) {
  const dispatch = useAppDispatch();
  const viewport = useAppSelector((s) => s.viewport);
  const page = useAppSelector((s) => s.document.page);
  const objectCount = useAppSelector((s) => s.document.objects.length);
  const fps = useFps(objectCount > 0);

  const [zoomText, setZoomText] = useState("");
  const zoomPercent = `${Math.round(viewport.zoom * 100)}%`;
  useEffect(() => setZoomText(zoomPercent), [zoomPercent]);

  const commitZoomText = () => {
    const parsed = Number.parseFloat(zoomText.replace("%", ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      const zoom = clampZoom(parsed / 100);
      dispatch(zoomSetCommitted({ zoom, pan: viewport.pan }));
      // Re-sync explicitly: the effect below only fires when the rounded
      // percent changes, which typed input ("100.4", "63") need not do.
      setZoomText(`${Math.round(zoom * 100)}%`);
    } else {
      setZoomText(zoomPercent);
    }
  };

  return (
    <div className="debug-bar">
      <span className="debug-group" role="group" aria-label="Tools">
        {toolRegistry.map((tool) => {
          const id = tool.id;
          if (!isActiveTool(id)) return null;
          return (
            <button
              key={id}
              aria-pressed={activeTool === id}
              title={`${tool.label} (${tool.shortcut})`}
              onClick={() => onToolChange(id)}
            >
              {tool.label}
            </button>
          );
        })}
      </span>
      <span className="debug-group" role="group" aria-label="Zoom">
        <button
          aria-label="Zoom out"
          onClick={() =>
            dispatch(zoomStepCommitted({ zoom: zoomOutStep(viewport.zoom), pan: viewport.pan }))
          }
        >
          −
        </button>
        <input
          aria-label="Zoom percent"
          size={5}
          value={zoomText}
          onChange={(e) => setZoomText(e.target.value)}
          onBlur={commitZoomText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitZoomText();
          }}
        />
        <button
          aria-label="Zoom in"
          onClick={() =>
            dispatch(zoomStepCommitted({ zoom: zoomInStep(viewport.zoom), pan: viewport.pan }))
          }
        >
          +
        </button>
        <button
          onClick={() =>
            dispatch(
              zoomFitCommitted({
                zoom: fitZoom(page.widthIn, page.heightIn, page.bleedIn, vpSize.w, vpSize.h),
                pan: { x: 0, y: 0 },
              }),
            )
          }
        >
          Fit
        </button>
      </span>
      <label className="debug-group">
        <input type="checkbox" checked={showProbe} onChange={(e) => onProbeChange(e.target.checked)} />
        overlay probe
      </label>
      <span className="debug-group" role="group" aria-label="Stress fixture">
        {objectCount === 0 ? (
          <button onClick={() => dispatch(stressFixtureLoaded({ objects: buildStressFixture() }))}>
            Load stress fixture
          </button>
        ) : (
          <button onClick={() => dispatch(stressFixtureCleared())}>
            Clear stress fixture ({objectCount})
          </button>
        )}
        {fps !== null && <span data-testid="fps">{fps} fps</span>}
      </span>
    </div>
  );
}
