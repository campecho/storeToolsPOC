import {
  Circle,
  Image,
  MousePointer2,
  Move,
  RectangleHorizontal,
  Search,
  Slash,
  Table,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLayoutStore, TOOL_LABELS, type EditorTool } from "@/store";

/**
 * Affinity-style tool palette (wire region 3): 9 single-select tools with
 * dividers. The active tool wears the red ring; the status bar mirrors it.
 * Canvas behavior per tool arrives with the interactive steps (L3+).
 */

type PaletteEntry =
  | { kind: "tool"; id: EditorTool; icon: LucideIcon | null }
  | { kind: "divider" };

const ENTRIES: PaletteEntry[] = [
  { kind: "tool", id: "select", icon: MousePointer2 },
  { kind: "tool", id: "text", icon: null }, // serif "T" glyph, per the wire
  { kind: "divider" },
  { kind: "tool", id: "rect", icon: RectangleHorizontal },
  { kind: "tool", id: "ellipse", icon: Circle },
  { kind: "tool", id: "line", icon: Slash },
  { kind: "divider" },
  { kind: "tool", id: "pic", icon: Image },
  { kind: "tool", id: "table", icon: Table },
  { kind: "divider" },
  { kind: "tool", id: "zoom", icon: Search },
  { kind: "tool", id: "move", icon: Move },
];

export function ToolPalette() {
  const tool = useLayoutStore((s) => s.tool);
  const setTool = useLayoutStore((s) => s.setTool);

  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center gap-[6px] border-r border-[#e4e4e4] bg-[#f4f4f4] py-[9px]">
      {ENTRIES.map((entry, i) => {
        if (entry.kind === "divider") {
          return <div key={`div-${i}`} className="my-[2px] h-px w-6 shrink-0 bg-[#e0e0e0]" />;
        }
        const { id, icon: Icon } = entry;
        const active = tool === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            title={TOOL_LABELS[id]}
            aria-label={TOOL_LABELS[id]}
            aria-pressed={active}
            data-testid={`tool-${id}`}
            className="relative flex h-[34px] w-9 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-[#e0e0e0] bg-white text-[#555]"
          >
            {Icon ? (
              <Icon size={16} strokeWidth={1.7} />
            ) : (
              <span className="font-serif text-[16px] font-bold leading-none">T</span>
            )}
            {active && (
              <div className="pointer-events-none absolute -inset-[2px] rounded-[7px] border-2 border-brand bg-[rgba(204,0,0,.05)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
