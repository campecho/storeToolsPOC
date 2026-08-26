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
 * Vertical tool rail (redesign plan §2.5): 9 single-select tools grouped by
 * dividers. Originally the figma's floating bottom-center canvas toolbar;
 * re-docked as a fixed rail between the Pages panel and the workspace by
 * request 2026-08-26 (sequence: pages · tools · workspace · inspector).
 * The active tool wears the figma's red fill; the status bar mirrors it.
 */

type RailEntry =
  | { kind: "tool"; id: EditorTool; icon: LucideIcon | null }
  | { kind: "divider" };

const ENTRIES: RailEntry[] = [
  { kind: "tool", id: "select", icon: MousePointer2 },
  { kind: "tool", id: "text", icon: null }, // serif "T" glyph, per the figma
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

export function ToolRail() {
  const tool = useLayoutStore((s) => s.tool);
  const setTool = useLayoutStore((s) => s.setTool);

  return (
    <div
      data-testid="tool-strip"
      className="flex w-[54px] shrink-0 flex-col items-center gap-[6px] overflow-y-auto border-r border-[#ececec] bg-white py-[10px]"
    >
      {ENTRIES.map((entry, i) => {
        if (entry.kind === "divider") {
          return <div key={`div-${i}`} className="my-[2px] h-px w-8 shrink-0 bg-[#e0e0e0]" />;
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
            className={`flex h-9 w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border ${
              active
                ? "border-brand bg-brand text-white"
                : "border-[#dddddd] bg-white text-[#555] hover:bg-[#f7f7f7]"
            }`}
          >
            {Icon ? (
              <Icon size={16} strokeWidth={1.7} />
            ) : (
              <span className="font-serif text-[16px] font-bold leading-none">T</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
