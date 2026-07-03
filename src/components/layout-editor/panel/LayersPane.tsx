"use client";

import { useRef, useState } from "react";
import { Circle, Image as ImageIcon, Minus, Square, Type } from "lucide-react";
import { surfaceObjects, useLayoutStore } from "@/store";
import type { LayoutDocument, LayoutObject } from "@/schema";

/**
 * Layers tab (plan L8): the editing surface's objects listed top-to-bottom
 * (topmost first — the reverse of array z-order). Click selects; a vertical
 * pointer drag reorders — fixed-height rows make the target slot a pure
 * function of the pointer's travel, and the drop commits one undo step via
 * `reorderObject`. Same deferred-capture pattern as the canvas gestures, so
 * plain clicks stay clicks.
 */

const ROW_H = 28;
/** Vertical travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

function rowLabel(o: LayoutObject, doc: LayoutDocument): string {
  switch (o.type) {
    case "text": {
      const t = o.text?.content.trim() ?? "";
      return t ? (t.length > 22 ? `${t.slice(0, 22)}…` : t) : "Text";
    }
    case "picture":
      return (o.assetId && doc.assets[o.assetId]?.name) || "Picture";
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
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
    case "picture":
      return <ImageIcon {...props} />;
  }
}

export function LayersPane() {
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const setSelection = useLayoutStore((s) => s.setSelection);
  const reorderObject = useLayoutStore((s) => s.reorderObject);

  const objs = surfaceObjects({ doc, activePageId, masterEditingId });
  const rows = [...objs].reverse(); // topmost first
  const n = rows.length;

  const gesture = useRef<{ pointerId: number; from: number; startY: number; captured?: boolean } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);

  const surfaceLabel = masterEditingId
    ? `Master ${doc.masters.find((m) => m.id === masterEditingId)?.label ?? ""}`
    : `Page ${Math.max(doc.pages.findIndex((p) => p.id === activePageId), 0) + 1}`;

  const targetIndex = (from: number, clientY: number, startY: number) =>
    Math.max(0, Math.min(n - 1, from + Math.round((clientY - startY) / ROW_H)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#efefef] px-3 pb-[10px] pt-3">
        <div data-testid="layers-surface" className="text-[10px] text-[#9a9a9a]">
          {surfaceLabel} · top to bottom
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-[8px]">
        {n === 0 ? (
          <div data-testid="layers-empty" className="px-2 pt-1 text-[10px] leading-relaxed text-[#a0a0a0]">
            Nothing on this {masterEditingId ? "master" : "page"} yet — draw with the tools to add
            objects.
          </div>
        ) : (
          <div data-testid="layers-list" className="flex flex-col">
            {rows.map((o, di) => {
              const dragging = drag?.from === di;
              // brand line marks the slot the dragged row will land in
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
                  data-testid={`layer-row-${di}`}
                  data-selected={selected || undefined}
                  role="button"
                  style={{
                    height: ROW_H,
                    transform: dragging ? `translateY(${drag.dy}px)` : undefined,
                  }}
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
                      // display index → array z-index (the list is reversed)
                      reorderObject(rows[g.from].id, n - 1 - to);
                    }
                  }}
                >
                  <RowIcon type={o.type} />
                  <span className="min-w-0 flex-1 truncate">{rowLabel(o, doc)}</span>
                </div>
              );
            })}
            <div className="px-2 pt-[6px] text-[9.5px] leading-relaxed text-[#a8a8a8]">
              Drag to restack — the top row prints in front.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
