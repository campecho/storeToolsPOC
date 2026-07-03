import type { LayoutDocument, MasterPage } from "@/schema";
import { MiniRender } from "./PageThumb";

/**
 * Master-pages view tile (plan L6): the master's own mini-render, the wire's
 * caption grammar ("A · applied" / "B · blank"), and the two live affordances
 * — click the tile to edit the master on the canvas, "Apply to this page" to
 * bind it to the active page. Blank masters keep the wire's dashed inset so
 * an empty tile still reads as a master, not a missing render.
 */
export function MasterThumb({
  doc,
  master,
  applied,
  editing,
  onEdit,
  onApply,
}: {
  doc: LayoutDocument;
  master: MasterPage;
  /** The active page uses this master. */
  applied: boolean;
  /** The canvas is editing this master right now. */
  editing: boolean;
  onEdit: () => void;
  onApply: () => void;
}) {
  const key = master.label.toLowerCase();
  // brand border marks the master in focus: the one being edited, else the applied one
  const highlight = editing || applied;

  return (
    <div className="flex flex-col items-center gap-[5px]">
      <button
        type="button"
        data-testid={`master-thumb-${key}`}
        aria-label={`Edit master ${master.label}`}
        title={`Edit master ${master.label}`}
        onClick={onEdit}
        className={`relative cursor-pointer overflow-hidden rounded-[3px] bg-white ${
          highlight
            ? "border-[1.5px] border-brand shadow-[0_1px_3px_rgba(0,0,0,.14)]"
            : "border border-[#dcdcdc] hover:border-[#b8b8b8]"
        }`}
      >
        <MiniRender size={doc.size} objects={master.objects} />
        {master.objects.length === 0 && (
          <div className="pointer-events-none absolute inset-2 border border-dashed border-[#dcdcdc]" />
        )}
      </button>
      <div className={`text-[11px] ${applied ? "text-[#666]" : "text-[#999]"}`}>
        {master.label}
        {applied ? " · applied" : master.objects.length === 0 ? " · blank" : ""}
      </div>
      {!applied && (
        <button
          type="button"
          data-testid={`master-apply-${key}`}
          onClick={onApply}
          className="-mt-[3px] cursor-pointer text-[10px] text-[#a0a0a0] hover:text-brand"
        >
          Apply to this page
        </button>
      )}
    </div>
  );
}
