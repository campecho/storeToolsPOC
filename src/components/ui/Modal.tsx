"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Centered modal from the redesign frames (Find & Replace, dialogs): white
 * r12 card over a dimmed backdrop; Escape and backdrop-click close. Shared
 * primitive (plan Phase 0, landed with its first consumer in Phase 7).
 */
export function Modal({
  title,
  onClose,
  children,
  testId,
  width = 450,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  width?: number;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,.32)] animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        data-testid={testId}
        style={{ width }}
        className="max-h-[80vh] overflow-y-auto rounded-[12px] border border-[#cccccc] bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,.22)] animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13px] font-bold text-[#111]">{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[5px] text-[#777] hover:bg-[#f0f0f0]"
          >
            <X size={15} strokeWidth={1.9} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
