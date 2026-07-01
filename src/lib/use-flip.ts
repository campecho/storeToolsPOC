import { useLayoutEffect, useRef } from "react";

/**
 * Minimal FLIP: rows glide to their new position when the list reorders
 * (handoff motion note: "items reorder gently on the board as backing
 * shifts"). Positions are re-captured after every render; elements without a
 * prior position (newly filtered in) simply appear.
 */
export function useFlip(): (id: number) => (el: HTMLElement | null) => void {
  const els = useRef(new Map<number, HTMLElement>());
  const prev = useRef(new Map<number, DOMRect>());

  useLayoutEffect(() => {
    els.current.forEach((el, id) => {
      const last = prev.current.get(id);
      const next = el.getBoundingClientRect();
      if (last) {
        const dy = last.top - next.top;
        if (dy !== 0) {
          el.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
            { duration: 240, easing: "ease" },
          );
        }
      }
      prev.current.set(id, next);
    });
  });

  // Ref callbacks are cached per id so their identity is stable across
  // renders — otherwise React detaches/re-attaches every render and the
  // previous-position map is wiped before it can be compared.
  const callbacks = useRef(new Map<number, (el: HTMLElement | null) => void>());
  return (id: number) => {
    let cb = callbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) els.current.set(id, el);
        else {
          els.current.delete(id);
          prev.current.delete(id);
        }
      };
      callbacks.current.set(id, cb);
    }
    return cb;
  };
}
