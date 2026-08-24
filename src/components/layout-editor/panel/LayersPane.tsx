"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Minus,
  Printer,
  Spline,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { surfaceObjects, useLayoutStore } from "@/store";
import { Badge } from "@/components/ui/Badge";
import { textContent } from "@/lib/layout/text";
import type { LayerDef, LayoutDocument, LayoutObject, PageLayer } from "@/schema";

/**
 * Layers tab (redesign Phase 5 — figma "Layers Tab"): named layer rows,
 * top-to-bottom, each with the figma's grip, accent bar, inline rename,
 * Non-Print/Locked badges, eye toggle, and merge-delete; "+ New Layer" and
 * "Merge Down" act on the stack/active layer. Each layer expands to its
 * object rows (click selects, vertical drag restacks within the layer — the
 * L8 behaviors, now scoped to a band). Master editing has no layers, so that
 * surface keeps the flat object list.
 */

const ROW_H = 28;
/** Vertical travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

function rowLabel(o: LayoutObject, doc: LayoutDocument): string {
  switch (o.type) {
    case "text": {
      const t = o.text ? textContent(o.text).trim() : "";
      return t ? (t.length > 22 ? `${t.slice(0, 22)}…` : t) : "Text";
    }
    case "picture":
      return (o.assetId && doc.assets[o.assetId]?.name) || "Picture";
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "path":
      return "Path";
    case "line":
      return "Line";
  }
}

function RowIcon({ type }: { type: LayoutObject["type"] }) {
  const props = { size: 12, strokeWidth: 1.7, className: "shrink-0 text-[#8a8a8a]" };
  switch (type) {
    case "rect":
      return <Square {...props} />;
    case "ellipse":
      return <Circle {...props} />;
    case "line":
      return <Minus {...props} />;
    case "text":
      return <Type {...props} />;
    case "path":
      return <Spline {...props} />;
    case "picture":
      return <ImageIcon {...props} />;
  }
}

/**
 * One layer's object rows (topmost first). `rowOffset` numbers the global
 * `layer-row-N` testids across layers; `flatBase` is the layer band's start
 * index in the page's flat z-order, so a drop commits through the same
 * `reorderObject` contract as before (redistribution clamps to the band).
 */
function ObjectRows({
  objects,
  rowOffset,
  flatBase,
}: {
  objects: LayoutObject[];
  rowOffset: number;
  flatBase: number;
}) {
  const doc = useLayoutStore((s) => s.doc);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const setSelection = useLayoutStore((s) => s.setSelection);
  const reorderObject = useLayoutStore((s) => s.reorderObject);

  const rows = [...objects].reverse(); // topmost first
  const n = rows.length;
  const gesture = useRef<{ pointerId: number; from: number; startY: number; captured?: boolean } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);

  const targetIndex = (from: number, clientY: number, startY: number) =>
    Math.max(0, Math.min(n - 1, from + Math.round((clientY - startY) / ROW_H)));

  return (
    <div className="flex flex-col pl-[18px]">
      {rows.map((o, di) => {
        const dragging = drag?.from === di;
        const indicator =
          drag && !dragging && di === drag.to
            ? drag.to > drag.from
              ? "shadow-[inset_0_-2px_0_var(--color-brand)]"
              : "shadow-[inset_0_2px_0_var(--color-brand)]"
            : "";
        const selected = selectedIds.includes(o.id);
        return (
          <div
            key={o.id}
            data-testid={`layer-row-${rowOffset + di}`}
            data-selected={selected || undefined}
            role="button"
            style={{ height: ROW_H, transform: dragging ? `translateY(${drag.dy}px)` : undefined }}
            className={`flex cursor-pointer touch-none select-none items-center gap-[7px] rounded-[5px] px-2 text-[10.5px] ${indicator} ${
              dragging
                ? "relative z-10 border border-brand bg-white shadow-[0_2px_8px_rgba(0,0,0,.18)]"
                : selected
                  ? "bg-brand-tint text-brand"
                  : "text-[#555] hover:bg-[#f2f2f2]"
            }`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              setSelection([o.id]);
              gesture.current = { pointerId: e.pointerId, from: di, startY: e.clientY };
            }}
            onPointerMove={(e) => {
              const g = gesture.current;
              if (!g || g.pointerId !== e.pointerId) return;
              const dy = e.clientY - g.startY;
              if (!g.captured) {
                if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                g.captured = true;
              }
              setDrag({ from: g.from, to: targetIndex(g.from, e.clientY, g.startY), dy });
            }}
            onPointerUp={(e) => {
              const g = gesture.current;
              gesture.current = null;
              setDrag(null);
              if (g?.captured) {
                const to = targetIndex(g.from, e.clientY, g.startY);
                // display index → band-local z-index → flat z-index
                reorderObject(rows[g.from].id, flatBase + (n - 1 - to));
              }
            }}
          >
            <RowIcon type={o.type} />
            <span className="min-w-0 flex-1 truncate">{rowLabel(o, doc)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One named layer row — figma: grip · accent bar · name · badges · eye. */
function LayerRow({
  def,
  content,
  index,
  active,
  expanded,
  onToggleExpand,
}: {
  def: LayerDef;
  content: PageLayer | undefined;
  /** Display index, top-first — drives the row testids. */
  index: number;
  active: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const setActiveLayer = useLayoutStore((s) => s.setActiveLayer);
  const renameLayer = useLayoutStore((s) => s.renameLayer);
  const setLayerVisible = useLayoutStore((s) => s.setLayerVisible);
  const setLayerLocked = useLayoutStore((s) => s.setLayerLocked);
  const setLayerNonPrint = useLayoutStore((s) => s.setLayerNonPrint);
  const mergeLayerDown = useLayoutStore((s) => s.mergeLayerDown);
  const lastLayer = useLayoutStore((s) => s.doc.layers.length < 2);
  const [renaming, setRenaming] = useState(false);

  const iconBtn = (title: string) =>
    `flex h-[20px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[#777] hover:bg-[#ececec] ${title}`;

  return (
    <div
      data-testid={`layer-def-row-${index}`}
      data-active={active || undefined}
      onClick={() => setActiveLayer(def.id)}
      className={`group flex cursor-pointer select-none items-center gap-[4px] rounded-[8px] border px-[6px] py-[6px] ${
        active ? "border-brand bg-white" : "border-[#e4e4e4] bg-[#fafafa] hover:bg-[#f4f4f4]"
      }`}
    >
      <GripVertical size={13} strokeWidth={1.6} className="shrink-0 text-[#b5b5b5]" />
      <span className="h-[22px] w-[3px] shrink-0 rounded-[2px]" style={{ backgroundColor: def.color }} />
      <button
        type="button"
        aria-label={expanded ? "Collapse objects" : "Expand objects"}
        data-testid={`layer-expand-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className={iconBtn("")}
      >
        {expanded ? <ChevronDown size={13} strokeWidth={1.8} /> : <ChevronRight size={13} strokeWidth={1.8} />}
      </button>

      {renaming ? (
        <input
          autoFocus
          defaultValue={def.name}
          aria-label="Layer name"
          data-testid="layer-name-input"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== def.name) renameLayer(def.id, v);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="min-w-0 flex-1 rounded-[3px] border border-[#c9c9c9] bg-white px-1 text-[11px] text-[#333] outline-none"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
          title="Double-click to rename"
          className={`min-w-[56px] flex-1 truncate text-[11px] ${active ? "font-semibold text-[#333]" : "text-[#444]"}`}
        >
          {def.name}
          <span className="ml-1 text-[9.5px] text-[#a0a0a0]">
            {content?.objects.length ?? 0}
          </span>
        </span>
      )}

      {def.nonPrint && (
        <Badge variant="tag" className="px-[6px] text-[9px]">
          Non-Print
        </Badge>
      )}
      {def.locked && (
        <Badge variant="tag" className="px-[6px] text-[9px]">
          Locked
        </Badge>
      )}

      <button
        type="button"
        aria-label={def.nonPrint ? "Include in print" : "Exclude from print"}
        aria-pressed={def.nonPrint}
        title={def.nonPrint ? "Include in print" : "Exclude from print"}
        data-testid={`layer-np-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          setLayerNonPrint(def.id, !def.nonPrint);
        }}
        className={`${iconBtn("")} opacity-0 focus-visible:opacity-100 group-hover:opacity-100`}
      >
        <Printer size={12} strokeWidth={1.7} className={def.nonPrint ? "opacity-35" : ""} />
      </button>
      <button
        type="button"
        aria-label={def.locked ? "Unlock layer" : "Lock layer"}
        aria-pressed={def.locked}
        data-testid={`layer-lock-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          setLayerLocked(def.id, !def.locked);
        }}
        className={`${iconBtn("")} opacity-0 focus-visible:opacity-100 group-hover:opacity-100`}
      >
        {def.locked ? <Lock size={12} strokeWidth={1.7} /> : <LockOpen size={12} strokeWidth={1.7} />}
      </button>
      <button
        type="button"
        aria-label={def.visible ? "Hide layer" : "Show layer"}
        aria-pressed={def.visible}
        data-testid={`layer-eye-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          setLayerVisible(def.id, !def.visible);
        }}
        className={iconBtn("")}
      >
        {def.visible ? <Eye size={12} strokeWidth={1.7} /> : <EyeOff size={12} strokeWidth={1.7} />}
      </button>
      <button
        type="button"
        aria-label="Delete layer (merges into the layer below)"
        title={lastLayer ? "The last layer can't be deleted" : "Delete layer (merges its content down)"}
        disabled={lastLayer}
        data-testid={`layer-delete-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          mergeLayerDown(def.id);
        }}
        className={`${iconBtn("")} disabled:cursor-default disabled:opacity-35`}
      >
        <Trash2 size={12} strokeWidth={1.7} />
      </button>
    </div>
  );
}

export function LayersPane() {
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const activeLayerId = useLayoutStore((s) => s.activeLayerId);
  const addLayer = useLayoutStore((s) => s.addLayer);
  const mergeLayerDown = useLayoutStore((s) => s.mergeLayerDown);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
  const objs = surfaceObjects({ doc, activePageId, masterEditingId });

  const surfaceLabel = masterEditingId
    ? `Master ${doc.masters.find((m) => m.id === masterEditingId)?.label ?? ""}`
    : `Page ${Math.max(doc.pages.findIndex((p) => p.id === activePageId), 0) + 1}`;

  // top-first display order of layer defs, with each band's flat-index base
  const defsTopFirst = [...doc.layers].reverse();
  const flatBase = new Map<string, number>();
  {
    let acc = 0;
    for (const l of page.layers) {
      flatBase.set(l.layerId, acc);
      acc += l.objects.length;
    }
  }

  const toggleExpand = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const btn =
    "cursor-pointer rounded-[4px] bg-[#f0f0f0] px-[10px] py-[5px] text-[10.5px] font-medium text-[#333] hover:bg-[#e6e6e6] disabled:cursor-default disabled:opacity-45";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#efefef] pb-[10px]">
        <div data-testid="layers-surface" className="text-[10px] text-[#9a9a9a]">
          {surfaceLabel} · top to bottom
        </div>
        {!masterEditingId && (
          <div className="mt-2 flex gap-2">
            <button type="button" data-testid="layer-add" onClick={addLayer} className={btn}>
              + New Layer
            </button>
            <button
              type="button"
              data-testid="layer-merge"
              disabled={doc.layers.length < 2}
              onClick={() => mergeLayerDown(activeLayerId)}
              title="Merge the active layer into the layer below"
              className={btn}
            >
              Merge Down
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-[8px]">
        {masterEditingId ? (
          // masters have no layers — the flat object list, as before
          objs.length === 0 ? (
            <div data-testid="layers-empty" className="px-2 pt-1 text-[10px] leading-relaxed text-[#a0a0a0]">
              Nothing on this master yet — draw with the tools to add objects.
            </div>
          ) : (
            <div data-testid="layers-list" className="flex flex-col">
              <ObjectRows objects={objs} rowOffset={0} flatBase={0} />
            </div>
          )
        ) : (
          <div data-testid="layers-list" className="flex flex-col gap-[6px]">
            {(() => {
              let rowOffset = 0;
              return defsTopFirst.map((def, i) => {
                const content = page.layers.find((l) => l.layerId === def.id);
                const expanded = !collapsed.has(def.id);
                const rows = (
                  <div key={def.id} className="flex flex-col gap-[2px]">
                    <LayerRow
                      def={def}
                      content={content}
                      index={i}
                      active={def.id === activeLayerId}
                      expanded={expanded}
                      onToggleExpand={() => toggleExpand(def.id)}
                    />
                    {expanded && content && content.objects.length > 0 && (
                      <ObjectRows
                        objects={content.objects}
                        rowOffset={rowOffset}
                        flatBase={flatBase.get(def.id) ?? 0}
                      />
                    )}
                  </div>
                );
                rowOffset += content?.objects.length ?? 0;
                return rows;
              });
            })()}
            {objs.length === 0 && (
              <div data-testid="layers-empty" className="px-2 pt-1 text-[10px] leading-relaxed text-[#a0a0a0]">
                Nothing on this page yet — draw with the tools to add objects.
              </div>
            )}
            <div className="px-2 pt-[6px] text-[9.5px] leading-relaxed text-[#a8a8a8]">
              Drag object rows to restack within a layer — the top row prints in front.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
