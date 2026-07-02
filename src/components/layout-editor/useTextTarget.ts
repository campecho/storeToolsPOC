import { surfaceObjects, useLayoutStore, type TextPropsPatch } from "@/store";
import type { FrameObject } from "@/schema";
import { TEXT_STYLES, type TextStyleKey } from "@/lib/layout/text";

/**
 * The text frame the typography controls operate on (plan L5): the frame
 * being edited if a session is open, else the selected frame when it's a
 * text frame. All three surfaces — Home band, Text band, Text inspector
 * tab — resolve their target and apply edits through this hook, so they
 * can't drift apart. Targets live on the editing surface — active page or
 * the master being edited (L6).
 */
export function useTextTarget(): {
  target: (FrameObject & { text: NonNullable<FrameObject["text"]> }) | undefined;
  apply: (patch: TextPropsPatch) => void;
  applyStyle: (key: TextStyleKey) => void;
} {
  const objects = useLayoutStore(surfaceObjects);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const editingTextId = useLayoutStore((s) => s.editingTextId);
  const setTextProps = useLayoutStore((s) => s.setTextProps);

  const targetId = editingTextId ?? (selectedIds.length === 1 ? selectedIds[0] : undefined);
  const found = targetId ? objects.find((o) => o.id === targetId) : undefined;
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
