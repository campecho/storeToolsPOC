"use client";

import { Crop, Download, Eraser, Printer, SlidersHorizontal, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PhotoLevel, PhotoTool } from "@/lib/store/photo-store";

/**
 * Task rail (wire region 3). Six 64×52 tiles: Crop, Adjust, Fix for print,
 * Text & image, Clean up — a flex spacer + divider — then Export pinned at the
 * bottom. Clicking a tile toggles the active tool (clicking the active tile
 * returns to "none"); the active tile shows the wire's red inset ring
 * (2px #CC0000, bg rgba(204,0,0,.05)). At the Simple level only Crop and
 * Export render (Section E). During the F2 round-trip (`returnActive`, PE8) the
 * Export tile (and its divider) are hidden — "Done" in the return banner
 * replaces Export.
 */
const TILES: { tool: Exclude<PhotoTool, "none" | "export">; label: string; icon: LucideIcon }[] = [
  { tool: "crop", label: "Crop", icon: Crop },
  { tool: "adjust", label: "Adjust", icon: SlidersHorizontal },
  { tool: "fixprint", label: "Fix for print", icon: Printer },
  { tool: "text", label: "Text & image", icon: Type },
  { tool: "cleanup", label: "Clean up", icon: Eraser },
];

export function TaskRail({
  level,
  activeTool,
  onSelect,
  returnActive = false,
}: {
  level: PhotoLevel;
  activeTool: PhotoTool;
  onSelect: (tool: PhotoTool) => void;
  /** F2 round-trip (PE8): hide the Export tile — "Done" replaces it. */
  returnActive?: boolean;
}) {
  const tiles = level === "simple" ? TILES.filter((t) => t.tool === "crop") : TILES;

  return (
    <div className="flex w-[78px] shrink-0 flex-col items-center gap-[7px] border-r border-[#e4e4e4] bg-[#f4f4f4] py-[10px]">
      {tiles.map((t) => (
        <Tile key={t.tool} tool={t.tool} label={t.label} icon={t.icon} active={activeTool === t.tool} onSelect={onSelect} />
      ))}
      <div className="flex-1" />
      {!returnActive && (
        <>
          <div className="h-px w-11 bg-[#e0e0e0]" />
          <Tile tool="export" label="Export" icon={Download} active={activeTool === "export"} onSelect={onSelect} />
        </>
      )}
    </div>
  );
}

function Tile({
  tool,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  tool: PhotoTool;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (tool: PhotoTool) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`photo-rail-${tool}`}
      aria-pressed={active}
      onClick={() => onSelect(tool)}
      className="relative flex h-[52px] w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border border-[#e0e0e0] bg-white hover:border-[#d0d0d0]"
    >
      <Icon size={17} strokeWidth={1.7} className="text-[#555]" />
      <span className="text-[9px] text-[#666]">{label}</span>
      {active && (
        <span className="pointer-events-none absolute -inset-[2px] rounded-[7px] border-2 border-brand bg-[rgba(204,0,0,0.05)]" />
      )}
    </button>
  );
}
