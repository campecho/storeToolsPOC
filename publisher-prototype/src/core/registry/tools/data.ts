import type { ToolContract } from "../types";

/**
 * Data tools (PLAN.md §4.1 #21–22). Contracts only — canvas behavior arrives
 * with the Tables & data (merge field) and Productivity (building blocks)
 * Phase B groups.
 */

export const mergeFieldTool: ToolContract = {
  id: "merge-field",
  label: "Merge field",
  mode: "layout",
  group: "data",
  shortcut: "M",
  req: ["§7.1"],
  tier: "LIVE",
  cursor: "text",
  creates: "mergeField",
  hitTest: {
    tolerancePx: 4,
    unfilledInterior: "selects",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "merge-field.click.inserts-field",
      trigger: "click in text or on canvas",
      behavior:
        "Inserts the selected merge field at that point — inline in the text when clicking inside a text frame, as a standalone field frame when clicking empty canvas (§7.1 merge fields).",
      action: "mergeField/insertedCommitted",
    },
    {
      id: "merge-field.drag-from-panel.inserts-field",
      trigger: "drag field from Data merge panel onto canvas",
      behavior: "Inserts the dragged field at the drop point; one action commits on release.",
      action: "mergeField/insertedCommitted",
    },
    {
      id: "merge-field.toggle-preview.shows-record",
      trigger: "toggle preview control",
      behavior:
        "Switches placed fields between placeholder display and live data from the current record (§7.1 preview merged records).",
      action: "mergeField/previewToggledCommitted",
    },
    {
      id: "merge-field.esc.cancels-insert",
      trigger: "Esc with insert pending",
      behavior: "Discards the pending field insert; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "field",
      label: "Field",
      default: "firstName",
      values: ["firstName", "lastName", "address", "city", "state", "zip"],
    },
    {
      kind: "enum",
      id: "insertKind",
      label: "Insert as",
      default: "field",
      values: ["field", "addressBlock", "greetingLine"],
    },
    {
      kind: "enum",
      id: "format",
      label: "Format",
      default: "asEntered",
      values: ["asEntered", "uppercase", "lowercase", "titleCase"],
    },
  ],
  panels: ["data-merge"],
  undo: "per-gesture",
  notes: [
    "'Invalid or missing fields should be flagged.' (§7.1) — flagging renders wherever the field renders; the flag state derives from the bound data source, not from this tool.",
    "merge-field.toggle-preview.shows-record commits view state, not a document mutation — the Committed suffix marks the gesture's single action (PLAN.md §6.3); history membership is the slice's decision, and this toggle never enters document history.",
    "Interiors hit (unfilledInterior 'selects') so a click inside an unfilled text frame can place an inline field — the edit-capable reading of PLAN.md §5's unfilled-interior rule.",
    "The field option's values are sample-source columns: real values come from the bound data source (§7.1; PLAN.md §7 'data merge with record preview + sample sources'), which a closed enum cannot enumerate — the listed columns are the seeded sample fixture.",
    "ASSUMPTION: drag-from-panel insertion and Esc cancel are Publisher-parity fillers — §7.1 states the capabilities, not the bindings.",
    "ASSUMPTION: the format option's value set is a working guess — §7.1 requires 'Field formatting' but names no formats; 4px tolerance matches the select tool's working guess.",
  ],
};

export const buildingBlockTool: ToolContract = {
  id: "building-block",
  label: "Building block",
  mode: "layout",
  group: "data",
  shortcut: "Q",
  req: ["§6.2"],
  tier: "LIVE",
  cursor: "copy",
  creates: "buildingBlock",
  hitTest: {
    tolerancePx: 0,
    unfilledInterior: "passesThrough",
    lockedObjects: "skips",
  },
  gestures: [
    {
      id: "building-block.click.places-block",
      trigger: "click on canvas with gallery item armed",
      behavior:
        "Inserts the selected block's constituent objects at the placement point (§6.2 gallery of building blocks); the inserted group is fully editable afterward.",
      action: "buildingBlock/placedCommitted",
    },
    {
      id: "building-block.drag-from-gallery.places-block",
      trigger: "drag item from gallery onto canvas",
      behavior: "Inserts the block at the drop point; one action commits on release.",
      action: "buildingBlock/placedCommitted",
    },
    {
      id: "building-block.save-selection.adds-to-gallery",
      trigger: "save selection as block (gallery command)",
      behavior:
        "Adds the current selection to the gallery as a custom building block (§6.2 allow custom building blocks to be saved).",
      action: "buildingBlock/savedCommitted",
    },
    {
      id: "building-block.esc.cancels-placement",
      trigger: "Esc with placement pending",
      behavior: "Discards the armed gallery item; nothing commits.",
      action: "gesture/cancelled",
    },
  ],
  options: [
    {
      kind: "enum",
      id: "category",
      label: "Category",
      default: "headers",
      values: [
        "headers",
        "footers",
        "sidebars",
        "pullQuotes",
        "ads",
        "calendars",
        "borders",
        "accents",
        "contact",
        "logo",
        "coupon",
      ],
    },
  ],
  panels: ["building-blocks", "themes"],
  undo: "per-gesture",
  notes: [
    "The doc marks §6.2 '(phase 2)' — the contract classifies from day one; build order is the schedule's concern.",
    "'Allow building blocks to be edited after insertion.' (§6.2) — inserted blocks are ordinary objects (a group of frames/shapes) handled by the select tool; this tool does no object hit-testing during placement, hence tolerancePx 0.",
    "'Custom building blocks should be shareable where appropriate.' (§6.2) — sharing and persistent storage of custom blocks are the Building blocks panel's SURFACE edge; building-block.save-selection.adds-to-gallery covers only the in-memory gallery add.",
    "ASSUMPTION: click-to-place and drag-from-gallery gestures, Esc cancel, and the category default are Publisher-parity fillers — §6.2 states the gallery and its categories, not the placement bindings.",
  ],
};

export const dataTools: readonly ToolContract[] = [mergeFieldTool, buildingBlockTool];
