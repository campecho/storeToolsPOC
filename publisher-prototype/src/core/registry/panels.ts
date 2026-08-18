import type { PanelSpec } from "./types";

/**
 * Panel registry (PLAN.md §4.3): the 26 layout panels plus the 6 photo-mode
 * panels, one entry per PanelId. Panels carry no gesture clauses — their
 * option-level contracts arrive with their Phase B groups — but they classify
 * from day one: id, mode, citations, tier, and what the requirements oblige
 * them to expose.
 *
 * Tier discipline (PLAN.md §2, §3): settings surfaces for export/print are
 * SURFACE and declare a seam; interaction panels are LIVE. Where a LIVE panel
 * contains individual SURFACE operations (relink, packaging, batch checks,
 * real data-source connections), that split is recorded in `notes`, never by
 * demoting the panel's tier.
 */

export const panelRegistry: readonly PanelSpec[] = [
  // ── Layout panels (PLAN.md §4.3 list order) ────────────────────────────

  {
    id: "transform",
    label: "Transform",
    mode: "layout",
    req: ["§2.1", "§5.2", "§5.3"],
    tier: "LIVE",
    carries: [
      "X/Y position with precise numeric entry and coordinate display (§2.1).",
      "Width/height numeric entry [ASSUMPTION: §2.1 implies precision but does not name W/H fields].",
      "Rotation: numeric angle entry, rotate 90° CW/CCW, reset rotation (§5.2).",
      "Nudge increment configuration (§2.1 configurable nudge increments).",
      "Corner radius for a rounded rectangle [ASSUMPTION: §4.4 names the shape, not where its radius is edited; the geometry panel is the numeric home for the same value the shape's adjust handle sets].",
      "The remaining shape parameters, each shown only for the kind that stores it: star/polygon vertex count and inner radius, callout tail anchor, flowchart symbol, and a freeform path's closed state (§4.4) [ASSUMPTION: §4.4 names the shapes but never says where the parameters shaping them are edited after placement; they join corner radius here on the same reasoning, and the three with canvas adjust handles drive those handles' own actions rather than parallel ones].",
      "Position relative to page / margin / guide / object (§2.1).",
      "Lock position/size/rotation/content plus unlock, with visible locked state (§5.3).",
    ],
    notes: [
      "§2.1: 'Support precise X/Y positioning.'",
      "§5.2: 'Numerical angle entry.'",
      "Pure in-memory geometry — nothing here crosses a process boundary.",
    ],
  },

  {
    id: "character",
    label: "Character",
    mode: "layout",
    req: ["§3.3"],
    tier: "LIVE",
    carries: [
      "Font family (preview, search, favorites, recents), size, bold, italic, underline (weight/offset/color where feasible), strikethrough, font color, highlighting, superscript, subscript, all caps, small caps, horizontal & vertical glyph scaling (§3.3).",
      "Kerning with selectable metric/optical modes plus manual pair kerning; tracking; character spacing; word spacing; baseline shift (§3.3).",
      "Line spacing as multiple, absolute leading, or baseline-grid lock (§3.3).",
      "Full OpenType features: standard & discretionary ligatures, stylistic sets, contextual alternates, swashes, oldstyle/lining figures, tabular/proportional figures, fractions, ordinals, true small caps (§3.3).",
      "Variable fonts: named instances plus continuous axis controls — weight, width, optical size, slant (§3.3).",
      "Language assignment at character level (§3.7).",
      "Glyph browser & special-character insertion adjacency (§3.3).",
    ],
    notes: [
      "§3.3: 'Kerning, with selectable metric and optical kerning, plus manual kerning between any character pair.'",
      "§3.3: 'Support variable fonts, exposing named instances and continuous axis controls…'",
      "Rides the shaping engine (PLAN §6.4). Optical kerning may land SURFACE per the PLAN §3/§6.4 decision gate; font activation from a managed library is dev-team (OUT-adjacent).",
    ],
  },

  {
    id: "paragraph",
    label: "Paragraph",
    mode: "layout",
    req: ["§3.3"],
    tier: "LIVE",
    carries: [
      "Alignment left/right/center/justified with last-line treatment (left | center | right | force) (§3.3).",
      "First-line & hanging indents; left/right indents; space before/after (§3.3).",
      "Tabs: left/right/center/decimal stops with tab leaders (§3.3).",
      "Bullets (glyph, image bullet, size, color, indent); numbering (format, start value, separator, continuation across frames) (§3.3).",
      "Drop caps: lines dropped, characters included, character styling, gap (§3.3).",
      "Hyphenation & justification: hyphenation on/off per paragraph, min word length, min chars before/after break, max consecutive hyphens, hyphenation zone, hyphenate-capitalized toggle, min/desired/max word- and letter-spacing for justified text (§3.3).",
      "Paragraph rules above/below (weight, color, width, offset); keep options (keep with next, keep lines together, widow/orphan, break-before); paragraph shading; baseline-grid alignment; paragraph direction per language (§3.3).",
    ],
    notes: [
      "§3.3: 'Hyphenation and justification controls, including … minimum, desired, and maximum word- and letter-spacing values for justified text.'",
      "§3.3: 'Tabs, with left, right, center, and decimal tab stops and tab leaders.'",
      "The H&J composer is core (PLAN §6.4) — this panel is its parameter surface.",
    ],
  },

  {
    id: "styles",
    label: "Styles",
    mode: "layout",
    req: ["§3.6"],
    tier: "LIVE",
    carries: [
      "Paragraph styles (paragraph + character attributes) and character styles (only what they define); create from selection; apply to selection/paragraph/frame/story; edit updates all instances (§3.6).",
      "Based-on inheritance; next style; keyboard shortcuts per style; quick-apply by name; current-style display (§3.6).",
      "Override indicator with one-action clear; redefine from instance (§3.6).",
      "Duplicate/rename/delete/reorder, groups/folders; replacement prompt when deleting an in-use style; import styles from another publication or template (§3.6).",
      "Object styles plus table/cell styles where feasible — PLAN §4.3 makes object styles explicit Styles-panel scope; default style set travels with templates (§6.1).",
    ],
    notes: [
      "§3.6: 'Indicate when local formatting overrides the applied style, and allow overrides to be cleared in one action.'",
      "§3.6: 'Support based-on inheritance, so a child style tracks changes to its parent…'",
      "Style model and override derivation are schema v3 (PLAN §6.6). Style import from external files is a file-ingest SURFACE edge — recorded here, not in tier.",
    ],
  },

  {
    id: "layers",
    label: "Layers",
    mode: "layout",
    req: ["§2.2"],
    tier: "LIVE",
    carries: [
      "Create/name/delete/duplicate/reorder layers; assign & move objects between layers (§2.2).",
      "Show/hide layer; lock/unlock layer; printing/non-printing toggle for dielines, notes, approval marks (§2.2).",
      "Per-layer selection color; expand layer to inspect contained objects and their stacking; select all on layer; reorder layers to restack contents (§2.2).",
      "Layer opacity 0–100%; layer blend mode — minimum set Normal, Multiply, Screen, Overlay, Darken, Lighten, Soft Light — composited over the layer's combined contents; defined precedence with object-level opacity/blend; reset to defaults (§2.2).",
      "Scoping decision of record (PLAN §4.3): document-scoped layers with per-page visibility overrides — the panel exposes it; §2.2 says only 'as configured'.",
    ],
    notes: [
      "§2.2: 'Set an opacity value from 0 to 100 percent for an entire layer.'",
      "§2.2: 'Set whether a layer prints or is excluded from print and export'.",
      "Pure model + canvas compositing; correct flattening in print/PDF output is the dev team's export path.",
    ],
  },

  {
    id: "pages",
    label: "Pages",
    mode: "layout",
    req: ["§1.2"],
    tier: "LIVE",
    carries: [
      "Thumbnails reflecting actual design state (§1.2).",
      "Add page; insert before/after selected; delete; duplicate preserving objects, guides, margins, backgrounds, numbering, and master associations (§1.2).",
      "Drag-and-drop reorder; per-page different layouts; mixed page sizes visible (§1.2, §1.4).",
      "Facing-page/spread display 'as spreads … not as unrelated single pages' with spine indicated; spread-pairing shift preview when adding/removing pages (§1.2).",
      "Per-page master shown (§1.3).",
    ],
    notes: [
      "§1.2: 'Reorder pages through drag-and-drop or command controls.'",
      "§1.2: 'Represent spreads as spreads in the page navigation pane, not as unrelated single pages.'",
    ],
  },

  {
    id: "master-pages",
    label: "Master pages",
    mode: "layout",
    req: ["§1.3"],
    tier: "LIVE",
    carries: [
      "Create one or more masters; apply to selected pages; different masters per section (§1.3, §1.5).",
      "Edit once, update all dependent pages; page-specific overrides (§1.3).",
      "Clear visual distinction of master elements vs page elements; show which master applies to each page (§1.3).",
      "Master content: headers, footers, logos, backgrounds, guides, page numbers, watermarks (§1.3).",
    ],
    notes: [
      "§1.3: 'Allow the user to edit a master page once and update all dependent pages.'",
      "§1.3: 'Clearly distinguish master-page elements from normal page elements.'",
    ],
  },

  {
    id: "sections-numbering",
    label: "Sections & numbering",
    mode: "layout",
    req: ["§1.5"],
    tier: "LIVE",
    carries: [
      "Define sections with start page; restart numbering at boundaries; start value other than 1 (§1.5).",
      "Prefixes such as A-1, 2-14, App-3; formats — Arabic, upper/lower Roman, upper/lower letters (§1.5).",
      "Insert automatic page-number fields on pages and masters; auto-update on insert/delete/duplicate/reorder (§1.5).",
      "Section name/label; boundaries plus effective page number shown in the navigation pane (§1.5).",
      "Page ranges addressable by absolute position or section label — consumed by print/export dialogs (§1.5).",
      "Per-section master assignment; renumbering previewable before apply (§1.5).",
    ],
    notes: [
      "§1.5: 'Allow page numbering to restart at any section boundary.'",
      "§1.5: 'Support section-specific numbering prefixes such as A-1, 2-14, or App-3.'",
      "Numbering resolves in the document model; identical resolution in output is the dev team's render path.",
    ],
  },

  {
    id: "document-setup",
    label: "Document setup",
    mode: "layout",
    req: ["§1.4"],
    tier: "LIVE",
    carries: [
      "Arbitrary page width/height; units inches/cm/mm/pixels/points; standard Staples product/print sizes; save custom page-size presets (§1.4).",
      "Change size after creation with layout-impact warning; smart reflow as a nice-to-have (§1.4).",
      "Page rotation 90/180° for authoring, independent of output orientation; landscape and portrait mixed in one document (§1.4).",
      "Trim, bleed, and slug as distinct first-class properties with visually distinct boundary indicators (§1.4).",
      "Slug include/exclude at export set here independently of artwork — the export act itself is a seam (§1.4).",
      "Per-page/per-spread setup values in mixed-size documents (§1.4); baseline-grid settings (PLAN §6.6 delta).",
    ],
    notes: [
      "§1.4: 'Define page size (trim), bleed, and slug as distinct, first-class document properties.'",
      "§1.4: 'Slug areas must never appear in customer-facing output unless explicitly requested.'",
      "Settings plus on-canvas boundary display are LIVE; Staples product API sizing (§1.1) and export inclusion (§11.1) are dev-team seams.",
    ],
  },

  {
    id: "guides-grid",
    label: "Guides & grid",
    mode: "layout",
    req: ["§2.4"],
    tier: "LIVE",
    carries: [
      "Margin guides; ruler guides; baseline guides; grid display (§2.4).",
      "Snap-to-grid toggle; snap-to-guides toggle (§2.4).",
      "Custom guide placement; guide locking; show/hide controls; guide color/visibility settings (§2.4).",
      "Per-page guides (PLAN §6.6).",
    ],
    notes: [
      "§2.4: 'Snap behavior should be optional and easy to toggle.'",
      "§2.4: 'Baseline grids should support text-heavy publications like newsletters and directories.'",
    ],
  },

  {
    id: "align-distribute",
    label: "Align & distribute",
    mode: "layout",
    req: ["§2.3"],
    tier: "LIVE",
    carries: [
      "Align left/right/top/bottom; center horizontally/vertically (§2.3).",
      "Distribute horizontally/vertically, preserving object size while adjusting position (§2.3).",
      "Reference: page / margin / selected object / guides (§2.3).",
      "Works on mixed object types; alignment preview is a stated consideration (§2.3).",
    ],
    notes: [
      "§2.3: 'Distribution should preserve object size while adjusting position.'",
      "§2.3: 'Align to selected object.'",
    ],
  },

  {
    id: "text-wrap",
    label: "Text wrap",
    mode: "layout",
    req: ["§3.4"],
    tier: "LIVE",
    carries: [
      "Wrap modes: none / square / tight / through / top-and-bottom (§3.4).",
      "Custom wrap boundaries with editable boundary geometry (§3.4).",
      "Wrap distance controls; wrap preview; clear indication of active wrap (§3.4).",
    ],
    notes: [
      "§3.4: 'No wrap. / Square wrap. / Tight wrap. / Through wrap. / Top-and-bottom wrap.'",
      "§3.4: 'Wrap distance controls.'",
      "Consumed by the line breaker as exclusion geometry — wrap belongs to the text tranche (PLAN §6.6).",
    ],
  },

  {
    id: "text-fit-overflow",
    label: "Text fit & overflow",
    mode: "layout",
    req: ["§3.5"],
    tier: "LIVE",
    carries: [
      "Overflow detection with visible indicators (§3.5).",
      "Offer auto-shrink text; offer expand text box; offer link overflow to another box — hands off to the link tool (§3.5, §3.2).",
      "User control preserved: auto-corrections can be disabled (§3.5).",
      "Overflow warning before print/export — delivered via the design checker (§3.5, §10.1).",
    ],
    notes: [
      "§3.5: 'Offer to automatically shrink text.'",
      "§3.5: 'Warn before print or export if overflow remains.'",
    ],
  },

  {
    id: "color-swatches",
    label: "Color & swatches",
    mode: "layout",
    req: ["§9.4"],
    tier: "LIVE",
    carries: [
      "RGB color selection; CMYK-aware workflow — swatch space rgb | cmyk | spot (§9.4; PLAN §6.6).",
      "Spot colors with names; custom palettes; theme colors (§9.4, §6.3).",
      "Color conversion warnings, fed to the design checker (§9.4, §10.1).",
      "Outline detail for lines and arrows: dash pattern, start/end head shape, and head size (§4.4) [ASSUMPTION: §9.4 scopes this panel to color and names no home for dash or arrowheads; they sit under Outline as the rest of what describes a stroke, beside its color and width, rather than in a panel of their own].",
      "Schema: doc.swatches: [{id, name, space, values, spotName?}] (PLAN §6.6).",
    ],
    notes: [
      "§9.4: 'Spot color workflows where applicable.'",
      "§9.4: 'Color conversion warnings.'",
      "Swatch model and on-screen use are LIVE; ICC/CMYK transforms and true output color are dev-team seams (PLAN §2, §6.5).",
    ],
  },

  {
    id: "effects",
    label: "Effects",
    mode: "layout",
    req: ["§4.3"],
    tier: "LIVE",
    carries: [
      "Shadows; reflections; bevels; glows; soft edges (§4.3).",
      "Transparency effects; picture borders; shape effects (§4.3).",
      "Effect removal / reset (§4.3).",
      "Schema: effects: { shadow?, glow?, softEdge?, bevel?, reflection? } plus object-level opacity/blend (PLAN §6.6).",
    ],
    notes: [
      "§4.3: 'Shadows. / Reflections. / Bevels. / Glows. / Soft edges.'",
      "§4.3: 'Effect removal or reset.'",
      "Rendered on canvas; predictable PDF/raster export is the dev team's path.",
    ],
  },

  {
    id: "image-adjust",
    label: "Image adjust",
    mode: "layout",
    req: ["§4.2"],
    tier: "LIVE",
    carries: [
      "In-frame crop/pan/zoom; brightness; contrast; recolor; transparency; reset to original (§4.2).",
      "PLAN §6.5 engine set: exposure, highlights/shadows, saturation, temperature, auto-enhance, sharpen.",
      "All edits are non-destructive PhotoOp[] on the frame; 'Edit photo' entry point to photo mode (PLAN §6.5 Shape 1).",
      "Ranges/defaults [ASSUMPTION: none stated in the doc; seeded from POC adjust-math, flagged for SME].",
    ],
    notes: [
      "§4.2: 'Perform basic photo and image adjustments without leaving the publishing tool.'",
      "§4.2: 'Reset image to original.'",
      "Explicitly 'Image adjust (LIVE, §6.5)' in PLAN §4.3; full-resolution replay at export is a dev-team seam (PLAN §6.5).",
    ],
  },

  {
    id: "resource-manager",
    label: "Resource manager",
    mode: "layout",
    req: ["§4.5"],
    tier: "LIVE",
    carries: [
      "Asset list columns: file name, type, source path, pages used with placement count, link status (current / modified / missing / embedded), effective resolution (PPI at placed size, recalculated on scale), color mode & profile, file size, transparency presence, scale % (§4.5).",
      "Filter/sort by status/type/resolution/page/color mode; select an entry and highlight its placement in the layout (§4.5).",
      "Relink — single, and folder-bulk with preview before commit; update modified (single/all); replace preserving frame/crop/scale/effects; convert linked↔embedded (single/bulk) (§4.5).",
      "Reveal in OS; open in external editor and pick up the change (§4.5).",
      "Collect for output: package file + assets + licensable fonts, manifest report, licensing failures reported (§4.5).",
      "Feeds the design checker with missing/modified/low-res/color-mode issues (§10.1); font list from doc.fonts including embedding permissions (PLAN §6.4).",
    ],
    notes: [
      "§4.5: 'Link status: current, modified (source changed since placement), missing (source not found), or embedded.'",
      "§4.5: 'Provide a collect for output (package) operation…'",
      "Tier split per PLAN §7 ('link status LIVE; relink/package SURFACE'): status, inventory, and placement navigation are LIVE; relink, update-from-disk, reveal-in-OS, external-edit round-trip, and collect-for-output are individual SURFACE operations (disk/storage seams) — recorded here, not by demoting the panel.",
    ],
  },

  {
    id: "design-checker",
    label: "Design checker",
    mode: "layout",
    req: ["§10.1"],
    tier: "LIVE",
    carries: [
      "Continuous background validation; persistent status indicator (issue count + highest severity); short-interval updates; auto re-validate after fix; full pass before print/export with block/warn by severity; pause plus on-demand full check (§10.1).",
      "Detection scope: missing fonts, substitutions, non-embeddable fonts, low-res images (at placed scale vs output threshold), excess resolution, missing/modified links, text overflow including end of chain, objects outside printable area, page/pasteboard straddle, safe-zone proximity, bleed shortfall, bleed/slug config, RGB-in-CMYK per object, spot-color misuse/duplicates, out-of-gamut, rich-black/total-ink, small multicolor text, hairlines, risky transparency/blends, artifact-prone effects, empty frames, booklet-incompatible page count, Staples-product mismatch (§10.1).",
      "Presentation: plain language, severities error/warning/informational, exact location (page/layer/object), click-to-navigate, click-to-fix with preview and undo, batch fix, ignore list (retained), recheck, exportable preflight report (§10.1).",
      "Output-intent profiles: desktop / in-store / commercial / PDF / image / screen; Staples-preconfigured, centrally lockable, thresholds from product API, profile recorded (§10.1).",
    ],
    notes: [
      "§10.1: 'Run validation continuously in the background while the publication is being edited, not only on demand or at export.'",
      "§10.1: 'Click-to-fix for issues with a safe, deterministic remedy…'",
      "'Live design-checker analysis over the model' is in-scope (PLAN §2). Cadence default: cheap rules run live-incremental; expensive rules run as SURFACE batch passes (PLAN §9) — that split lives here, not in tier.",
      "Staples product API thresholds, central profile distribution, and report file output are SURFACE edges.",
    ],
  },

  {
    id: "data-merge",
    label: "Data merge",
    mode: "layout",
    req: ["§7.1"],
    tier: "LIVE",
    carries: [
      "Data sources: Excel, CSV, Outlook contacts, Access, other structured sources (§7.1).",
      "Merge fields; address blocks; greeting lines; field formatting (§7.1).",
      "Recipient filtering & sorting; preview merged records (§7.1).",
      "Generate merged publications; print merged output; PDF export of merge (§7.1).",
      "Invalid or missing fields flagged (§7.1).",
    ],
    notes: [
      "§7.1: 'Preview merged records.'",
      "§7.1: 'Invalid or missing fields should be flagged.'",
      "LIVE covers field placement, mapping, filtering, and record preview over sample sources (PLAN §7 'data merge with record preview + sample sources'); real data-source connection, batch generation, and merged print/PDF output are individual SURFACE operations (process boundaries) — recorded here, not in tier.",
    ],
  },

  {
    id: "templates",
    label: "Templates",
    mode: "layout",
    req: ["§6.1"],
    tier: "LIVE",
    carries: [
      "Built-in templates; category organization; preview; search (§6.1).",
      "Placeholder text replacement; placeholder image replacement; color/font changes (§6.1).",
      "Save custom template; reuse across publications (§6.1).",
      "Templates carry style sets (§3.6).",
    ],
    notes: [
      "§6.1: 'Templates should be editable, not static images.'",
      "§6.1: 'Enterprise environments may need centrally managed template libraries.'",
      "LIVE covers gallery, insert, and placeholder editing over seeded fixture templates; save-as-template and centrally managed libraries are storage SURFACE operations (dev team, §13.2) — recorded here, not in tier.",
    ],
  },

  {
    id: "building-blocks",
    label: "Building blocks",
    mode: "layout",
    req: ["§6.2"],
    tier: "LIVE",
    carries: [
      "Gallery of reusable components: headers, footers, sidebars, pull quotes, advertisements, calendars, borders, page accents, contact blocks, logo blocks, coupon blocks (§6.2).",
      "Save custom blocks; blocks remain fully editable after insertion (§6.2).",
      "Theme integration (§6.2, §6.3).",
    ],
    notes: [
      "§6.2: 'Provide a gallery of building blocks.'",
      "§6.2: 'Inserted blocks should remain fully editable.'",
      "The doc marks Building Blocks '(phase 2)'.",
      "LIVE covers gallery + insert (in-memory); saving/sharing custom blocks is a storage SURFACE operation — recorded here, not in tier.",
    ],
  },

  {
    id: "themes",
    label: "Themes",
    mode: "layout",
    req: ["§6.3"],
    tier: "LIVE",
    carries: [
      "Theme colors; theme fonts; theme effects (§6.3).",
      "Global updates to existing content; theme preview (§6.3).",
      "Custom theme creation; apply to selection or whole publication; user overrides of theme attributes (§6.3).",
    ],
    notes: [
      "§6.3: 'Global updates to existing content.'",
      "§6.3: 'Theme changes should not break custom formatting unexpectedly.'",
      "The doc marks Design Themes '(phase 2)'. Pure model restyling is LIVE; centrally approved brand themes are an enterprise/storage seam.",
    ],
  },

  {
    id: "language-proofing",
    label: "Language & proofing",
    mode: "layout",
    req: ["§3.7"],
    tier: "LIVE",
    carries: [
      "Language at document/style/paragraph/character level (§3.7).",
      "As-you-type spell indicators plus an on-demand pass across all containers — boxes, tables, linked frames, masters, overflow (§3.7).",
      "Suggestions UI; user dictionary add/edit/remove (interaction); grammar/style hints, dismissable (§3.7).",
      "Per-language hyphenation plus user exception list; discretionary hyphens and no-break (§3.7).",
      "Missing-font guided substitution dialog: font, usage locations, proposed replacement; saved/batch choices; persistent flags until resolved (§3.7).",
      "Autocorrect with configurable entries plus disable (§3.7).",
    ],
    notes: [
      "§3.7: 'Provide spell check, both as-you-type with visible indicators and as an on-demand pass'.",
      "PLAN §2: 'Spell-check interaction (marks, suggestions, panel) | Dictionaries and proofing services (§3.7)' — the interaction is LIVE, dictionaries and proofing services are dev-team.",
      "The hyphenation engine itself is LIVE — Liang patterns in the composer (PLAN §6.4). Shared/centrally-managed dictionaries are an enterprise seam.",
    ],
  },

  {
    id: "table-properties",
    label: "Table properties",
    mode: "layout",
    req: ["§8.1"],
    tier: "LIVE",
    carries: [
      "Row/column count at insert; add/delete rows; add/delete columns; resize rows/columns (§8.1).",
      "Merge cells; split cells (§8.1).",
      "Borders; cell shading; text formatting inside cells — cells are text frames, reusing the text engine (§8.1; PLAN §6.6).",
      "Import tabular data where feasible; theme integration (§8.1).",
    ],
    notes: [
      "§8.1: 'Merge cells. / Split cells.'",
      "§8.1: 'Tables must behave predictably inside a fixed-layout publication.'",
      "Flagged the second-hardest build item after text (PLAN §6.6). Tabular-data import is a file-ingest SURFACE edge — recorded here, not in tier.",
    ],
  },

  {
    id: "find-replace",
    label: "Find & replace",
    mode: "layout",
    req: ["§12.3"],
    tier: "LIVE",
    carries: [
      "Search/replace publication-wide; scope to selection or selected pages; whole word; case-sensitive (§12.3).",
      "Formatting-aware search; style-aware find & replace — find by style, replace style with style; format-only replace, e.g. font A → font B everywhere (§12.3).",
      "Pattern/regex search as an advanced mode with progressive disclosure (§12.3).",
      "Special characters: tabs, paragraph marks, line breaks, non-breaking spaces; no-match reporting (§12.3).",
      "Searches boxes, tables, masters, linked frames, and hidden overflow (§12.3).",
    ],
    notes: [
      "§12.3: 'Support style-aware find and replace…'",
      "§12.3: 'Support pattern-based search using regular expressions or an equivalent wildcard syntax…'",
      "Operates on the in-memory model via the text engine's highlight geometry (PLAN §6.4 consumers).",
    ],
  },

  {
    id: "history",
    label: "History",
    mode: "layout",
    req: ["§12.1"],
    tier: "LIVE",
    carries: [
      "Multi-level undo; multi-level redo; availability indicators (§12.1).",
      "Covers object, text, image, page, and formatting edits (§12.1).",
      "History preserved during the session; large actions such as template changes are undoable (§12.1).",
    ],
    notes: [
      "§12.1: 'Support multi-level undo. / Support multi-level redo.'",
      "§12.1: 'The tool should avoid clearing history unexpectedly.'",
      "Semantics split by mode: layout history is a bounded snapshot stack taking one entry per completed gesture (PLAN §6.3), while photo-history is a cursor over the PhotoOp[] recipe (PLAN §6.5) — the two panels share §12.1's obligations, not an implementation.",
    ],
  },

  // ── Photo-mode panels (PLAN.md §4.3) ───────────────────────────────────

  {
    id: "photo-adjustments",
    label: "Adjustments",
    mode: "photo",
    req: ["§4.2"],
    tier: "LIVE",
    carries: [
      "Brightness; contrast; recolor; transparency; reset to original (§4.2).",
      "PLAN §6.5 engine set: exposure, highlights/shadows, saturation, temperature, auto-enhance, sharpen.",
      "Before/after compare (PLAN §6.5 photo-mode addition).",
      "Ranges/defaults [ASSUMPTION: none stated in the doc; seeded from POC adjust-math, flagged for SME].",
    ],
    notes: [
      "§4.2: 'Brightness adjustment. / Contrast adjustment.'",
      "PLAN §6.5: 'large canvas, before/after compare, named history steps'.",
      "Superset surface of the in-line Image adjust panel — same recipe, same store; every commit appends one PhotoOp (PLAN §6.5).",
    ],
  },

  {
    id: "photo-crop-geometry",
    label: "Crop & geometry",
    mode: "photo",
    req: ["§4.2"],
    tier: "LIVE",
    carries: [
      "Crop with precise controls (§4.2 consideration); resize to target dimensions (§4.2).",
      "Rotate — free plus 90° steps (§4.2); flip horizontal; flip vertical (§4.2).",
      "Straighten angle [ASSUMPTION: not in the doc — §4.2 has only rotate/flip; Publisher/photo-app parity].",
      "Aspect presets [ASSUMPTION].",
    ],
    notes: [
      "§4.2: 'Crop and resize controls should be precise.'",
      "§4.2: 'Flip horizontal. / Flip vertical.'",
      "Numeric/preset companion to the crop & straighten tool — both edit the same crop/geometry ops in the recipe (PLAN §6.5).",
    ],
  },

  {
    id: "photo-history",
    label: "History",
    mode: "photo",
    req: ["§12.1"],
    tier: "LIVE",
    carries: [
      "Named history steps (PLAN §6.5); the step list is the ordered PhotoOp[] recipe.",
      "Multi-level undo/redo (§12.1).",
      "Revert to original, free by construction (PLAN §6.5 'nothing is ever baked').",
      "Step selection for before/after compare [ASSUMPTION: click-a-step behavior unstated].",
    ],
    notes: [
      "PLAN §6.5: 'A typed, ordered, non-destructive list of image operations … with reset-to-original free by construction'.",
      "§12.1: 'Preserve undo history during active editing sessions.'",
      "Photo-history is a recipe cursor, not the layout side's bounded snapshot stack (PLAN §6.3/§6.5) — same §12.1 obligations, different mechanism.",
    ],
  },

  {
    id: "photo-overlays",
    label: "Overlays",
    mode: "photo",
    req: [],
    tier: "LIVE",
    carries: [
      "Overlay list: text and image overlay ops from the recipe (PLAN §6.5).",
      "Per-overlay position/scale/rotation [ASSUMPTION]; opacity [ASSUMPTION].",
      "Edit/remove overlays; z-order among overlays [ASSUMPTION].",
    ],
    notes: [
      "PLAN §6.5: '…recolor/tint, overlays, and mask-scoped ops'.",
      "Thin coverage: the entire overlay capability rests on that one word in PLAN §6.5's recipe vocabulary — the requirements doc never mentions overlays, so req is empty and the whole panel is Publisher/photo-app parity [ASSUMPTION].",
    ],
  },

  {
    id: "photo-fix-for-print",
    label: "Fix for print",
    mode: "photo",
    req: ["§10.1", "§11.2", "§9.4"],
    tier: "SURFACE",
    carries: [
      "Effective-resolution readout vs the output-intent threshold (§10.1 low-res detection; §4.5 effective PPI).",
      "Target output intent / Staples product selection (§10.1 profiles).",
      "Upscale action — model service (PLAN §6.5 seam list).",
      "Color-mode/profile disposition for print (§9.4, §10.1 RGB-in-CMYK).",
      "Exact control set [ASSUMPTION: assembled surface — see notes]; per PLAN §3 the SURFACE panel exposes the full option set and defaults with a written contract.",
    ],
    seam: {
      interface: "upscale(image, targetPpi) → image",
      payload:
        "The full-resolution source image plus the target effective PPI, derived from the selected output intent's low-resolution threshold (§10.1 — thresholds come from the Staples print product API).",
      returns:
        "An upscaled raster meeting the target resolution, stored in the recipe as an explicit patch op so reset-to-original stays free (PLAN §6.5 — nothing is ever baked).",
    },
    notes: [
      "PLAN §4.3: 'Fix for print (settings SURFACE) · Export (settings SURFACE)'.",
      "§10.1: 'Low-resolution images, evaluated at the placed and scaled size against the threshold for the intended output.'",
      "'Fix for print' is not a doc heading — the panel is assembled from §10.1 + §11.2 + §9.4 fragments plus PLAN §6.5's seam list; no single requirements heading owns it.",
      "Seam family: upscale is the model-service seam declared above; ICC/CMYK transforms and print-product thresholds are separate dev-team seams (PLAN §2, §6.5).",
      "Thin coverage — flagged for SME review.",
    ],
  },

  {
    id: "photo-export",
    label: "Export",
    mode: "photo",
    req: ["§11.2"],
    tier: "SURFACE",
    carries: [
      "Format: PNG / JPG / TIFF (§11.2).",
      "Resolution control (§11.2).",
      "Transparency control for formats that support it (§11.2).",
      "Color profile handling where applicable (§11.2).",
      "Quality defaults appropriate to intended use (§11.2).",
    ],
    seam: {
      interface: "exportImage(original, recipe, settings) → file",
      payload:
        "The original image reference, the full ordered PhotoOp[] recipe, and the chosen settings: format (png | jpg | tiff), output resolution, transparency on/off for supporting formats, color profile handling, and quality.",
      returns:
        "Encoded image file bytes produced by a full-resolution recipe replay — the editor itself only ever renders proxies (PLAN §6.5).",
    },
    notes: [
      "§11.2: 'Resolution control. / Transparency control for formats that support it.'",
      "PLAN §6.5: 'full-resolution recipe replay at export · HEIC and camera-format decode · ICC/CMYK transforms…' — all process boundaries behind this settings surface (PLAN §2/§6.5).",
      "PLAN §4.3 names this panel 'Export (settings SURFACE)' — the settings live here; the file bytes are the dev team's side of the seam.",
    ],
  },
];
