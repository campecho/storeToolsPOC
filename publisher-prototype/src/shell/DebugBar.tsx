import { useEffect, useRef, useState } from "react";
import { clampZoom, fitZoom, zoomInStep, zoomOutStep, type Size } from "../core/geometry/viewport";
import { readDocument, serializeDocument } from "../core/model";
import {
  documentReplaced,
  effectivePageSetup,
  pageGeometry,
  stressFixtureCleared,
  stressFixtureLoaded,
  zoomFitCommitted,
  zoomSetCommitted,
  zoomStepCommitted,
} from "../core/store";
import type { AppMode } from "./App";
import type { ShapePresentation } from "./dock/Dock";
import { buildStressFixture } from "./debug/stressFixture";
import { useFps } from "./debug/useFps";
import { useAppDispatch, useAppSelector } from "./hooks";

/**
 * The debug bar (PLAN.md §6.6, §4.1): model-development controls that are
 * not part of the specified surface — registry-driven presentation toggles,
 * JSON round-trip, and here the viewport controls, alignment probe, and the
 * §6.2 spike-gate stress fixture with its FPS readout. Deliberately plain.
 */
export function DebugBar({
  mode,
  onModeChange,
  shapePresentation,
  onShapePresentationChange,
  showProbe,
  onProbeChange,
  vpSize,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  shapePresentation: ShapePresentation;
  onShapePresentationChange: (presentation: ShapePresentation) => void;
  showProbe: boolean;
  onProbeChange: (show: boolean) => void;
  vpSize: Size;
}) {
  const dispatch = useAppDispatch();
  const viewport = useAppSelector((s) => s.viewport);
  // Named `doc`, not `document` — the DOM global is used below for the export
  // anchor, and shadowing it here would break the download silently.
  const doc = useAppSelector((s) => s.document);
  const page = pageGeometry(effectivePageSetup(doc));
  const objectCount = doc.pages[0]?.objects.length ?? 0;
  const fps = useFps(objectCount > 0);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
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

  /** §6.6 round trip, export half: the document as a file, unabridged. */
  const exportDocument = () => {
    const url = URL.createObjectURL(
      new Blob([serializeDocument(doc)], { type: "application/json" }),
    );
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${doc.name.replace(/[^\w.-]+/g, "-").toLowerCase()}.v3.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /** Import half: migrate-on-read, validate, then replace — or say why not. */
  const importDocument = async (file: File) => {
    const result = readDocument(await file.text());
    if (result.ok) {
      setImportError(null);
      dispatch(documentReplaced(result.document));
    } else {
      setImportError(result.error);
    }
  };

  return (
    <div className="debug-bar">
      <span className="debug-group" role="group" aria-label="Mode">
        <button aria-pressed={mode === "layout"} onClick={() => onModeChange("layout")}>
          Layout
        </button>
        <button aria-pressed={mode === "photo"} onClick={() => onModeChange("photo")}>
          Photo
        </button>
      </span>
      <label className="debug-group">
        <input
          type="checkbox"
          checked={shapePresentation === "flyout"}
          onChange={(e) => onShapePresentationChange(e.target.checked ? "flyout" : "slots")}
        />
        shape flyout
      </label>
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
      <span className="debug-group" role="group" aria-label="Page objects">
        {/* The clear button empties page 1 whatever put objects there — the
            stress fixture or an imported document — so it is labelled for what
            it does rather than for one of the two ways in. */}
        {objectCount === 0 ? (
          <button onClick={() => dispatch(stressFixtureLoaded({ objects: buildStressFixture() }))}>
            Load stress fixture
          </button>
        ) : (
          <button onClick={() => dispatch(stressFixtureCleared())}>
            Clear page ({objectCount})
          </button>
        )}
        {fps !== null && <span data-testid="fps">{fps} fps</span>}
      </span>
      <span className="debug-group" role="group" aria-label="Document">
        <span data-testid="doc-name">{doc.name}</span>
        <button onClick={exportDocument}>Export JSON</button>
        <button onClick={() => fileRef.current?.click()}>Import JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clear the input so re-picking the same file fires change again.
            e.target.value = "";
            if (file) void importDocument(file);
          }}
        />
        {importError !== null && (
          <span data-testid="import-error" role="alert">
            {importError}
          </span>
        )}
      </span>
    </div>
  );
}
