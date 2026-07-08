# Photo Editor — Feature List, UI Requirements & Implementation Plan

**Document type:** Component plan (features → UI → Claude Code build sequence)
**Status:** Draft v1.0 — for review
**Author:** Jennifer Allen, Sr Mgr Product Management
**Last updated:** 2026-07-07
**Component:** Photo Editor — the **Adobe Photoshop Elements 2019 / Photoshop Express replacement** within the Store Tools Suite
**Companion to:** `Store_Tools_Suite_Feature_Requirements.md` (§8.1–8.2), `PRINT_DESIGN_TOOL_FEATURE_LIST.md` (quick-fix utilities), `Resize_and_Layout_Imposition_Handoff.md` (resize surface), `SECURITY_CONSIDERATIONS.md` (image-stack risk profile), `Store_Tools_Suite_Implementation_Plan.md` (phase/tranche model)

Flags: **[CORE]** counter-critical · **[PRINT]** print-correctness · **[SURVEY]** validated by the field survey · **[INT]** depends on catalog/order integration · **[CUT]** explicitly out of scope

---

## 1. What this tool is — and is not

The Photo Editor is the **raster quick-fix surface** of the suite: one customer image in, a corrected, print-ready image out, in one or two clicks. It replaces the two Adobe tools associates actually use today — **Photoshop Express** (the daily driver, 81% usage) and the aging **Photoshop Elements 2019** install (discontinued, unpatched, and repeatedly described in the survey as "outdated," "so slow," and prone to "crashing the computers").

It is deliberately **not** a layout tool. The document-model boundary established across the suite holds here:

| Job | Tool |
|---|---|
| Fix a single raster image (crop, straighten, brightness, bleed, format) | **Photo Editor — this document** |
| Arrange text + images on a page, custom/odd/large sizes, multi-page | Layout Editor (`LAYOUT_EDITOR_PLAN.md`) |
| PDF combine/split/annotate | PDF toolkit (`CutePDF-Pro-Replacement-Spec.md`) |
| Resize/impose a *document* to a target product size | Resize & Imposition surface (`Resize_and_Layout_Imposition_Handoff.md`) |

The two tools share DNA on purpose: the Photo Editor's text/logo overlay uses the same interaction model as the layout canvas, and "this image really wants to be a poster" hands off to the Layout Editor through the shared conversion-and-routing engine (§8.1 of the requirements doc). Oversize and multi-page content **routes out**; the Photo Editor never becomes a second layout tool through scope creep.

---

## 2. Survey grounding (updated dataset — n = 211)

**Note for cascade:** the survey file now contains **211 responses**, up from the n=111 cited in `PRINT_DESIGN_TOOL_FEATURE_LIST.md` and the n=160 snapshot. The rankings hold; percentages below are recomputed from the current file. Companion docs citing n=111 should be refreshed in a later pass.

**Photo-relevant tasks performed behind the counter (n=211):**

| Task | % |
|---|---|
| Resizing or cropping images | **97%** |
| Converting file formats (e.g. JPG→PDF) | 93% |
| Business-card resize / background-bleed expansion | 84% |
| Adjusting image brightness or contrast | 76% |
| Adding/removing text to documents or images | 75% |
| Adding logos or branding | 52% |
| Color matching | 50% |

**Tools today:** Adobe Photoshop Express **81%** · Publisher 75% · Canva 33% · long tail of Elements 2019, full Photoshop, HEIC converters, and "whatever free website comes up on Google."

**"Photo editing tools" is the #3 requested feature at 69%** (146 of 211) — behind only page layout (79%) and more templates (70%), and ahead of easier format conversion (68%).

**Qualitative signal specific to this tool:**

- **The current install is a liability.** "Our photoshop is really outdated… our MPS computers are so slow when downloading files it's almost impossible." "Photoshop tends to crash the computers or cause them to slow severely." Multiple direct asks for "a current version of Photoshop" — the underlying need is a *fast, working* photo fixer, not Adobe specifically.
- **Learning curve is a real adoption risk.** "Photoshop Elements requires much more in-depth training than Publisher for the same tasks." "Steep learning curve which frustrates associates." The replacement must be simpler than Elements, not merely equivalent.
- **Speed is a stated benchmark.** One associate asks for "a better/faster photo editor program like FastStone Image Viewer" — instant-open, instant-crop responsiveness is the bar.
- **Print correctness gaps are named explicitly:** "something that helps us with the pixelation on customers' images" (low-res detection/upscale), "software that helps us add more bleed to an image," and poor RGB→CMYK color rendering ("Royal Blue… printing directly from Photoshop seems to produce better color rendering").
- **Emerging fixup load:** HEIC "Live" photos needing conversion before they can even print, SVG customer files, and customer-supplied **AI-generated artwork** needing resolution/format/color-mode cleanup.
- **Emotional attachment is real:** "PLEASE DON'T TAKE PHOTOSHOP :'(" — change management for this tool matters as much as for Publisher.

---

## 3. Feature list

### 3.1 P1 — Counter-critical (launch blockers)

**Open & intake [CORE][SURVEY]**
1. Open JPG, PNG, GIF, WEBP, BMP, TIFF, **HEIC** (iPhone), and single-image SVG (rasterized on ingest) — identified by content-sniff, not extension. Arrives via the shared conversion-and-routing engine; ZIPs are unpacked upstream.
2. **Instant open.** Target: image on screen and editable in under 2 seconds for a typical phone photo on the ProDesk 600 G4. This is the FastStone bar and the single biggest perceived upgrade over Elements 2019.
3. **[INT]** Pull the image **straight from the customer's order** and save the fix back against it (shared order-integration seam; ships when the backbone write-path lands, read-side at launch).

**Geometry [CORE][SURVEY]**
4. **Crop** — freeform, fixed-ratio presets (1:1, 4:6, 5:7, 8:10, letter, business card), and product-size crop bound to catalog SKUs **[INT][PRINT]**. Rounded-corner/shape crop as a preset (named in survey comments for precise rounded cropping).
5. **Resize** — by pixels, inches/mm at a DPI, or percentage; aspect lock; **effective-DPI readout at the current print size with a low-res soft warning** (the "pixelation" ask) **[PRINT]**.
6. **Straighten** (horizon slider + auto-detect), **rotate** 90°/arbitrary, **flip** H/V.

**Tone & color [CORE][SURVEY]**
7. Brightness / contrast (76% do this today) with live preview.
8. Auto-enhance — one-click levels/white-balance/saturation correction, always undoable.
9. Exposure, highlights/shadows, saturation, color temperature — simple sliders, Standard level only (§4.4).

**Print correctness [PRINT][SURVEY]**
10. **One-click background / bleed expansion** — auto-extend edge content (mirror, smear, or solid-color fill chosen automatically, override available) to the bleed line for a target product. The #1 resubmission cause; gets a prominent, named button, not a menu item.
11. **Auto-fit to product size** — pick a catalog product or standard photo size (4×6, 5×7, 8×10 — an explicit survey ask); Fit/Fill/anchor controls consistent with the Resize & Imposition surface **[INT]**.
12. **Low-res rescue** — when effective DPI falls below threshold, offer a one-click **upscale** (server-side, quality-capped and honestly labeled: "improves smoothness, cannot invent detail").
13. **Print-safe export** — flatten, embed sRGB ICC profile, export JPG/PNG/TIFF/**PDF (image-wrapped, correct trim+bleed boxes)**; CMYK-intent export via ICC transform so on-press color stops surprising associates (the Royal Blue complaint).

**Annotation [CORE][SURVEY]**
14. **Add text** on the image — font, size, color, alignment; same text-tool interaction as the layout canvas (75% add/remove text today).
15. **Add a logo / second image** — place, scale, rotate a PNG/SVG overlay (52%).
16. **Remove text / objects** — content-aware erase over a brushed or boxed region. This is the "remove" half of add/remove text; scoped to small-region cleanup, not full-scene retouching.

**Conversion [CORE][SURVEY]**
17. Format conversion (93% daily; 68% want it easier) surfaced as a first-class **Export as…** action — including HEIC→JPG/PDF without opening a browser tab to a free website.

**Suite handoffs [CORE]**
18. **"Open in Layout Editor"** — carries the edited image (with its edit recipe applied) into a layout document; the routing engine forces this path automatically for oversize (> current tool ceiling) or multi-image jobs.
19. Send to the Resize & Imposition surface for N-up/gang-up of the fixed image.

### 3.2 P2 — Elements parity that earns its keep

20. **Color matching helper [SURVEY]** (50% do this) — eyedropper a target color, shift the image or a selected region toward it; pairs with the training ask ("would love training on color matching") via an inline quick-guide.
21. **Spot heal / blemish removal** — brush-based content-aware repair (the Elements feature associates actually use on customer photos).
22. **Red-eye removal** — one-click, auto-detected.
23. **Sharpen** and **noise reduction** — single-slider each.
24. **Background removal** — one-click subject cutout (server-side model), output transparent PNG; feeds logo placement and the layout editor.
25. **AI-artwork cleanup preset [SURVEY]** — one action that fixes the recurring customer-AI-file problems: resolution normalize/upscale, format convert, color-mode correct, strip broken metadata.
26. **Levels / curves-lite** — Pro level only (§4.4), for the veterans who will resent a capped ceiling.
27. **Batch apply** — same recipe (resize to 4×6, convert to JPG) across a folder of customer photos; direct answer to the photo-print workflow comments.
28. **Highlight-to-change [SURVEY]** — select a region, floating toolbar, type an instruction ("brighten just this face," "remove this date stamp"); the suite-standard AI interaction per `Additional_feature_-_highlight_to_change`, content-only per the security doc.

### 3.3 P3 — Later, evidence-gated

29. Filters/effects pack (B&W, sepia, vignette) — low survey signal; cheap once the pipeline exists.
30. Clone stamp and advanced brushed selections.
31. Perspective/keystone correction (photographed documents and signage).
32. Soft-proofing preview against the production printer profile **[PRINT][INT]**.

### 3.4 CUT — explicitly not this tool

- **[CUT] Layered compositing, masks, blend modes** — multi-element composition is the Layout Editor's job. The Photo Editor has exactly one image plus flat overlays.
- **[CUT] Photo organization / cataloging** (the Elements Organizer half of the product) — files live with the order, not in a library.
- **[CUT] RAW processing** — walk-in files are phone JPGs/HEICs; RAW routes to Design Services.
- **[CUT] Generative AI imaging** (text-to-image, generative fill/expand) at launch — consistent with the suite-wide decision; AI is *assistive cleanup*, not creation. Revisit post-beta on feedback-tracker evidence.
- **[CUT] Full retouch suite** (frequency separation, liquify, dodge/burn brushes) — Design Services boundary.
- **[CUT] Multi-page anything** — multi-page files never open here; the router sends them to the correct tool.

---

## 4. UI requirements

### 4.1 Layout — one screen, task-first

- **Single-screen editor**: image canvas center, one **action rail** on the left organized by task verb (Crop & Straighten · Adjust · Fix for Print · Add Text/Logo · Clean Up · Export), contextual controls in a right panel that appears only when a tool is active. No floating palettes, no workspace configuration — the anti-Elements.
- **The three counter money-shots get dedicated, labeled, always-visible buttons**: **Fix Bleed**, **Fit to Size**, **Convert Format**. An associate who learns nothing else can still do 80% of the job.
- **Print-correctness strip** pinned above the canvas: current pixel dimensions, target print size, **effective DPI with green/amber/red state**, bleed status, color-profile note. Amber/red states are clickable and jump to the fix (advisory, never blocking — suite principle).
- Canvas shows **trim and bleed guides** whenever a target product/size is set, using the same guide visual language as the Layout Editor.

### 4.2 Interaction

- **Live preview on every adjustment** — sliders manipulate the on-screen proxy in real time (<100 ms response budget on the ProDesk; see §5.2 for how).
- **Before/after**: press-and-hold to peek at the original; split-slider view available.
- **Non-destructive history panel**: every operation is a named step ("Crop to 4×6," "Brightness +12," "Bleed expand 0.125″"); click any step to revert to that point; full undo/redo with standard shortcuts. Nothing is baked until export.
- **Direct manipulation for geometry**: drag crop handles with rule-of-thirds overlay, drag-rotate straighten with live grid, drag/scale/rotate handles on text and logo overlays — identical handle behavior to the Layout Editor canvas so skills transfer.
- **Highlight-to-change**: marquee or brush a region → floating toolbar (quick actions + prompt field). AI output always lands as a *previewed, approvable* history step — suggest, never auto-apply (suite AI principle).

### 4.3 Speed & feedback

- Open-to-editable in <2 s for a 12 MP photo; every P1 adjustment interactive at <100 ms on the proxy.
- Heavy operations (HEIC decode, upscale, background removal, full-res export) run **server-side and asynchronously** with a progress state — the canvas never freezes, and the associate can queue an export and return to FlightDeck. Directly answers the "one MPS station blocks order-taking" throughput complaint.
- Autosave the edit recipe continuously; a browser crash or station swap loses nothing.

### 4.4 Experience levels & learnability

- **Simple / Standard / Pro** surfaces per the suite-wide model — same file, same recipe, different control density. Simple shows the three money-shot buttons plus crop and auto-enhance; Standard adds the full P1 adjustment set; Pro adds levels/curves-lite and numeric entry everywhere.
- **Progressive disclosure, never amputation** — Pro controls are reachable from Standard, nothing is permanently hidden.
- **Inline quick-guides** on first use of color matching, bleed expansion, and DPI warnings (54.5% still ask for training; teach in context, not in a binder).
- Large touch-friendly targets, full keyboard-shortcut map for veterans, WCAG 2.1 AA contrast and focus order.

### 4.5 Suite consistency

- Shared design system with the rest of the suite (typography, iconography, guide colors, warning states), shared file header bar (order context, customer name when opened from an order **[INT]**), shared Export/Send-to-tool affordances.
- Export dialog and "Open in Layout Editor" present identical options wherever they appear in the suite — one mental model.

---

## 5. Claude Code implementation plan

### 5.1 Build sequence — E-tranches

Follows the suite model: vertical slices onto the walking-skeleton backbone, each independently testable and flag-gated. Engine choices below are **candidates to validate in E0**, per the stack-agnostic rule.

**E0 — Spike & decide (time-boxed)**
- Client render/interaction layer: validate **Canvas 2D via Konva** (already the layout-editor choice — reuse the interaction layer for crop handles and overlays) for the proxy-editing canvas on the ProDesk 600 G4 / UHD 630. Fallback question to answer: is WebGL (e.g. for live filter preview) reliable on UHD 630 fleet drivers, or does everything stay Canvas 2D?
- Server image engine: benchmark **sharp/libvips** (primary candidate: fast, low-memory, streaming) vs. ImageMagick (broadest format support, heavier CVE history) on the real-file corpus; **libheif** for HEIC decode; **littlecms/ICC** path for the CMYK-intent export.
- Upscale and background-removal models: evaluate self-hostable candidates (e.g. Real-ESRGAN-class upscaler, rembg/ONNX-class matting) for output quality vs. server cost; both are async server jobs, so client hardware is irrelevant here.
- *Exit gate:* engine decisions recorded with benchmark evidence on the hardware profile; proxy-edit latency <100 ms demonstrated; HEIC→JPG round-trip proven in the sandbox.

**E1 — Skeleton slice: open → view → crop → export**
- Intake from the shared routing engine (content-sniffed, sandboxed decode per §5.3); proxy generation server-side; Konva canvas with crop/rotate/flip/straighten; JPG/PNG export re-rendered server-side from the recipe at full resolution.
- Establishes the **edit-recipe architecture** (§5.2) end to end — this tranche is the proof that the proxy/recipe/re-render spine holds.
- *Exit gate:* a real customer photo goes open→crop→export on the store hardware profile; recipe replay is pixel-deterministic server-side; feature flag and kill-switch work.

**E2 — Tone & color + history UI**
- Brightness/contrast, auto-enhance, exposure/highlights/shadows/saturation/temperature; the history panel, undo/redo, before/after peek; autosave of recipes.
- *Exit gate:* every adjustment <100 ms on proxy; recipe round-trips through save/reload identically.

**E3 — Print correctness (the differentiator tranche)**
- Effective-DPI strip with warning states; resize with DPI math; **bleed expansion** (auto edge-fill strategy selection + override); fit-to-size with Fit/Fill/anchor (shared component with the Resize surface); print-safe export incl. image-wrapped PDF with trim/bleed boxes and ICC handling.
- **[INT]** Catalog product-size picker consumes the same product-spec service as the Layout Editor.
- *Exit gate:* bleed-expanded business-card image passes the imposition surface's cut-alignment check; exported PDF preflights clean; CMYK-intent export visibly corrects the Royal-Blue-class shift on the test corpus.

**E4 — Text, logo & removal**
- Text and image overlays on the Konva stage (reuse layout-editor text tooling); content-aware erase (server-side inpaint over the brushed mask, returned as a previewed step).
- *Exit gate:* overlay interaction parity with the layout canvas; erase quality acceptable on the corpus's real "remove the date stamp / old phone number" cases.

**E5 — Conversion & handoffs**
- Export-as with the full format matrix incl. HEIC ingest; "Open in Layout Editor" (recipe flattened, image handed off); send-to-imposition; oversize/multi-page routing enforcement tests.
- *Exit gate:* HEIC "Live" photo→printed 4×6 with zero external tools; a 60″ poster image provably cannot open here and lands in the Layout Editor.

**E6 — Assistive layer (P2 wave 1)**
- Color-matching helper, spot heal, red-eye, sharpen/noise, AI-artwork cleanup preset, low-res upscale; inline quick-guides.
- *Exit gate:* each ships behind its own flag with an accept/undo path; AI operations are content-only per the security checklist.

**E7 — Highlight-to-change + background removal + batch (P2 wave 2)**
- Region-scoped natural-language edits mapped onto recipe operations; background removal; batch recipe application.
- *Exit gate:* prompt-injection test suite passes (image-embedded text and metadata cannot steer the assistant); batch of 50 photos completes without blocking the station.

**E8 — Beta hardening**
- Order-integration write-back **[INT]** when the backbone write-path lands; telemetry review; feedback-tracker themes triaged into P3 decisions; load/perf regression suite on the fleet profile.

### 5.2 Architecture: the edit-recipe model (key decision for Claude Code)

**Non-destructive recipe, proxy-edit client, full-res render server.** The client never manipulates full-resolution pixels. On open, the server produces a screen-sized proxy; every user action appends a typed operation to an ordered **edit recipe** (crop, rotate, adjust{param}, overlay, erase{mask}, …) applied to the proxy in real time on the Canvas 2D/Konva stage. Export replays the same recipe server-side against the original at full resolution in the sandboxed engine.

This one decision satisfies four standing constraints at once: interactive speed on the UHD 630 (proxy-sized math only), the suite's **server-side rendering preference** (full-res work never touches the store PC), deterministic print output (the recipe is the single source of truth, replayed by one engine), and free autosave/history (the recipe *is* the history). The client and server must share a versioned recipe schema with golden-image tests proving client preview ≈ server output within tolerance.

### 5.3 Security requirements (binding, from `SECURITY_CONSIDERATIONS.md`)

- All decode/encode (libheif, libvips/ImageMagick, librsvg, libtiff) runs **out-of-process in the sandbox**: no network egress, scratch-jail filesystem, dropped privileges, seccomp, CPU/memory/time caps. These libraries are the documented CVE magnets [CRITICAL].
- Content-sniff every intake; ImageMagick `policy.xml` lockdown if selected; SVG rasterized with entities/scripts disabled; EXIF/metadata stripped or sanitized on export.
- AI features (highlight-to-change, cleanup, upscale) are **content-only** — no order/catalog/write API access; image-embedded text and metadata are treated as untrusted input to the prompt [CRITICAL][AI].
- Recipe schema is validated server-side; the client is untrusted.

### 5.4 Test & acceptance harness

- **Real-file corpus, photo edition**: phone HEICs (incl. Live photos), low-res logos, AI-generated art, scanned documents, screenshots, huge TIFFs, malformed/hostile files — drawn from actual counter submissions where possible.
- **Golden-recipe tests**: fixed recipes replayed on every build; pixel-diff against goldens for server renders, tolerance-diff for client proxies.
- **Hardware budget gates** (ProDesk 600 G4): open <2 s, adjust <100 ms, export queued without UI freeze — measured in CI against the fleet profile, per the suite's "real hardware, real files" principle.
- **Security tests**: hostile-file suite against the sandbox; prompt-injection suite for E6/E7.

### 5.5 Open questions

1. **Upscale/background-removal model hosting** — self-hosted GPU capacity vs. per-call external service; cost and data-handling review needed before E6. (Data-handling angle belongs in the formal security review.)
2. **CMYK export depth at launch** — ICC-transform export (E3) vs. deferring true soft-proofing (P3) until production printer profiles are available from the print-shop integration.
3. **Batch scope** — associate-only, or exposed on the customer self-service surface later? Affects E7 UI and the locked-guardrail model.
4. **Charging for edits** — the survey asks for "additional services / quick edits" pricing in Solution Builder; if pursued, the Photo Editor should emit an **edit-effort summary** (operations performed) to feed it. Needs a business owner; parking here so it isn't lost.

---

*Bottom line: the Photo Editor wins by being the opposite of Elements 2019 — instant, obvious, and print-correct on the hardware stores actually have. Three labeled buttons (Fix Bleed, Fit to Size, Convert Format) cover the counter's daily grind; a non-destructive recipe rendered server-side keeps it fast on the ProDesk and deterministic on press; and everything heavier than a single-image fix routes cleanly to the Layout Editor instead of growing here.*
