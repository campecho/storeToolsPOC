import { Field, SectionLabel } from "./Field";

/**
 * Properties inspector tab (wire region 7): the no-selection empty state over
 * a disabled Transform section. Static in L2 — the tab populates against a
 * real selection (X/Y/W/H round-trip plus Fill/Stroke rows) in L4.
 */
export function PropertiesTab() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-dashed border-[#d8d8d8] bg-[#fafafa] p-4 text-center">
        <div className="text-[12px] text-[#888]">Nothing selected</div>
        <div className="mt-1 text-[11px] text-[#aaa]">
          Select an object on the page to edit its position, size, fill, and stroke.
        </div>
      </div>

      <div className="opacity-50">
        <SectionLabel>Transform</SectionLabel>
        <div className="mb-2 flex gap-2">
          <Field label="X" value="— in" muted />
          <Field label="Y" value="— in" muted />
        </div>
        <div className="flex gap-2">
          <Field label="W" value="— in" muted />
          <Field label="H" value="— in" muted />
        </div>
      </div>
    </div>
  );
}
