"use client";

import { useRef, useState } from "react";
import { FileText, ImagePlus } from "lucide-react";
import { useLayoutStore } from "@/store";
import type { Asset } from "@/schema";
import { putAssetBlob } from "@/lib/assets/blob-store";
import { useAssetUrl } from "@/lib/assets/use-asset-url";

/**
 * Assets tab (plan L8): upload/import content to use in the layout — file
 * picker + drag-drop, images and PDFs. Clicking an image places it on the
 * page (or binds it to the selected picture frame); PDFs join the library but
 * stay honestly un-placeable until the print pipeline can rasterize them.
 * Unsupported files are skipped with a visible note, never silently.
 */

/** Natural pixel size via an off-DOM <img> — an SVG without intrinsic size reads 0×0. */
function imageDims(file: File): Promise<{ w: number; h: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(undefined);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function AssetThumb({ asset }: { asset: Asset }) {
  const url = useAssetUrl(asset.kind === "image" ? asset.id : undefined);
  return (
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-[#e8e8e8] bg-[#f4f4f4]">
      {asset.kind === "pdf" ? (
        <FileText size={15} strokeWidth={1.6} className="text-[#9a9a9a]" />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URLs can't go through next/image
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImagePlus size={14} strokeWidth={1.5} className="text-[#c0c0c0]" />
      )}
    </div>
  );
}

export function AssetsPane() {
  const assets = useLayoutStore((s) => s.doc.assets);
  const addAsset = useLayoutStore((s) => s.addAsset);
  const removeAsset = useLayoutStore((s) => s.removeAsset);
  const placeAsset = useLayoutStore((s) => s.placeAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const importFiles = async (files: Iterable<File>) => {
    let skipped = 0;
    for (const file of Array.from(files)) {
      const kind =
        file.type === "application/pdf"
          ? ("pdf" as const)
          : file.type.startsWith("image/")
            ? ("image" as const)
            : null;
      if (!kind) {
        skipped++;
        continue;
      }
      const id = crypto.randomUUID();
      const dims = kind === "image" ? await imageDims(file) : undefined;
      await putAssetBlob(id, file);
      addAsset({
        id,
        name: file.name,
        kind,
        mime: file.type,
        width: dims?.w,
        height: dims?.h,
        bytes: file.size,
      });
    }
    setNote(skipped ? `Skipped ${skipped} file${skipped > 1 ? "s" : ""} — images and PDFs only` : null);
  };

  const list = Object.values(assets);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      <div className="shrink-0 border-b border-[#efefef] px-3 pb-[10px] pt-3">
        <button
          type="button"
          data-testid="asset-import"
          onClick={() => inputRef.current?.click()}
          className={`flex w-full cursor-pointer flex-col items-center gap-[3px] rounded-[6px] border-[1.5px] border-dashed px-2 py-[10px] text-[10.5px] ${
            dragOver
              ? "border-brand bg-brand-tint text-brand"
              : "border-[#cfcfcf] text-[#8a8a8a] hover:border-[#b0b0b0] hover:text-[#666]"
          }`}
        >
          <ImagePlus size={15} strokeWidth={1.6} />
          <span className="font-semibold">Import images or PDFs</span>
          <span className="text-[9.5px] text-[#a8a8a8]">or drag files here</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          data-testid="asset-file-input"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(e.target.files);
            e.target.value = ""; // re-importing the same file should re-fire
          }}
        />
        {note && (
          <div data-testid="asset-note" className="mt-[6px] text-[10px] text-brand">
            {note}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-[10px]">
        {list.length === 0 ? (
          <div className="px-1 pt-1 text-[10px] leading-relaxed text-[#a0a0a0]">
            Nothing imported yet. Assets you bring in are saved with this publication.
          </div>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {list.map((a, i) => (
              <div key={a.id} className="group relative">
                <button
                  type="button"
                  data-testid={`asset-tile-${i}`}
                  disabled={a.kind === "pdf"}
                  title={
                    a.kind === "pdf"
                      ? "PDF placement arrives with the print pipeline"
                      : "Place on the page"
                  }
                  onClick={() => placeAsset(a.id)}
                  className="flex w-full items-center gap-2 rounded-[6px] border border-[#e4e4e4] bg-white p-[6px] text-left hover:border-[#c9c9c9] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:hover:border-[#e4e4e4] disabled:hover:bg-white"
                >
                  <AssetThumb asset={a} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10.5px] text-[#444]">{a.name}</div>
                    <div className="text-[9px] text-[#9f9f9f]">
                      {a.kind === "pdf"
                        ? "PDF · library only for now"
                        : a.width && a.height
                          ? `${a.width} × ${a.height} px`
                          : "Image"}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  data-testid={`asset-remove-${i}`}
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAsset(a.id)}
                  className="absolute -right-[5px] -top-[5px] hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-[#d0d0d0] bg-white text-[10px] leading-none text-[#888] shadow-[0_1px_2px_rgba(0,0,0,.15)] hover:border-brand hover:text-brand group-hover:flex"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="pt-[4px] text-[9.5px] leading-relaxed text-[#a8a8a8]">
              Click an image to place it on the page — or select a picture frame first to fill it.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
