# Microsoft Publisher Feature Requirements Specification

## Purpose

This document provides a detailed functional inventory of Microsoft Publisher capabilities, together with the additional capabilities a replacement product must provide beyond Publisher parity. For each feature, it describes:

- What the feature is
- Why users need it
- Key functional requirements
- User expectations
- Important implementation considerations

This specification can be used as:

- A replacement-product requirements baseline
- A gap analysis framework
- An evaluation checklist for alternatives to Publisher
- A product backlog foundation for a Publisher replacement initiative

---

# 1. Document & Page Management

## 1.1 Publication Creation

### Description
Create new publications from blank documents or predefined templates.

### Key Requirements

The tool must:

- Create a new publication from a blank canvas.
- Create a new publication from a predefined template.
- Support common publication categories such as brochures, newsletters, flyers, signs, labels, business cards, calendars, greeting cards, postcards, certificates, menus, booklets, catalogs, and custom publications.
- Standard product configurations must use the Staples print product API for specifications such as size, max pages, bleed, safe zone, etc.
- Allow the user to select page size, orientation, margins, and layout type during creation.
- Allow publication settings to be modified after creation.
- Preserve publication metadata such as file name, author, creation date, modified date, page count, and template source where applicable.
- Provide a clear startup or new-document experience with searchable templates and blank-size options.

### User Expectations

Users expect:

- Fast creation without needing design expertise.
- Standard print sizes available immediately.
- Ability to start from a professional-looking design.
- Ability to bypass templates and build from scratch.
- No forced document structure like a word processor.

### Implementation Considerations

- Template and blank-document workflows should be equally easy to find.
- Custom page-size creation should not be hidden behind advanced settings.
- The document model default to standard print sizes originating from Staples standards, including but not limited to Product API, with custom sizes being an additional option.

---

## 1.2 Multi-Page Publications

### Description
Support publications containing multiple pages with independent or repeated layouts, in either single-page or facing-page (spread) form.

### Key Requirements

The tool must:

- Add pages to an existing publication.
- Insert pages before or after selected pages.
- Delete pages.
- Duplicate pages.
- Reorder pages through drag-and-drop or command controls.
- Display page thumbnails in a navigation pane.
- Allow each page to have a different layout.
- Support shared layouts through master pages or reusable templates.
- Support booklet, newsletter, catalog, and multi-panel publication structures.
- Preserve page-level objects, guides, margins, backgrounds, and numbering during duplication or reordering.

#### Facing Pages and Spreads

- Support both single-page and facing-page (spread) document modes.
- Display and edit facing pages together as a spread, with the spine indicated.
- Allow objects to cross the spine and remain a single object.
- Support inside and outside margins that mirror correctly across the spread.
- Allow the facing-page setting to be changed after document creation.
- Support island or multi-page spreads for gatefolds and multi-panel pieces where feasible.
- Represent spreads as spreads in the page navigation pane, not as unrelated single pages.

#### Mixed Page Sizes

- Support more than one page size within a single publication.
- Allow the page size and orientation of an individual page or spread to be changed without affecting other pages.
- Preserve per-page bleed, margin, and guide settings when page sizes differ.
- Support mixed sizes in print, imposition, and export workflows, or warn clearly when an output path cannot support them.

### User Expectations

Users expect:

- Visual page navigation.
- Simple page reordering.
- Confidence that objects remain in place when pages move.
- Support for newsletters, booklets, directories, catalogs, programs, and other multi-page layouts.
- Facing-page documents look and behave the way the finished, folded piece will read.
- Ability to include a fold-out, insert, or differently sized page in the same file rather than managing two documents.

### Implementation Considerations

- Page thumbnails should reflect the actual design state.
- Large publications must remain responsive.
- Page duplication should preserve links, formatting, guides, and master-page associations.
- Adding or removing a page in a facing-page document reshuffles spread pairing; the tool must make this shift visible before it is committed.
- Objects that cross the spine must export and print as one continuous object, without a seam.
- Mixed page sizes must not silently break booklet imposition or ganged print output.

---

## 1.3 Master Pages

### Description
Create reusable page-level layouts and elements that can be applied across multiple pages.

### Key Requirements

The tool must:

- Create one or more master pages.
- Apply a master page to selected pages.
- Apply different master pages to different sections of a publication.
- Place recurring content such as headers, footers, logos, backgrounds, guides, page numbers, watermarks, and repeated design elements.
- Allow the user to edit a master page once and update all dependent pages.
- Allow page-specific overrides where appropriate.
- Clearly distinguish master-page elements from normal page elements.

### User Expectations

Users expect:

- One edit updates many pages.
- Consistent branding across publications.
- Repeated objects do not need to be manually copied onto each page.
- Page numbering and headers work reliably.

### Implementation Considerations

- Master-page inheritance must be transparent to the user.
- Overrides should not accidentally break master-page linkage.
- The tool should clearly show which master page is applied to each page.

---

## 1.4 Custom Page Sizes

### Description
Create publications using arbitrary dimensions, including sizes not commonly supported in standard office applications.

### Key Requirements

The tool must:

- Support arbitrary page width and height.
- Support inches, centimeters, millimeters, pixels, and points where relevant.
- Support common commercial print sizes, specifically standard Staples product and print sizes.
- Save custom page-size presets.
- Allow page size changes after document creation.
- Warn users when resizing may affect existing layout.
- Nice to have: smart reflow of page elements on resize.

#### Page Rotation

- Rotate an individual page or spread 90 or 180 degrees for authoring purposes.
- Allow a rotated page to be edited in its rotated orientation without rotating every object on it.
- Preserve the page's true output orientation independently of the authoring rotation.
- Support landscape and portrait pages within the same publication.

#### Document Setup Areas

- Define page size (trim), **bleed**, and **slug** as distinct, first-class document properties.
- Support a slug area outside the bleed for job notes, approval marks, store or associate identifiers, and internal instructions.
- Display trim, bleed, and slug boundaries with visually distinct indicators.
- Allow slug content to be included or excluded at export and print independently of artwork.
- Support per-page or per-spread setup values in mixed-size documents.

### User Expectations

Users expect:

- Exact sizing for print production.
- No forced scaling.
- Ability to create files for unusual customer requests.
- Ability to work with business cards, tabs, labels, flyers, and signs.

### Implementation Considerations

- Custom dimensions should be preserved through export.
- The tool should support bleed and trim settings along with page size.
- Presets should be shareable or centrally manageable in enterprise use cases.
- Slug areas must never appear in customer-facing output unless explicitly requested.
- Page rotation is an authoring convenience and must not be confused with output orientation; the two must be independently inspectable.

---

## 1.5 Sections and Page Numbering

### Description
Divide a publication into independently numbered sections, and place automatic page numbers that stay correct as pages are added, removed, or reordered.

### Key Requirements

The tool must:

- Define sections within a publication, each with a defined start page.
- Allow page numbering to restart at any section boundary.
- Allow a numbering start value other than 1.
- Support section-specific numbering prefixes such as `A-1`, `2-14`, or `App-3`.
- Support multiple numbering formats, including Arabic numerals, uppercase and lowercase Roman numerals, and uppercase and lowercase letters.
- Insert automatic page-number fields on pages and master pages.
- Update all page numbers automatically when pages are inserted, deleted, duplicated, or reordered.
- Allow sections to carry a name or label for navigation and for identification in print and export dialogs.
- Display section boundaries and the effective page number in the page navigation pane.
- Allow page ranges in print and export to be specified using either absolute page position or section-based page labels.
- Allow different master pages to be applied per section.

### User Expectations

Users expect:

- Page numbers are correct without manual maintenance.
- Front matter, body, and appendices can be numbered independently.
- Catalogs and directories can use section-prefixed numbering.
- Reordering pages never leaves stale numbers behind.
- Printing "pages 4–8" means the pages the customer sees as 4 through 8.

### Implementation Considerations

- Automatic numbering must resolve identically on screen, in print preview, in print, and in export.
- Section changes should be previewable before they are applied, since renumbering affects the whole document.
- Section-based page labels must be surfaced clearly wherever a page range can be entered, to avoid off-by-one print errors.
- Jump lines ("continued on page X") and cross-references are deferred to a later phase (see 3.8). When added, they will resolve against this numbering model and must be recalculated alongside it, so the numbering implementation should not assume it is the only consumer.

---

# 2. Layout Engine

## 2.1 Freeform Object Positioning

### Description
Place content anywhere on the canvas with precise control.

### Key Requirements

The tool must:

- Support drag-and-drop object placement.
- Support precise X/Y positioning.
- Support keyboard nudging.
- Support configurable nudge increments.
- Display object coordinates.
- Allow positioning relative to page, margin, guide, or selected object.
- Preserve exact placement during save, reopen, print, and export.

### User Expectations

Users expect:

- Objects stay exactly where placed.
- The tool behaves like a layout application, not a word processor.
- Content does not shift unexpectedly when other content is edited.

### Implementation Considerations

- The layout engine must prioritize fixed placement.
- Reflow behavior should be explicit, not automatic unless the user requests it.
- Precision should be sufficient for print production.

---

## 2.2 Stacking Order and Layers

### Description
Control the visual stacking order of individual objects, and organize objects into named layers that can be shown, hidden, locked, reordered, and adjusted as a unit.

### Key Requirements

#### Object Stacking Order

The tool must:

- Bring objects forward.
- Send objects backward.
- Bring objects to front.
- Send objects to back.
- Support overlapping objects.
- Support selecting obscured objects.
- Preserve stacking order during export and print.

#### Layers Panel

The tool must provide a layers panel that allows the user to:

- Create, name, delete, duplicate, and reorder layers.
- Assign objects to a layer and move objects between layers.
- Show or hide an entire layer.
- Lock or unlock an entire layer.
- Set whether a layer prints or is excluded from print and export (non-printing layers for notes, dielines, approval marks, and reference artwork).
- Set a color per layer used for selection handles and object indicators.
- See which objects live on which layer, and select all objects on a layer.
- Expand a layer to inspect the objects it contains and their stacking order within it.
- Apply layers across the whole publication or scope them per page, as configured.
- Reorder layers to change the stacking of every object they contain at once.

#### Per-Layer Opacity and Blend Mode

The tool must:

- Set an opacity value from 0 to 100 percent for an entire layer.
- Apply a blend mode to an entire layer.
- Support standard blend modes including Normal, Multiply, Screen, Overlay, Darken, Lighten, and Soft Light at minimum.
- Apply layer opacity and blend mode as a composite over the layer's combined contents, not object by object.
- Allow object-level opacity and blend mode to coexist with layer-level settings, with clearly defined precedence.
- Preserve layer opacity and blend results accurately in print, PDF export, and image export.
- Reset layer opacity and blend mode to defaults.

### User Expectations

Users expect:

- Text can sit above images.
- Images can be used as backgrounds.
- Decorative elements can be layered behind primary content.
- Stacking order is predictable.
- Background artwork, guides, and dielines can be locked away on their own layer so they are never disturbed.
- A watermark, tint panel, or overlay can be softened in one action instead of adjusting every object.
- Non-printing reference content can live in the file without appearing in customer output.
- What is seen on screen with transparency and blending is what prints.

### Implementation Considerations

- Selection tools must handle dense layouts with overlapping objects.
- Layer controls should be easy to access from context menus and ribbon/toolbars.
- Locked layers should prevent accidental movement without blocking intentional unlocks.
- Layer structure must survive save, reopen, page duplication, and page reordering.
- Layer blend modes and opacity create transparency in the output; the export path must flatten or preserve transparency correctly for the selected print standard, and the design checker should flag risky combinations.
- Transparency and blending interact with color conversion; results must be validated in CMYK output, not only on an RGB screen.
- Novice-facing modes may present a simplified layers view, but the underlying layer structure must be preserved for advanced users and for imported files.
- Layers must map sensibly to and from imported file formats that carry their own layer models.

---

## 2.3 Alignment Tools

### Description
Automatically align multiple objects relative to each other or the page.

### Key Requirements

The tool must support:

- Align left.
- Align right.
- Align top.
- Align bottom.
- Align center horizontally.
- Align center vertically.
- Distribute horizontally.
- Distribute vertically.
- Align to page.
- Align to margin.
- Align to selected object.
- Align to guides.

### User Expectations

Users expect:

- Professional-looking layouts without manual measurement.
- Consistent spacing between objects.
- Fast cleanup of messy customer-provided layouts.

### Implementation Considerations

- Alignment commands should work on mixed object types.
- Distribution should preserve object size while adjusting position.
- Alignment previews can reduce mistakes.

---

## 2.4 Guides and Grids

### Description
Provide visual layout assistance for consistent placement and spacing.

### Key Requirements

The tool must support:

- Margin guides.
- Ruler guides.
- Baseline guides.
- Grid display.
- Snap-to-grid.
- Snap-to-guides.
- Custom guide placement.
- Guide locking.
- Show/hide guide controls.
- Guide color or visibility settings.

### User Expectations

Users expect:

- Consistent margins and spacing.
- Easier precision layout.
- Ability to align repeated elements across pages.

### Implementation Considerations

- Guides should not print unless explicitly configured as printable objects.
- Snap behavior should be optional and easy to toggle.
- Baseline grids should support text-heavy publications like newsletters and directories.

---

## 2.5 Pasteboard and Scratch Area

### Description
Provide working space outside the page boundary where assets can be held, staged, and compared without being part of the printed output.

### Key Requirements

The tool must:

- Provide a pasteboard area surrounding the page or spread.
- Allow objects to be placed fully or partially on the pasteboard.
- Exclude objects that sit entirely on the pasteboard from print and export.
- Preserve pasteboard objects on save, close, and reopen.
- Allow pasteboard objects to be dragged onto the page and back off again without loss of formatting.
- Support a scoped pasteboard per page or spread, and a shared area for assets used across the document, as configured.
- Allow the pasteboard size or zoom-out extent to be adjusted.
- Indicate clearly when an object is partially on the page and will therefore appear in output.

### User Expectations

Users expect:

- A place to park alternate headlines, logos, or images while deciding.
- Customer-supplied assets can be dropped into the file and staged before placement.
- Off-page content does not print or appear in the PDF.
- Nothing they set aside is lost when the file is saved and reopened.

### Implementation Considerations

- The boundary between page and pasteboard must be visually unambiguous, since it determines what prints.
- Objects straddling the page edge must be handled as printing objects and flagged by the design checker when the overlap looks unintentional.
- Pasteboard contents increase file size and should be reported in file information and in collect-for-output.
- The design checker should optionally report unused pasteboard assets before final output.

---

# 3. Text Management

## 3.1 Text Boxes

### Description
Independent containers for text that can be placed, resized, formatted, and layered like objects.

### Key Requirements

The tool must:

- Create text boxes anywhere on the page.
- Resize text boxes.
- Move text boxes freely.
- Rotate text boxes.
- Format text within the box.
- Format the box itself with fill, border, padding, and transparency.
- Duplicate text boxes.
- Lock text boxes.
- Detect text overflow.

### User Expectations

Users expect:

- Text behaves like a layout object.
- Editing text does not unexpectedly move unrelated objects.
- Text boxes are easy to create and manipulate.

### Implementation Considerations

- Text editing and object manipulation modes should be clear.
- Text boxes must support both short labels and long-form content.
- Overflow detection should be obvious and actionable.

---

## 3.2 Linked Text Frames

### Description
Allow text to flow from one text box to another, including across pages.

### Key Requirements

The tool must:

- Link one text box to another.
- Flow text automatically between linked boxes.
- Support multi-page text chains.
- Show link direction or connected-frame indicators.
- Detect overset or overflow text.
- Allow users to break links.
- Preserve formatting across linked frames.
- Support manual and automatic continuation.

### User Expectations

Users expect:

- Newsletter-like editing.
- Magazine-style layouts.
- Long articles can continue across pages.
- Overflow text is not silently hidden.

### Implementation Considerations

- Linked frames should be easy to inspect.
- Reordering pages must not break text flow.
- Deleting a linked frame should warn the user before content is lost.

---

## 3.3 Typography Controls

### Description
Apply professional character and paragraph formatting to publication text.

### Key Requirements

The tool must support:

#### Character Formatting

- Font family selection.
- Font size.
- Bold.
- Italic.
- Underline, including underline weight, offset, and color where feasible.
- Strikethrough.
- Font color.
- Highlighting.
- Superscript.
- Subscript.
- All caps.
- Small caps.
- Horizontal and vertical glyph scaling.

#### Font Support

- Support TrueType, OpenType (both `.otf` and `.ttf`), and OpenType Collection fonts.
- Support **variable fonts**, exposing named instances and continuous axis controls such as weight, width, optical size, and slant.
- Present all available weights and widths of a family as selectable, rather than only faux-bold and faux-italic.
- Provide font preview in the font picker.
- Support font search, favorites, and recently used fonts.
- Support font activation from a managed or centrally deployed font library.
- Detect missing fonts and provide guided substitution (see 3.7 and 10.1).
- Report font embedding and licensing permissions where the font file declares them.

#### Advanced Typography

- Kerning, with selectable **metric** and **optical** kerning, plus manual kerning between any character pair.
- Tracking.
- Character spacing.
- Word spacing.
- Baseline shift.
- Line spacing, expressed as a multiple, as an absolute leading value, or as a fixed baseline-grid lock.
- **Full OpenType feature support**, including standard and discretionary ligatures, stylistic sets, contextual alternates, swashes, oldstyle and lining figures, tabular and proportional figures, fractions, ordinals, and true small caps.
- A glyph browser for inserting any glyph in a font, including alternates for the selected character.
- Special-character insertion, including em dash, en dash, non-breaking space, non-breaking hyphen, discretionary hyphen, and typographic quotes.
- Automatic typographic substitution (smart quotes, dashes) with the ability to disable it.

#### Paragraph Formatting

- Left alignment.
- Right alignment.
- Center alignment.
- Justified alignment, with selectable treatment of the last line (left, center, right, or force-justified).
- First-line indent.
- Hanging indent.
- Left and right paragraph indents.
- Space before and after paragraphs.
- Tabs, with left, right, center, and decimal tab stops and **tab leaders**.
- Bullets, with control over glyph, image bullet, size, color, and indent.
- Numbering, with control over format, start value, separator, and continuation across frames.
- **Drop caps**, with control over the number of lines dropped, the number of characters included, character styling, and the gap to adjacent text.
- **Hyphenation and justification controls**, including hyphenation on or off per paragraph, minimum word length, minimum characters before and after a break, maximum consecutive hyphens, hyphenation zone, hyphenation of capitalized words, and minimum, desired, and maximum word- and letter-spacing values for justified text.
- Paragraph rules above and below, with control over weight, color, width, and offset.
- Keep options, including keep with next, keep lines together, widow and orphan control, and frame- or page-break-before rules.
- Paragraph shading and background fill.
- Paragraph-level baseline-grid alignment.
- Paragraph direction and alignment behavior appropriate to the text's language.

### User Expectations

Users expect:

- Marketing-quality typography.
- Fine control over type appearance.
- Consistent formatting across a publication.
- Justified text in newsletters and directories that reads cleanly, without rivers or awkward gaps.
- Access to every weight and stylistic option a purchased font actually contains.
- Familiar Publisher and Office typographic behaviors are available, and professional controls are there when needed.

### Implementation Considerations

- Typography controls should support both casual users and advanced users; advanced controls may sit behind progressive disclosure but must not be removed.
- Font availability and substitution should be handled transparently, and never silently.
- Hyphenation and justification defaults should produce good results without adjustment, since most users will never open these settings.
- Variable-font instances must be resolved correctly at export; if the output path cannot carry a variable font, the exported instance must match what was displayed.
- OpenType features applied to text must survive save, reopen, import, and export, and must not be lost when a style is reapplied.
- Manual character-level overrides must be distinguishable from style-driven formatting (see 3.6).

---

## 3.4 Text Wrapping

### Description
Flow text around images, shapes, and other objects.

### Key Requirements

The tool must support:

- No wrap.
- Square wrap.
- Tight wrap.
- Through wrap.
- Top-and-bottom wrap.
- Custom wrap boundaries.
- Wrap distance controls.
- Wrap preview.

### User Expectations

Users expect:

- Magazine-style layouts.
- Text can flow around photos and graphic elements.
- Wrap behavior is predictable and adjustable.

### Implementation Considerations

- Wrapping should work across object types.
- Complex shapes may require simplified wrap boundaries.
- The tool should clearly show when wrapping is active.

---

## 3.5 Text Auto-Fit and Overflow Handling

### Description
Help users prevent hidden or clipped text.

### Key Requirements

The tool must:

- Detect text overflow.
- Show overflow indicators.
- Offer to automatically shrink text.
- Offer to expand the text box.
- Offer to link overflow text to another text box.
- Preserve user control over final formatting.
- Warn before print or export if overflow remains.

### User Expectations

Users expect:

- No hidden text in final output.
- Faster correction of common layout issues.
- Clear warnings before printing.

### Implementation Considerations

- Auto-fit should not unexpectedly destroy typography.
- Overflow warnings should appear in design validation.
- The user should be able to disable automatic corrections.

---

## 3.6 Paragraph and Character Styles

### Description
Named, reusable sets of formatting that can be applied to text and updated globally, so that formatting is defined once and maintained in one place.

### Key Requirements

The tool must:

- Support **paragraph styles** that carry both paragraph-level and character-level attributes.
- Support **character styles** that apply only the attributes they define, leaving the rest of the paragraph's formatting intact.
- Create a style from currently selected, formatted text.
- Apply a style to a selection, a paragraph, a frame, or a whole story.
- Edit a style and update every instance of it in the publication automatically.
- Support **based-on inheritance**, so a child style tracks changes to its parent for attributes it does not override.
- Support a **next style** setting that applies automatically when a new paragraph is started.
- Assign keyboard shortcuts to styles.
- Provide quick-apply search by style name.
- Show which style is applied to the current selection.
- Indicate when local formatting **overrides** the applied style, and allow overrides to be cleared in one action.
- Redefine a style from a modified instance.
- Duplicate, rename, delete, and reorder styles, and organize them into groups or folders.
- Prompt for a replacement style when a style in use is deleted.
- Import styles from another publication or from a template.
- Support object styles and table and cell styles where feasible, following the same model.
- Map incoming styles on import from Publisher, Word, RTF, and other structured sources (see 13.1 and 13.3).
- Include styles in find and replace (see 12.3) and in the design checker's font and formatting checks (see 10.1).
- Support a default style set delivered with corporate or store templates.

### User Expectations

Users expect:

- Change a heading once and every heading updates.
- Consistent look across a long publication without manual checking.
- Brand-approved type treatments available as a named list, not rebuilt each time.
- Templates arrive with styles already defined.
- Applying a style never destroys deliberate local formatting without warning.

### Implementation Considerations

- Styles are the mechanism that makes centrally managed templates and brand governance possible; they must be present in v1 rather than deferred.
- The override indicator is what prevents silent drift; it must be visible in normal editing, not only in an advanced panel.
- Style inheritance must be inspectable, so a user can tell why a style looks the way it does.
- Simplified experience modes may present styles as a short visual list, but must apply the same underlying style objects.
- Imported documents frequently arrive with hundreds of near-duplicate styles; the tool should offer consolidation or cleanup.

---

## 3.7 Language, Hyphenation, and Proofing

### Description
Language-aware text handling, including spelling, hyphenation dictionaries, and font substitution guidance.

### Key Requirements

The tool must:

- Assign a language to text at the document, style, paragraph, or character level.
- Use the assigned language for spelling and hyphenation.
- Provide **spell check**, both as-you-type with visible indicators and as an on-demand pass across the publication.
- Check spelling in all text containers, including text boxes, tables, linked frames, master pages, and overflow text.
- Support user dictionaries, including adding, editing, and removing terms.
- Support shared or centrally managed dictionaries for product names, brand terms, and store terminology.
- Provide **grammar and style hints** where feasible, as suggestions the user can dismiss or disable.
- Support hyphenation dictionaries per language, plus a user-maintained hyphenation exception list.
- Support discretionary hyphens and no-break formatting for text that must not be split.
- Detect **missing fonts** on open or import and present a guided substitution dialog listing each missing font, its usage locations, and the proposed replacement.
- Allow substitution choices to be saved and reused across files, and applied in batch.
- Flag substituted fonts persistently until resolved, including in the design checker and before export.
- Support autocorrect with user-configurable entries, and allow it to be disabled.

### User Expectations

Users expect:

- Typos are caught before a customer order is printed.
- Product and brand names are not flagged as errors on every job.
- Hyphenation breaks words correctly for the language in use.
- Opening a legacy file makes it obvious which fonts were not available and what was used instead.

### Implementation Considerations

- Font substitution is one of the highest-risk points in legacy migration; the result must never be silent, since substituted metrics change line breaks and page counts.
- Spell check must not degrade typing responsiveness in large documents.
- Shared dictionaries need a management path for enterprise deployment.
- Hyphenation changes reflow text; the tool should make the scope of a language change visible before applying it.

---

## 3.8 Footnotes, Running Headers, and Cross-References (stretch goal — not required for phase 1)

> **Phase note:** This entire section is a **stretch goal**. None of the requirements below are required for phase 1. They are documented here so the capability is scoped and so the underlying model can be designed without precluding them. The one exception is noted under Implementation Considerations: automatic page-number fields themselves are required in phase 1 and are specified in **1.5**.

### Description
Automatically maintained text elements that derive their content or numbering from elsewhere in the publication.

### Key Requirements

If and when this capability is built, the tool should:

- Support **footnotes** anchored to a text position, placed at the bottom of the relevant page or column.
- Support **endnotes** collected at the end of a story or publication.
- Support automatic footnote and endnote numbering, with configurable format, start value, separator rule, and restart behavior per page, section, or story.
- Style footnote reference marks and footnote text independently.
- Reflow and renumber footnotes correctly when text reflows across pages or linked frames.
- Support **running headers and footers** that pull their content automatically from a designated style or variable on the page, such as the current section name, product category, or first and last entry on the page.
- Support text variables including page count, section name, file name, publication title, output date, and user-defined variables.
- Support **jump lines** ("continued on page X" / "continued from page X") that resolve automatically for linked text frames.
- Support **cross-references** to a page number, paragraph text, or section label, which update when the target moves.
- Flag broken references whose target has been deleted.
- Resolve all automatic content identically on screen, in print preview, in print, and in export.

### User Expectations

If delivered, users would expect:

- Directory and catalog headers update themselves page by page.
- "Continued on page" references are never wrong.
- Footnotes stay with the text they belong to.
- Legal, pricing, and disclosure footnotes survive editing and reflow.

### Phase 1 Workarounds

Without this capability in phase 1:

- Running header content must be typed manually per page or per master page.
- "Continued on page" references must be typed and maintained by hand, and re-checked whenever pages are added, removed, or reordered.
- Footnotes must be built as ordinary text in a separate text box, with numbering maintained manually.
- Long directories, catalogs, and multi-section booklets will carry a manual maintenance cost that grows with page count.

These workarounds are viable for the short, few-page pieces that make up most store work. They become expensive on long multi-section documents, which is the case to weigh when scheduling this section.

### Implementation Considerations

- **Phase 1 dependency:** automatic *page numbering* is required in phase 1 and is specified in **1.5**. Only the derived elements in this section — footnotes, running headers, text variables, jump lines, and cross-references — are deferred.
- Running headers and cross-references depend on styles (3.6) and on section numbering (1.5); if built later, they must resolve against the same model.
- The underlying **anchor model** — a stable way to reference a text position, object, or section that survives reflow — should be designed into the text engine in phase 1 even though the features are deferred. Retrofitting anchors into a shipped text engine is substantially more expensive than accommodating them up front.
- Automatic content, when added, must be recalculated before any output operation, not only on user interaction.
- Broken references, when supported, must surface in the design checker (10.1) rather than printing as placeholder text.
- Publisher files imported under 13.1 may contain footnotes, jump lines, or automatic header content. In phase 1 these should be converted to static text and **reported in the import report** as no longer automatically maintained, rather than dropped.

---

# 4. Images & Graphics

## 4.1 Image Placement

### Description
Insert and manage raster or vector image assets in a publication.

### Key Requirements

The tool must:

- Insert images from local files.
- Insert images from clipboard.
- Insert images from connected storage where applicable.
- Replace an existing image while preserving position and frame settings.
- Link images.
- Embed images.
- Support common formats such as JPG, PNG, TIFF, BMP, GIF, SVG, and other formats where feasible.
- Preserve image quality during layout and export.

### User Expectations

Users expect:

- Simple image insertion.
- Reliable image rendering.
- Easy image replacement in templates.
- No unexpected distortion.

### Implementation Considerations

- The tool should distinguish linked versus embedded assets.
- Missing linked images should be flagged.
- Image resolution should be assessed for print suitability.

---

## 4.2 Image Editing

### Description
Perform basic photo and image adjustments without leaving the publishing tool.

### Key Requirements

The tool must support:

- Crop.
- Resize.
- Rotate.
- Flip horizontal.
- Flip vertical.
- Brightness adjustment.
- Contrast adjustment.
- Recoloring.
- Transparency.
- Reset image to original.

### User Expectations

Users expect:

- Basic edits without opening separate software.
- Quick correction of customer-supplied images.
- Non-destructive editing where possible.

### Implementation Considerations

- Original image data should be preserved when feasible.
- Crop and resize controls should be precise.
- Image edits should carry through to PDF and image exports.

---

## 4.3 Graphic Effects

### Description
Apply visual effects to images, shapes, and other objects.

### Key Requirements

The tool must support:

- Shadows.
- Reflections.
- Bevels.
- Glows.
- Soft edges.
- Transparency effects.
- Picture borders.
- Shape effects.
- Effect removal or reset.

### User Expectations

Users expect:

- Attractive marketing materials.
- Easy visual enhancement without design expertise.
- Effects render consistently in print and export.

### Implementation Considerations

- Effects should not significantly degrade performance.
- Effects must export predictably to PDF and raster formats.
- The tool should avoid creating print artifacts.

---

## 4.4 Shapes Library

### Description
Create vector-based graphical elements directly inside the publication.

### Key Requirements

The tool must support:

- Rectangles.
- Rounded rectangles.
- Circles and ovals.
- Lines.
- Arrows.
- Callouts.
- Stars.
- Banners.
- Flowchart shapes.
- Freeform shapes where feasible.
- Fill colors.
- Outlines.
- Gradients.
- Pattern fills.

### User Expectations

Users expect:

- Create simple diagrams and design accents without external illustration tools.
- Use shapes for backgrounds, dividers, badges, callouts, and signage.

### Implementation Considerations

- Shapes should remain editable vector objects.
- Shape styling should integrate with themes.
- Shape resizing should preserve proportions when requested.

---

## 4.5 Linked Asset Resource Manager

### Description
A single panel that inventories every external asset a publication depends on, reports its status, and provides the tools to repair, update, and package those dependencies.

### Key Requirements

#### Inventory and Status

The tool must provide a resource manager that lists every linked and embedded asset with:

- File name and file type.
- Full source path or storage location.
- Page or pages where the asset is used, and a count of placements.
- Link status: current, **modified** (source changed since placement), **missing** (source not found), or embedded.
- Effective resolution at the placed size, in PPI.
- Color mode and color profile.
- File size.
- Transparency presence.
- Scale percentage applied in the layout.

#### Repair and Maintenance

The tool must:

- **Relink** a missing or moved asset to a new file path.
- Relink all assets from a chosen folder in one operation, matching by file name.
- **Update** an asset whose source file has changed, individually or all at once.
- Detect modified and missing links automatically on file open and report them in a single summary.
- Re-check link status on demand.
- Replace one asset with a different file while preserving frame position, crop, scale, and effects.
- **Convert between linked and embedded** for a selected asset or in bulk.
- Reveal an asset's source location in the operating system or storage location.
- Open an asset in an external editor and pick up the change on return.
- Select and highlight the placement of an asset in the layout from the resource manager.
- Filter and sort the list by status, type, resolution, page, or color mode.

#### Packaging

The tool must:

- Provide a **collect for output** (package) operation that gathers the publication file, all linked assets, and — where licensing permits — the fonts used, into a single folder or archive.
- Produce a manifest report listing included assets, fonts, and any items that could not be included.
- Report font licensing restrictions that prevent packaging rather than failing silently.
- Update the packaged publication's links to point at the packaged copies.

#### Integration

The resource manager must feed the design checker (10.1) with:

- Missing linked assets.
- Modified links not yet updated.
- Images below the resolution threshold for the intended output.
- Color modes inconsistent with the intended output.

### User Expectations

Users expect:

- One place to see whether the file is ready to output.
- A moved or renamed customer image can be reconnected in seconds, not rebuilt.
- Updating a logo once updates every placement.
- A job can be handed to another store, an associate, or an outside printer complete, with nothing missing.
- No surprise low-resolution images discovered after printing.

### Implementation Considerations

- Missing links are among the most common causes of failed print jobs; detection must happen at open, not only at export.
- Link paths must survive a file being moved between machines, stores, or storage locations, with relative-path resolution attempted before declaring an asset missing.
- Effective resolution must be recalculated whenever an image is scaled, not just at placement.
- Embedded assets increase file size significantly; the tool should report the tradeoff and support converting large embedded assets to links.
- Bulk relink must be safe: preview the proposed matches before committing.
- The resource manager should remain usable with several hundred placed assets, as in catalog and directory work.

---

# 5. Object Management

## 5.1 Grouping

### Description
Combine multiple objects so they can be moved, resized, copied, or formatted as a unit.

### Key Requirements

The tool must:

- Group selected objects.
- Ungroup grouped objects.
- Support nested groups.
- Move grouped objects as one unit.
- Resize grouped objects proportionally.
- Preserve relative positioning within the group.
- Allow editing of individual objects inside a group where feasible.

### User Expectations

Users expect:

- Easier handling of complex layouts.
- Ability to move logos, text, and shapes together.
- Grouping does not flatten or destroy editability.

### Implementation Considerations

- Groups should preserve object types.
- Grouping should not break links, wrapping, or effects.
- Selection behavior must clearly indicate grouped status.

---

## 5.2 Rotation

### Description
Rotate text boxes, images, shapes, and grouped objects.

### Key Requirements

The tool must support:

- Free rotation.
- Fixed-angle rotation.
- Rotation handles.
- Numerical angle entry.
- Rotate 90 degrees clockwise.
- Rotate 90 degrees counterclockwise.
- Reset rotation.

### User Expectations

Users expect:

- Flexible design options.
- Easy creation of angled labels, banners, and decorative elements.
- Rotated content prints and exports correctly.

### Implementation Considerations

- Rotation should preserve object quality.
- Text readability should be maintained where possible.
- Rotation should not alter object stacking order unless explicitly requested.

---

## 5.3 Object Locking

### Description
Prevent accidental changes to finalized or background layout elements.

### Key Requirements

The tool must:

- Lock object position.
- Lock object size.
- Lock object rotation.
- Lock object content where applicable.
- Unlock selected objects.
- Show locked state visually.
- Prevent accidental selection or movement based on user settings.

### User Expectations

Users expect:

- Protection of finalized layouts.
- Backgrounds and templates stay in place.
- Locked objects can still be intentionally unlocked.

### Implementation Considerations

- Lock controls should be available from context menus and object panels.
- Locked state must persist after save and reopen.
- Bulk lock/unlock should be supported for complex pages.

---

# 6. Template System

## 6.1 Publication Templates

### Description
Provide ready-made publication designs that users can customize.

### Key Requirements

The tool must:

- Provide built-in templates.
- Organize templates by category.
- Provide template preview.
- Support searchable templates.
- Allow users to replace placeholder text.
- Allow users to replace placeholder images.
- Allow users to change colors and fonts.
- Save custom templates.
- Reuse custom templates across publications.

### User Expectations

Users expect:

- Quick project startup.
- Professional layouts without starting from scratch.
- Easy customization of template content.

### Implementation Considerations

- Templates should be editable, not static images.
- Template quality must support print needs.
- Enterprise environments may need centrally managed template libraries.

---

## 6.2 Building Blocks (phase 2)

### Description
Reusable design components that can be inserted into publications.

### Key Requirements

The tool must support reusable:

- Headers.
- Footers.
- Sidebars.
- Pull quotes.
- Advertisements.
- Calendars.
- Borders.
- Page accents.
- Contact blocks.
- Logo blocks.
- Coupon blocks.

The tool must also:

- Provide a gallery of building blocks.
- Allow custom building blocks to be saved.
- Allow building blocks to be edited after insertion.

### User Expectations

Users expect:

- Faster publication construction.
- Consistent design components.
- Reuse of frequently needed content.

### Implementation Considerations

- Building blocks should integrate with themes.
- Custom building blocks should be shareable where appropriate.
- Inserted blocks should remain fully editable.

---

## 6.3 Design Themes (phase 2)

### Description
Apply coordinated visual styling across a publication.

### Key Requirements

The tool must support:

- Theme colors.
- Theme fonts.
- Theme effects.
- Global updates to existing content.
- Custom theme creation.
- Theme preview.
- Theme application to selected content or entire publication.

### User Expectations

Users expect:

- Consistent branding.
- Faster visual design.
- Easy switching between design variations.

### Implementation Considerations

- Theme changes should not break custom formatting unexpectedly.
- Users should be able to override theme attributes.
- Enterprise use cases may require approved brand themes.

---

# 7. Data-Driven Publishing

## 7.1 Mail Merge

### Description
Personalize publications by combining a design with external recipient data.

### Key Requirements

The tool must support data sources such as:

- Excel workbooks.
- CSV files.
- Outlook contacts.
- Access databases.
- Other structured data where feasible.

The tool must support:

- Merge fields.
- Address blocks.
- Greeting lines.
- Field formatting.
- Recipient filtering.
- Recipient sorting.
- Preview merged records.
- Generate merged publications.
- Print merged output.
- Export merged output to PDF where applicable.

### User Expectations

Users expect:

- Efficient direct mail creation.
- Accurate personalization.
- Ability to preview before generating large batches.

### Implementation Considerations

- Data mapping should be clear and correctable.
- Invalid or missing fields should be flagged.
- Large recipient lists must process reliably.

---

# 8. Tables & Structured Content

## 8.1 Tables

### Description
Display structured information in rows and columns.

### Key Requirements

The tool must:

- Insert tables.
- Specify row and column count.
- Add rows.
- Delete rows.
- Add columns.
- Delete columns.
- Resize rows and columns.
- Merge cells.
- Split cells.
- Apply borders.
- Apply cell shading.
- Format text inside cells.
- Import tabular data where feasible.

### User Expectations

Users expect:

- Professional presentation of schedules, lists, pricing, menus, directories, and product data.
- Simple editing similar to other Office table tools.

### Implementation Considerations

- Tables must behave predictably inside a fixed-layout publication.
- Imported data should preserve structure where possible.
- Table formatting should integrate with themes.

---

# 9. Print Production Features

## 9.1 Print Preview

### Description
Preview final output before printing.

### Key Requirements

The tool must:

- Show page preview.
- Show multi-page preview.
- Show current printer settings.
- Show margins.
- Show page orientation.
- Show scaling.
- Show duplex settings where applicable.
- Allow zooming.
- Allow page navigation.
- Warn about print issues.

### User Expectations

Users expect:

- Confidence before production.
- Ability to catch layout and sizing issues before wasting paper.
- Preview matches printed output.

### Implementation Considerations

- Preview must use the same rendering path as print/export where possible.
- Printer-specific limitations should be surfaced clearly.
- Scaling should never be ambiguous.

---

## 9.2 Bleed Support

### Description
Allow artwork to extend beyond the trim boundary for professional printing.

### Key Requirements

The tool must:

- Define bleed area.
- Display bleed boundary.
- Allow objects to extend into bleed.
- Preserve bleed during PDF export.
- Warn when objects intended to bleed do not extend far enough.
- Support standard bleed values and custom bleed values.

### User Expectations

Users expect:

- Professional edge-to-edge print results.
- Reliable business card, postcard, flyer, and brochure production.
- No unexpected white edges after trimming.

### Implementation Considerations

- Bleed must be distinct from margin and trim.
- Export settings must include bleed options.
- Design validation should check common bleed mistakes.

---

## 9.3 Crop Marks and Print Marks

### Description
Generate marks used by printers to trim, align, and produce printed pieces.

### Key Requirements

The tool must support:

- Crop marks.
- Registration marks where applicable.
- Color bars where applicable.
- Page information marks where applicable.
- Print-mark preview.
- PDF export with print marks.

### User Expectations

Users expect:

- Print-ready PDFs.
- Commercial printer compatibility.
- Clear trimming references.

### Implementation Considerations

- Print marks should be optional.
- Print marks should not interfere with artwork.
- Mark placement must account for bleed and page size.

---

## 9.4 Color Management

### Description
Control how colors are represented and reproduced in print and digital output.

### Key Requirements

The tool must support:

- RGB color selection.
- CMYK-aware workflows where applicable.
- Spot color workflows where applicable.
- Custom color palettes.
- Theme colors.
- Color conversion warnings.
- Consistent color output across print and export where feasible.

### User Expectations

Users expect:

- Predictable color output.
- Ability to use brand colors.
- Fewer surprises between screen and print.

### Implementation Considerations

- Professional color management can be complex, so the UI should expose practical controls without overwhelming users.
- Color warnings should be actionable.
- Print shops may require stricter color controls than casual users.

---

## 9.5 Booklet Printing

### Description
Support folded and saddle-stitched publications by arranging pages for booklet output.

### Key Requirements

The tool must:

- Support booklet page setup.
- Arrange pages for folded output.
- Support inside and outside margins.
- Support duplex printing.
- Preview booklet pagination.
- Handle page counts that require blank pages.
- Support common booklet sizes.

### User Expectations

Users expect:

- Easy booklet creation.
- Pages print in the correct order.
- Folded output reads correctly.

### Implementation Considerations

- Booklet imposition should be clear and previewable.
- The tool should warn when page count or printer settings do not support the intended booklet.
- Export workflows should preserve intended booklet structure when required.

---

# 10. Design Validation

## 10.1 Design Checker (Live Preflight)

### Description
Continuously identify publication issues while the user works, and again before print or export, so that problems are caught at the moment they are introduced rather than at the end of the job.

### Key Requirements

#### Live Checking

The tool must:

- Run validation **continuously in the background** while the publication is being edited, not only on demand or at export.
- Display a persistent, always-visible status indicator showing the current issue count and highest severity, so the user knows at a glance whether the file is output-ready.
- Update the issue list within a short, predictable interval after a change is made.
- Re-validate automatically after a fix, and clear resolved issues without requiring a manual recheck.
- Run a full validation pass automatically before print and before export, blocking or warning according to severity.
- Allow live checking to be paused, and allow an on-demand full check to be run at any time.
- Continue to function while the user is working, without interrupting editing or degrading responsiveness.

#### Detection Scope

The tool must detect:

- Missing fonts.
- Font substitutions.
- Fonts whose licensing prevents embedding.
- Low-resolution images, evaluated at the placed and scaled size against the threshold for the intended output.
- Excessively high-resolution images that will inflate output size.
- Missing linked images.
- Modified links not yet updated.
- Text overflow, including overflow at the end of a linked text chain.
- Objects outside the printable area.
- Objects straddling the page and pasteboard boundary.
- Objects too close to the trim edge, evaluated against the safe zone.
- Artwork intended to bleed that does not extend to the full bleed boundary.
- Bleed and slug configuration issues.
- **RGB content in a CMYK-intended output**, identified per object.
- Spot colors present when the job is intended to print in process colors, and unused or duplicate spot colors.
- Color values outside the reproducible gamut for the selected output.
- Rich-black and total-ink-coverage violations for the intended stock and press.
- Small or fine text set in multiple colors, at risk of registration problems.
- Hairline rules below the minimum reproducible weight.
- Transparency and blend-mode combinations that may not flatten predictably.
- Effects that may produce print artifacts.
- Broken cross-references and unresolved jump lines, once those features are delivered (see 3.8).
- Empty text or image frames.
- Page count incompatible with the intended booklet or finishing method.
- Page size or bleed inconsistent with the selected Staples product specification.
- Commercial printing concerns generally.
- Accessibility concerns where applicable.

#### Issue Presentation and Resolution

The tool must provide:

- Clear, plain-language issue descriptions written for non-designers.
- **Severity levels**, at minimum error (blocks output), warning (review before output), and informational.
- The exact location of each issue, including page, layer, and object.
- Click-to-navigate: selecting an issue selects and reveals the offending object in the layout.
- **Click-to-fix** for issues with a safe, deterministic remedy, such as relinking a missing asset, extending an object to the bleed line, converting an RGB object to the document's CMYK profile, enlarging a hairline rule to the minimum weight, or expanding a frame to resolve overflow.
- A preview or explanation of what a click-to-fix will change before it is applied, and an undoable result.
- Batch fixing of all instances of the same issue type where safe.
- The ability to ignore individual warnings, with ignored items retained in a separate list rather than deleted.
- Recheck after fixes.
- A printable or exportable preflight report suitable for attaching to a job ticket or sending with a file.

#### Output-Intent Profiles

The tool must:

- Validate against a selectable **output intent**: desktop print, in-store production print, commercial or offsite print, PDF, image export, or screen.
- Ship preconfigured profiles matching Staples production standards and equipment.
- Derive thresholds — minimum image resolution, bleed, safe zone, color mode, total ink coverage — from the selected product and output intent, using the Staples print product API where applicable.
- Allow profiles to be centrally defined, distributed, and locked for enterprise use.
- Allow a limited set of thresholds to be adjusted locally where permitted.
- Record which profile a file was validated against.

### User Expectations

Users expect:

- Prevent production mistakes.
- Know what must be fixed before printing.
- Faster troubleshooting when output looks wrong.
- To learn about a problem while there is still time to fix it easily, not at the counter with a customer waiting.
- To fix most issues from the warning itself, without knowing where the setting lives.
- Warnings written in terms they understand, not print-industry jargon.

### Implementation Considerations

- Validation should be contextual to the intended output: desktop print, commercial print, PDF, image, or email.
- Warnings should avoid false positives where possible; a checker that cries wolf will be ignored, which is worse than no checker.
- The checker should be useful to non-designers, and the same engine should serve both novice and advanced users, differing only in how much detail is exposed.
- Live checking must be incremental — validating only what changed — to remain responsive in large, image-heavy publications.
- The checker is the primary safety net for associates who are not trained designers, so click-to-fix coverage should be treated as a measurable target rather than a nice-to-have.
- Error-severity issues should require explicit acknowledgment before output, but must not permanently block a user who has a legitimate reason to proceed.
- The design checker, the resource manager (4.5), and the import report (13.1) should share one issue model and one presentation surface, so users learn a single interface.

---

# 11. Export & Distribution

## 11.1 PDF Export for Print

### Description
Generate print-ready PDF output that a production device or commercial printer can accept without rework. PDF export in this product is a **print production output**; digital and interactive PDF features are out of scope.

### Key Requirements

#### Standards Conformance

The tool must:

- Export **PDF/X-4** conformant files as the required print output standard.
- Validate conformance at export and report, in specific terms, any condition that prevents a conformant file from being produced.
- Write a defined **output intent** into the exported file, identifying the target print condition.
- Record the PDF version and conformance level in the export confirmation and in the preflight report.
- Support additional PDF/X conformance levels only if a downstream production requirement is later confirmed. *(See open question in 11.1.1.)*

#### Fonts

The tool must:

- **Embed all fonts** used in the publication, as full fonts or subsets.
- Refuse to produce a PDF/X-4 file when a required font cannot be embedded, and identify the font, its licensing restriction, and where it is used.
- Offer outlining of text as an explicit, user-initiated fallback when embedding is not permitted, with a clear warning that the text will no longer be searchable or editable.
- Never silently substitute a font at export.

#### Images and Resolution

The tool must:

- Preserve images at a resolution appropriate to the selected preset, with configurable downsampling thresholds for color, grayscale, and monochrome images.
- Support configurable compression per image class, including a lossless option.
- Preserve vector artwork and text as vectors rather than rasterizing them.
- Report any image falling below the preset's minimum effective resolution before export completes (see 10.1).

#### Color

The tool must:

- Convert or preserve color according to the selected output intent, with the conversion behavior stated plainly in the export dialog.
- Support CMYK output for process printing.
- **Preserve spot colors** as named separations rather than converting them without notice.
- Embed ICC profiles as required by the output intent.
- Report objects whose color will be converted, and what they will become, before export.

#### Page Setup and Marks

The tool must:

- Include **bleed** at export, using the document's bleed setting or an override value.
- Include **crop marks** when requested, correctly offset for the bleed in use.
- Include registration marks, color bars, and page information marks when requested.
- Include or exclude the **slug** area independently of artwork.
- Export a defined page range, expressed in either absolute page position or section page labels (see 1.5).
- Export facing-page documents as either reader spreads or individual trim pages, at the user's choice.
- Preserve mixed page sizes within a single exported file.

#### Transparency

The tool must:

- Preserve live transparency in PDF/X-4 output rather than flattening it.
- Provide a flattening option for downstream workflows that require it, with a resolution setting for flattened regions.
- Warn when transparency interacts with spot colors or blend modes in a way that may not reproduce as displayed (see 10.1).

#### Presets

The tool must:

- Provide named export presets, including at minimum a **production print** preset and a **customer proof** preset.
- Derive preset defaults from the selected Staples product and print condition where applicable, using the print product API.
- Support centrally defined, distributed, and lockable presets for enterprise use.
- Allow custom presets to be saved, named, and shared.
- Show the key settings a preset will apply before export runs.
- Default to the correct production preset for the selected product, so that a print-ready file is the path of least effort.

#### Related

- Packaging a job with its linked assets and fonts is covered by collect for output in **4.5**.
- Pre-export validation is covered by the design checker in **10.1**.

### User Expectations

Users expect:

- PDF looks exactly like the publication.
- The file is accepted by the production device or commercial printer without a callback.
- No unexpected reflow, object movement, font substitution, or color shift.
- Bleed and crop marks are correct without needing to understand how they work.
- The right settings are the default, not something to be hunted for.

### Implementation Considerations

- PDF export should provide clear presets; print-ready settings must not be buried.
- Font licensing or embedding limitations must be communicated at the point of export, with the affected text identified.
- Export should be reproducible: the same document and preset must produce the same output every time.
- Export must use the same rendering path as print preview, so that preview and PDF agree.
- Export failures must return actionable diagnostics naming the object, page, and cause.
- Large or image-heavy exports should report progress and be cancellable without leaving a partial file behind.

### 11.1.1 Open Question — Additional PDF/X Levels

PDF/X-4 is specified as the sole required conformance level. Some commercial printers and legacy RIP workflows still specify **PDF/X-1a**, which requires flattened transparency and CMYK-only color. Staples print production should confirm whether any current or planned production path requires PDF/X-1a before this is treated as settled. If so, X-1a should be added as a second required preset, and the transparency-flattening requirement above becomes mandatory rather than optional.

---

## 11.2 Image Export

### Description
Export pages or selected content as image files.

### Key Requirements

The tool must support export to formats such as:

- PNG.
- JPG.
- TIFF.

The tool must support:

- Page-level export.
- Selected-object export where feasible.
- Resolution control.
- Transparency control for formats that support it.
- Color profile handling where applicable.

### User Expectations

Users expect:

- Use publication content in social, web, email, signage, or proofing workflows.
- Control image quality.
- Export without rebuilding the design elsewhere.

### Implementation Considerations

- Raster export must preserve visual fidelity.
- Resolution defaults should be appropriate for the intended use.
- Exported images should not crop content unexpectedly.

---

# 12. Productivity Features

## 12.1 Undo and Redo

### Description
Reverse or reapply editing actions.

### Key Requirements

The tool must:

- Support multi-level undo.
- Support multi-level redo.
- Preserve undo history during active editing sessions.
- Handle object, text, image, page, and formatting edits.
- Clearly indicate when undo or redo is available.

### User Expectations

Users expect:

- Fear-free editing.
- Ability to recover from mistakes.
- Consistent behavior across editing modes.

### Implementation Considerations

- Undo history should be robust across complex layout actions.
- Large actions such as template changes should be undoable.
- The tool should avoid clearing history unexpectedly.

---

## 12.2 Clipboard Support

### Description
Copy, cut, paste, and duplicate publication content.

### Key Requirements

The tool must support:

- Copy.
- Cut.
- Paste.
- Paste special where applicable.
- Duplicate.
- Copy formatting.
- Preserve object formatting.
- Preserve text formatting.
- Preserve image quality.
- Maintain relative positioning when pasting multiple objects.

### User Expectations

Users expect:

- Consistent Office-style behavior.
- Fast reuse of design components.
- Ability to bring in content from other applications.

### Implementation Considerations

- Clipboard operations should preserve editability where possible.
- Pasted content should not unexpectedly rasterize.
- Cross-application paste should handle unsupported formatting gracefully.

---

## 12.3 Find and Replace

### Description
Locate and modify text within a publication.

### Key Requirements

The tool must:

- Search text across the publication.
- Replace text across the publication.
- Search within selected text or selected pages.
- Support whole-word search.
- Support case-sensitive search where applicable.
- Support formatting-aware search where feasible.
- Support **style-aware find and replace**, locating text by applied paragraph or character style and replacing one style with another across the publication (see 3.6).
- Support finding and replacing formatting attributes independently of text content, such as replacing every instance of one font with another.
- Support **pattern-based search** using regular expressions or an equivalent wildcard syntax, for tasks such as reformatting phone numbers, prices, or SKUs in bulk. *(Advanced-mode feature; may sit behind progressive disclosure.)*
- Support searching for special characters, including tabs, paragraph marks, line breaks, and non-breaking spaces.
- Report when no matches are found.

### User Expectations

Users expect:

- Efficient updates to large publications.
- No need to manually inspect every page.
- Reliable replacement without changing unrelated content.

### Implementation Considerations

- Search must include text boxes, tables, master pages, and linked text frames where applicable.
- Replacements should preserve formatting unless the user changes it.
- Hidden overflow text should be searchable and flagged if relevant.

---

# 13. File Compatibility & Enterprise Requirements

## 13.1 Microsoft Publisher (`.pub`) Import

### Description
Open existing Microsoft Publisher files directly and convert them into fully editable native publications. This is the primary migration path off Publisher and the capability that most distinguishes this tool from available alternatives, none of which can open `.pub` files at all.

### Key Requirements

#### Opening Files

The tool must:

- Open `.pub` files directly, without an intermediate conversion step performed by the user.
- Support Publisher binary formats from Publisher 2007 through Publisher 2021 and Microsoft 365.
- Support Publisher template files (`.pub` templates) in addition to publications.
- Detect and report a file it cannot open, naming the reason, rather than failing generically or producing a partial document.
- Open a `.pub` file into the native editing environment as a fully editable publication, not as a flattened image or read-only preview.
- Support opening a `.pub` file from local storage and from connected or network storage.

#### Conversion Fidelity

The tool must convert, preserving both content and appearance:

- Page geometry, including page size, orientation, margins, and bleed.
- Multi-page structure, page order, and facing-page or spread arrangement.
- Sections and page numbering, including numbering restarts and formats.
- Master pages, including multiple masters and per-page master assignment.
- Text content, with paragraph and character formatting.
- Text frames, including linked text frames and the flow order between them.
- Publisher styles, mapped to native paragraph and character styles.
- Tables, including structure, merged cells, borders, and shading.
- Images, both embedded and linked, including crop, scale, rotation, and frame settings.
- Shapes and lines, preserved as editable vector objects.
- WordArt and similar decorative text objects, mapped to the closest native equivalent.
- Fill colors, gradients, outlines, and basic effects.
- Object grouping, stacking order, locking, and rotation.
- Text wrap settings and wrap boundaries.
- Guides, rulers, and layout grids.
- Mail merge field placeholders and their data-source references where present.
- Automatically maintained elements such as footnotes, jump lines, and running header content. In phase 1 these convert to static text and are reported as no longer automatically maintained (see 3.8); they must not be dropped.
- Document metadata, including title, author, and creation and modification dates.

#### Import Report

On completion, the tool must present a report that:

- States overall conversion status.
- Lists every element that could not be mapped exactly, with its page and object location.
- Lists **substituted fonts**, showing the original font, the replacement used, and where each is used.
- Lists unsupported or approximated effects.
- Lists color conversions performed, including any RGB to CMYK shifts.
- Lists missing linked images and their expected paths.
- Flags text that overflows or reflows differently than in the source.
- Distinguishes items requiring user review from items that were converted cleanly.
- Allows the user to navigate directly from a report entry to the affected object.
- Can be saved, printed, or exported for the record.
- Remains accessible after the initial dialog is dismissed, and feeds its findings into the design checker (10.1).

#### Font Handling

The tool must:

- Detect fonts referenced by the source file that are not available locally.
- Present a guided substitution dialog listing each missing font, where it is used, and the proposed replacement.
- Allow the user to choose a different replacement per font before conversion is finalized.
- Save substitution choices and reuse them automatically on subsequent imports.
- Support a centrally managed substitution map for enterprise deployment, so that all stores resolve legacy fonts the same way.
- Flag substituted fonts persistently in the converted document until the user acknowledges them, since substitution changes text metrics and can alter line breaks and page counts.

#### Batch Import

The tool must:

- Convert a folder of `.pub` files in a single operation.
- Apply a shared font-substitution map across the batch.
- Produce a consolidated batch report identifying which files converted cleanly and which need review.
- Continue processing remaining files when one file fails.
- Support conversion of an existing Publisher **template library** to native templates in one operation.

#### Fidelity Measurement

- Conversion fidelity must be measurable, not subjective. The tool must be developed against a conformance corpus of real-world `.pub` files representing actual store work, with an automated comparison of the converted render against a reference render of the source.
- Target: **at least 90 percent element-level fidelity** across the conformance corpus, with all deviations disclosed in the import report.

### User Expectations

Users expect:

- Existing Publisher files open on the first try, without rebuilding them.
- The converted file looks like the original.
- Anything that did not convert exactly is disclosed rather than discovered later at print.
- An entire folder of legacy templates and customer files can be migrated at once.
- A file can be opened, edited, and printed within the same session, with no separate migration project.

### Implementation Considerations

- `.pub` is a proprietary, undocumented binary format. This requires a dedicated parser effort, a conformance test corpus of real-world files, and a fidelity-scoring harness. It is the highest-risk and most defensible element of the product and should be scoped and spiked early.
- Achievable fidelity is the largest technical unknown in the product; the fidelity target above should be validated against a spike before it is committed to.
- Font licensing and substitution is the most likely source of visible conversion error and must be handled explicitly rather than as a fallback path.
- Conversion must never silently drop content. An element that cannot be represented must appear in the report.
- Import must not modify the source `.pub` file.
- Import performance matters: multi-page, image-heavy legacy newsletters and catalogs are common and must convert without timing out.
- Publisher's mail merge data-source references may point at files or systems that no longer exist; unresolved references should be reported, not treated as errors that block conversion.

---

## 13.2 Native File Format

### Description
The format the application saves publications in, and the guarantees made about the long-term accessibility of files saved in it.

### Key Requirements

#### Format Properties

The tool must:

- Save publications in a single native document format, working name **`.cdoc`** *(placeholder pending branding)*.
- Preserve every feature of the application in the native format without loss, including pages and sections, master pages, layers with opacity and blend modes, styles, linked text flow, typography settings, color definitions and spot colors, effects, transparency, object locking and grouping, guides, pasteboard contents, data-merge configuration, and asset link references.
- Store the format as a documented, structured container using open, non-proprietary encoding, so that the file's contents are inspectable and recoverable independently of the application.
- Carry an explicit format version identifier in every file.
- Store document metadata, including title, author, creation date, modification date, application version, page count, and the product or template the file originated from.
- Support both embedded and referenced assets, with reference paths that resolve relatively where possible (see 4.5).
- Support optional compression, and remain resilient to partial corruption where feasible.

#### Compatibility Policy

The tool must:

- Open files written by any earlier version of the application.
- Provide a defined policy for opening files written by a newer version, at minimum identifying the version mismatch and stating what may not be preserved, rather than failing without explanation.
- Warn before saving in a way that would remove content a target version cannot represent, naming what would be lost.
- Support a save-as-earlier-version path where a mixed-version deployment requires it.
- Never require a network connection or an external service to open a locally stored native file.

#### Openness and Business Continuity

- The native format specification must be **documented and published**, so that customers are never dependent on the application's continued availability to access their own documents.
- The specification must be versioned alongside the application.
- The application must always provide an export path to widely supported formats (see 11.1 and 13.3), so that no document is reachable only through the native format.
- Nothing in the format or its licensing may prevent a customer from reading their own files.

#### Saving Behavior

The tool must:

- Save reliably, with atomic writes so that an interrupted save cannot destroy the previous good file.
- Support autosave and crash recovery of unsaved work (see 13.4).
- Support save-as, duplicate, and save-as-template.
- Report save failures with actionable diagnostics, including cause and location.

### User Expectations

Users expect:

- A file saved today opens years from now.
- Nothing in the design is lost between save and reopen.
- Files open on any store's installation, regardless of version drift.
- They are not locked out of their own work.
- A crash or interruption does not cost the job.

### Implementation Considerations

- Publisher's proprietary format is a direct cause of the migration problem this product exists to solve; repeating that pattern would undermine the product's positioning.
- A documented open format is a meaningful enterprise procurement and business-continuity argument and should be treated as a product requirement, not an engineering detail.
- Version compatibility rules must be defined before the first release, because retrofitting them is far costlier than designing them in.
- The format must accommodate features planned but not yet built, so that later additions do not force a breaking version change.
- The final file extension and format name are pending branding; `.cdoc` is a working placeholder only.

---

## 13.3 File Compatibility

### Description
Support common publishing workflows through import, export, and interoperability.

### Key Requirements

The tool should support importing or placing:

- Images.
- Vector images (SVG).
- Text files.
- Office content.
- CSV data.
- Spreadsheet data.
- Microsoft Publisher publications and templates (see 13.1).
- Existing publication assets where feasible.

The tool should support exporting:

- PDF for print, conforming to PDF/X-4 (see 11.1).
- PNG.
- JPG.
- TIFF.
- Other production-friendly formats where feasible.

The tool must:

- Save in a documented native format (see 13.2).
- Preserve layout fidelity during open, save, print, and export.
- Warn when unsupported content cannot be preserved.
- Maintain backward or migration compatibility where required.

### User Expectations

Users expect:

- Existing business content can be reused.
- Final output can be shared with customers, printers, and coworkers.
- File format issues are clearly explained.

### Implementation Considerations

- Proprietary publication formats require a defined migration strategy; for Microsoft Publisher this is specified in 13.1.
- Import fidelity should be measured against common real-world files.
- Export should prioritize stable, widely supported formats.
- The product should not create a new lock-in problem of its own; see the openness requirements in 13.2.

---

## 13.4 Performance and Reliability

### Description
Maintain usability and stability across complex, graphics-heavy, or multi-page publications.

### Key Requirements

The tool must:

- Open publications reliably.
- Save publications reliably.
- Support autosave or recovery where applicable.
- Render pages quickly.
- Navigate pages smoothly.
- Handle large images.
- Handle multi-page documents.
- Avoid data loss after crashes or interruptions.
- Provide clear error messages.

### User Expectations

Users expect:

- No loss of work.
- Large files remain usable.
- Print and export complete successfully.
- The tool can support real production workflows.

### Implementation Considerations

- Performance testing should include image-heavy files and multi-page publications.
- Recovery should protect unsaved edits.
- Print/export failures should provide actionable diagnostics.

---


# 14. Recommended Evaluation Checklist for a Publisher Replacement

A Publisher replacement should be evaluated against these baseline questions:

- **Can users open existing `.pub` files directly, with a report of anything that did not convert exactly?**
- **Can an entire folder or template library of legacy Publisher files be converted in one operation?**
- Can users create custom print-sized documents without workarounds?
- Can users work in facing pages and spreads, with mixed page sizes in one document?
- Can users define sections with independent, automatically maintained page numbering?
- Can users position objects freely and precisely?
- Can users create and edit multi-page publications?
- Can users reuse master-page elements across pages?
- Can users organize work on named layers, with per-layer opacity, blend mode, lock, hide, and non-printing settings?
- Can users link text across frames and pages?
- Can users define and globally update paragraph and character styles?
- Can users control hyphenation, justification, drop caps, OpenType features, and variable fonts?
- Can users spell check and manage font substitution across a publication?
- Can users create business cards, flyers, signs, brochures, newsletters, and booklets?
- Can users import images and perform basic image corrections?
- Can users see, relink, update, and package every linked asset a job depends on?
- Can users group, align, layer, rotate, and lock objects?
- Can users use templates and reusable design components?
- Can users perform mail merge or catalog-style data-driven publishing?
- **Can users create print-ready PDF/X-4 files with embedded fonts, bleed, and crop marks?**
- Can users detect low-resolution images, overflow text, missing fonts, and other production issues **while they work, not only at export**?
- Can users fix the issues the checker reports directly from the warning?
- Can users export to PDF and common image formats?
- **Can users be confident their saved files remain openable long term, in a documented format?**
- Can users work reliably with large or graphics-heavy documents?
- Can organizations manage templates, brand assets, preflight profiles, export presets, and reusable settings centrally?
- Can legacy Publisher workflows be migrated with minimal disruption?

