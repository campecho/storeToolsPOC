import { useLayoutStore, type TextPropsPatch } from "@/store";
import type { FrameObject } from "@/schema";
import { TEXT_STYLES, type TextStyleKey } from "@/lib/layout/text";

/**
 * The text frame the typography controls operate on (plan L5): the frame
 * being edited if a session is open, else the selected frame when it's a
 * text frame. All three surfaces — Home band, Text band, Text inspector
 * tab — resolve their target and apply edits through this hook, so they
 * can't drift apart.
 */
export function useTextTarget(): {
  target: (FrameObject & { text: NonNullable<FrameObject["text"]> }) | undefined;
  apply: (patch: TextPropsPatch) => void;
  applyStyle: (key: TextStyleKey) => void;
} {
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const editingTextId = useLayoutStore((s) => s.editingTextId);
  const setTextProps = useLayoutStore((s) => s.setTextProps);

  const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
  const targetId = editingTextId ?? (selectedIds.length === 1 ? selectedIds[0] : undefined);
  const found = targetId ? page.objects.find((o) => o.id === targetId) : undefined;
  const target =
    found && found.type === "text" && found.text
      ? (found as FrameObject & { text: NonNullable<FrameObject["text"]> })
      : undefined;

  return {
    target,
    apply: (patch) => {
      if (target) setTextProps(target.id, patch);
    },
    applyStyle: (key) => {
      if (target) setTextProps(target.id, TEXT_STYLES[key].props);
    },
  };
}
