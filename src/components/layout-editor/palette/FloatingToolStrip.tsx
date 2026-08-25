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
 * Floating tool strip (redesign plan §2.5 — figma's bottom-center canvas
 * toolbar, replacing the old left tool palette in Phase 3): 9 single-select
 * tools in a floating white card, grouped by dividers. The active tool wears
 * the figma's red fill; the status bar mirrors it.
 */

type StripEntry =
  | { kind: "tool"; id: EditorTool; icon: LucideIcon | null }
  | { kind: "divider" };

const ENTRIES: StripEntry[] = [
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

export function FloatingToolStrip() {
  const tool = useLayoutStore((s) => s.tool);
  const setTool = useLayoutStore((s) => s.setTool);

  return (
    <div
      data-testid="tool-strip"
      className="absolute bottom-[14px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-[6px] rounded-[7px] border border-[#e4e4e4] bg-white px-[10px] py-[7px] shadow-[0_2px_10px_rgba(0,0,0,.13)]"
    >
      {ENTRIES.map((entry, i) => {
        if (entry.kind === "divider") {
          return <div key={`div-${i}`} className="mx-[2px] h-8 w-px shrink-0 bg-[#e0e0e0]" />;
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
