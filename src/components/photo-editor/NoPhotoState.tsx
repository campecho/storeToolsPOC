"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

/**
 * The no-photo state (plan open question #5 — the wires open with a photo
 * loaded, so the POC supplies a large drop target styled to the pasteboard,
 * plus a Browse button over a real <input type=file>). Drag-over is reflected;
 * a drop or pick hands the first file to the open flow.
 */
export function NoPhotoState({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      data-testid="photo-no-photo"
      className="flex flex-1 items-center justify-center bg-[#d3d3d3] p-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pick(e.dataTransfer.files);
      }}
    >
      <div
        className={`flex w-full max-w-[520px] flex-col items-center rounded-[12px] border-2 border-dashed px-8 py-14 text-center transition-colors duration-200 ${
          dragOver ? "border-brand bg-brand-tint" : "border-[#b9b9b9] bg-[#e2e2e2]"
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[12px] bg-white shadow-[0_1px_4px_rgba(0,0,0,.12)]">
          <ImagePlus size={26} strokeWidth={1.7} className="text-[#666]" />
        </div>
        <div className="mt-4 text-[16px] font-semibold text-[#333]">Drop a photo to start editing</div>
        <div className="mt-2 max-w-[360px] text-[12px] leading-relaxed text-[#777]">
          JPG, PNG, WEBP, TIFF, HEIC, and more. Your photo opens on a screen proxy — the full-resolution render happens
          on export.
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-[6px] bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-press"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          data-testid="photo-open-input"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
