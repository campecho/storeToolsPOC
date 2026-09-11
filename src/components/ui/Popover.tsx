"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Anchored popover (plan Phase 0, deferred to its first consumer — the Phase
 * 12 color picker): a trigger plus a floating panel positioned below it in
 * viewport space, so a panel opened inside the scrolling inspector or the
 * ribbon is never clipped by its container. Closes on outside pointer-down
 * or Escape; flips above the trigger when it would run off the bottom.
 */
export function Popover({
  open,
  onClose,
  trigger,
  children,
  width = 256,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  /** The always-visible anchor (a button); the panel hangs below it. */
  trigger: ReactNode;
  children: ReactNode;
  width?: number;
  testId?: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight ?? 0;
      if (!a) return;
      const margin = 8;
      const left = Math.max(margin, Math.min(a.left, window.innerWidth - width - margin));
      const below = a.bottom + 4;
      const fits = below + panelH <= window.innerHeight - margin;
      const top = fits ? below : Math.max(margin, a.top - 4 - panelH);
      setPos({ top, left });
    };
    place();
    // the panel's height changes with its content (a mode switch) — re-place
    // so a panel flipped above its trigger never floats away from it
    const observer = panelRef.current ? new ResizeObserver(place) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, width]);

  // The latest onClose, read at event time, so a fresh callback identity per
  // render doesn't re-subscribe the listeners.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    // Capture phase, so the editor's own Escape (deselect) never fires under
    // an open popover. An input inside the panel that owns a draft marks
    // itself `data-draft`: that Escape is the input's to revert, and the
    // popover stays open for it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.target instanceof HTMLElement && e.target.dataset.draft === "true") return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className="relative inline-flex shrink-0">
      {trigger}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          data-testid={testId}
          className="fixed z-50 rounded-[8px] border border-[#d6d6d6] bg-white p-3 shadow-[0_6px_24px_rgba(0,0,0,.14)] animate-pop-in"
          style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
