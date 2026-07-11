"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Image as ImageIcon,
  Italic,
  Type,
} from "lucide-react";
import { usePhotoStore } from "@/lib/store/photo-store";
import { FONT_CATALOG } from "@/lib/layout/font-catalog";
import { ingestOverlayImage } from "@/lib/photo/client";
import {
  foldOverlays,
  hideOverlayOp,
  type OverlayOp,
  type TextOverlayOp,
} from "@/lib/photo/overlay-raster";

/**
 * Text & image panel (wire Section B, ~lines 339–367). Mounts in the ContextPanel
 * body while the Text & image tool is active (PE6).
 *
 * Groups, top→bottom (copy verbatim from the wire):
 *   1. **Add text** / **Add image** — Add text mints a default text overlay
 *      (store `addTextOverlay`); Add image opens a file picker, ingests the file
 *      through the lean overlay on-ramp (`ingestOverlayImage`, master-only, no
 *      document), then places it (`addLogoOverlay`);
 *   2. **On this image** — the layer list, straight from `foldOverlays` (the ONE
 *      fold the canvas + export also use): a row per overlay, click selects, ✕
 *      removes (pushes a same-id `hidden:true` tombstone);
 *   3. **Character** — controls bound to the SELECTED text overlay: content, font
 *      family, size, B/I, color, alignment. Each change rides a coalesced
 *      `pushOp(..., "Edit text")`, so a burst of edits to one overlay collapses to
 *      one history step. Disabled when the selection isn't a text overlay.
 *
 * POC deviation (documented): `font.size` is master PIXELS (the schema unit), so
 * the size field reads/writes px, not the wire's "pt" — pt needs an export DPI we
 * only resolve at render. The overlay handles + z order live on the canvas
 * (OverlayHandles); this panel is the list + Character surface.
 */

const WF_H = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#5f5f5f]";

export function TextImagePanel() {
  const doc = usePhotoStore((s) => s.doc);
  const selectedOverlayId = usePhotoStore((s) => s.selectedOverlayId);
  const setSelectedOverlayId = usePhotoStore((s) => s.setSelectedOverlayId);
  const addTextOverlay = usePhotoStore((s) => s.addTextOverlay);
  const addLogoOverlay = usePhotoStore((s) => s.addLogoOverlay);
  const pushOp = usePhotoStore((s) => s.pushOp);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The visible overlays, in z order — the single shared fold.
  const overlays = useMemo<OverlayOp[]>(() => {
    if (!doc) return [];
    return foldOverlays(doc.recipe.slice(0, doc.cursor));
  }, [doc]);

  const selected = overlays.find((o) => o.id === selectedOverlayId) ?? null;
  const selectedText: TextOverlayOp | null =
    selected && selected.op === "textOverlay" ? selected : null;
  // The render contract caps the overlays sidecar at 16 — guard the add so an
  // export never fails validation (RenderPayloadSchema.overlays.max(16)).
  const atCap = overlays.length >= 16;

  if (!doc) return null;

  /** A coalesced edit to the selected text overlay ("Edit text" history step). */
  function editText(patch: Partial<TextOverlayOp>) {
    if (!selectedText) return;
    pushOp({ ...selectedText, ...patch, label: "Edit text" }, { coalesce: true });
  }

  function removeOverlay(o: OverlayOp) {
    pushOp(hideOverlayOp(o, o.op === "textOverlay" ? "Remove text" : "Remove image"));
    if (selectedOverlayId === o.id) setSelectedOverlayId(null);
  }

  function onAddImageClick() {
    setNote(null);
    fileInputRef.current?.click();
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // re-picking the same file should re-fire
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      const outcome = await ingestOverlayImage(file);
      if (outcome.ok) {
        addLogoOverlay(outcome.result.assetId, outcome.result.width, outcome.result.height);
      } else {
        setNote(outcome.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="photo-text-panel" className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-[15px]">
        {/* 1 · ADD TEXT / ADD IMAGE */}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="text-add-text"
            onClick={() => addTextOverlay()}
            disabled={atCap}
            title={atCap ? "Up to 16 overlays per photo" : undefined}
            className="flex h-[34px] flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[6px] border border-[#cfcfcf] bg-white text-[12px] font-semibold text-[#444] hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Type size={14} strokeWidth={1.9} className="text-[#555]" />
            Add text
          </button>
          <button
            type="button"
            data-testid="text-add-image"
            onClick={onAddImageClick}
            disabled={busy || atCap}
            title={atCap ? "Up to 16 overlays per photo" : undefined}
            className="flex h-[34px] flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[6px] border border-[#cfcfcf] bg-white text-[12px] font-semibold text-[#444] hover:bg-[#f4f4f4] disabled:cursor-wait disabled:opacity-60"
          >
            <ImageIcon size={14} strokeWidth={1.6} className="text-[#555]" />
            {busy ? "Adding…" : "Add image"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="text-image-input"
            onChange={onPickImage}
          />
        </div>
        {note && (
          <div
            data-testid="text-image-note"
            className="rounded-[6px] border border-[#f0c9c9] bg-[#FBEBEB] px-[10px] py-[7px] text-[11px] text-[#9a1818]"
          >
            {note}
          </div>
        )}

        {/* 2 · ON THIS IMAGE — the layer list */}
        <div>
          <div className={`${WF_H} mb-2`}>On this image</div>
          {overlays.length === 0 ? (
            <div
              data-testid="text-layers-empty"
              className="rounded-[6px] border border-dashed border-[#dcdcdc] px-[10px] py-[9px] text-[11px] text-[#999]"
            >
              No text or images yet — add one above.
            </div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {overlays.map((o, i) => {
                const active = o.id === selectedOverlayId;
                const isText = o.op === "textOverlay";
                const preview = isText
                  ? (o as TextOverlayOp).text.trim() || "(empty text)"
                  : "Image";
                return (
                  <div
                    key={o.id}
                    data-testid={`text-layer-${i}`}
                    data-active={active ? "true" : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedOverlayId(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedOverlayId(o.id);
                      }
                    }}
                    className={`flex h-[34px] cursor-pointer items-center gap-2 rounded-[6px] px-[10px] ${
                      active
                        ? "border-[1.5px] border-brand bg-brand-tint"
                        : "border border-[#e0e0e0] hover:border-[#cfcfcf]"
                    }`}
                  >
                    {isText ? (
                      <Type
                        size={13}
                        strokeWidth={1.9}
                        className={active ? "text-brand-deep" : "text-[#888]"}
                      />
                    ) : (
                      <ImageIcon
                        size={13}
                        strokeWidth={1.6}
                        className={active ? "text-brand-deep" : "text-[#888]"}
                      />
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate text-[12px] ${
                        active ? "font-semibold text-brand-deep" : "text-[#555]"
                      }`}
                    >
                      {preview}
                    </span>
                    <button
                      type="button"
                      data-testid={`text-layer-remove-${i}`}
                      aria-label="Remove layer"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeOverlay(o);
                      }}
                      className={`shrink-0 cursor-pointer text-[10px] ${
                        active ? "text-[#c98a8a] hover:text-brand" : "text-[#bbb] hover:text-[#888]"
                      }`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3 · CHARACTER — bound to the selected text overlay */}
        <div>
          <div className={`${WF_H} mb-2`}>Character</div>
          {!selectedText && (
            <div className="mb-2 text-[10.5px] text-[#999]">
              Select a text layer to edit its type.
            </div>
          )}

          {/* content */}
          <input
            type="text"
            data-testid="text-content"
            value={selectedText?.text ?? ""}
            disabled={!selectedText}
            placeholder="Text"
            aria-label="Text content"
            onChange={(e) => editText({ text: e.target.value })}
            className="mb-2 h-[30px] w-full rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555] outline-none focus:border-[#c8c8c8] disabled:cursor-not-allowed disabled:bg-[#f6f6f6] disabled:text-[#aaa]"
          />

          {/* font family */}
          <select
            data-testid="text-font"
            value={selectedText?.font.family ?? FONT_CATALOG[0].name}
            disabled={!selectedText}
            aria-label="Font family"
            onChange={(e) => selectedText && editText({ font: { ...selectedText.font, family: e.target.value } })}
            className="mb-2 h-[30px] w-full cursor-pointer rounded-[5px] border border-[#d6d6d6] bg-white px-[9px] text-[12px] text-[#555] outline-none disabled:cursor-not-allowed disabled:bg-[#f6f6f6] disabled:text-[#aaa]"
          >
            {FONT_CATALOG.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>

          {/* size + B / I */}
          <div className="mb-2 flex gap-[6px]">
            <div className="flex h-[30px] flex-1 items-center rounded-[5px] border border-[#d6d6d6] bg-white px-[9px]">
              <input
                type="number"
                min={1}
                data-testid="text-size"
                value={selectedText ? selectedText.font.size : ""}
                disabled={!selectedText}
                aria-label="Font size (px)"
                onChange={(e) => {
                  if (!selectedText) return;
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n) && n >= 1) {
                    editText({ font: { ...selectedText.font, size: n } });
                  }
                }}
                className="w-full min-w-0 bg-transparent text-[12px] text-[#555] outline-none disabled:cursor-not-allowed disabled:text-[#aaa]"
              />
              <span className="shrink-0 text-[11px] text-[#b0b0b0]">px</span>
            </div>
            <ToggleButton
              testId="text-bold"
              label="Bold"
              active={!!selectedText?.font.bold}
              disabled={!selectedText}
              onClick={() => selectedText && editText({ font: { ...selectedText.font, bold: !selectedText.font.bold } })}
            >
              <Bold size={13} strokeWidth={2.2} />
            </ToggleButton>
            <ToggleButton
              testId="text-italic"
              label="Italic"
              active={!!selectedText?.font.italic}
              disabled={!selectedText}
              onClick={() => selectedText && editText({ font: { ...selectedText.font, italic: !selectedText.font.italic } })}
            >
              <Italic size={13} strokeWidth={2} />
            </ToggleButton>
            <label
              className={`flex h-[30px] w-[34px] items-center justify-center rounded-[5px] border ${
                selectedText ? "cursor-pointer border-[#dcdcdc] bg-white" : "cursor-not-allowed border-[#e6e6e6] bg-[#f6f6f6]"
              }`}
              title="Text color"
            >
              <input
                type="color"
                data-testid="text-color"
                value={selectedText?.color ?? "#1a1a1a"}
                disabled={!selectedText}
                aria-label="Text color"
                onChange={(e) => editText({ color: e.target.value })}
                className="h-[16px] w-[20px] cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed"
              />
            </label>
          </div>

          {/* alignment */}
          <div className="flex gap-[5px]">
            {(
              [
                ["l", "left", AlignLeft],
                ["c", "center", AlignCenter],
                ["r", "right", AlignRight],
              ] as const
            ).map(([key, align, Icon]) => {
              const active = selectedText?.align === align;
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`text-align-${key}`}
                  aria-label={`Align ${align}`}
                  aria-pressed={active}
                  disabled={!selectedText}
                  onClick={() => editText({ align })}
                  className={`flex h-[28px] flex-1 items-center justify-center rounded-[5px] border ${
                    active
                      ? "border-brand bg-brand-tint text-brand-deep"
                      : "border-[#dcdcdc] bg-white text-[#777] hover:bg-[#f4f4f4]"
                  } ${selectedText ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <Icon size={14} strokeWidth={1.7} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer note — copy verbatim from the wire. */}
        <div
          data-testid="text-handles-note"
          className="rounded-[7px] border border-[#ececec] bg-[#fafafa] p-[10px] text-[10.5px] text-[#999]"
        >
          Same handles as the Layout Editor — drag to place, corners to scale, top
          handle to rotate.
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  testId,
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border ${
        active
          ? "border-brand bg-brand-tint text-brand-deep"
          : "border-[#dcdcdc] bg-white text-[#555] hover:bg-[#f4f4f4]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}
