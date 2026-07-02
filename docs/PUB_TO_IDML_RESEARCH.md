# Microsoft Publisher (.pub) → IDML Converter — Research & Architecture

**Purpose:** Feasibility research and a recommended build plan for a `.pub → .idml` converter, intended to run as a Claude Code project.
**Verdict up front:** Feasible, and the hard half (parsing `.pub`) is already solved by open-source tooling. The novel work is the *generator* half — translating a parsed page-layout model into a valid IDML package. There is essentially one commercial precedent doing exactly this end-to-end (Markzware), and a clear open-source path that doesn't require reverse-engineering the binary format yourself.

---

## TL;DR

1. **Publisher's format is undocumented by Microsoft** — it was deliberately *excluded* from the Microsoft Open Specifications Promise, and Microsoft has repeatedly stated it has no plans to document it. So there is no `[MS-PUB]` spec to work from.
2. **But you don't need one.** `libmspub` (the Document Liberation Project library, also used inside LibreOffice and Scribus) already parses `.pub` files from Publisher 2000 onward and exposes their content as a structured, page-by-page, frame-by-frame drawing model. This is your front end.
3. **IDML is the opposite situation — fully documented and open.** It is a ZIP package of XML files. Adobe published a formal spec (the CS5 2010 PDF, still the best reference) plus an "IDML Cookbook." You generate IDML; you don't reverse-engineer it.
4. **Markzware is the proof of concept.** Their old *Pub2ID* plugin built InDesign documents live inside InDesign; their current products (*OmniMarkz* desktop, *MarkzPortal* cloud) emit **IDML directly** from `.pub`. Their published feature list doubles as your conformance checklist.
5. **Recommended architecture:** `.pub → libmspub (parse) → intermediate layout model → IDML generator → .idml ZIP`. Start by consuming libmspub's CLI trace output (`pub2raw`) so you can write the whole generator in Python/TypeScript with no C++; graduate to a native `librevenge` generator only if you need maximum fidelity.
6. **Timing context:** Microsoft retires Publisher in **October 2026**. After that, `.pub` files become progressively harder to open. This is a real, time-boxed migration driver — relevant if this is a product feature, not just a one-off tool.

---

## Part 1 — The source format: Microsoft Publisher `.pub`

### Is there an official specification?
No. This is the single most important fact for scoping the project:

- Publisher was **not** included in the Microsoft Open Specifications Promise that covers the rest of the Office binary formats (`[MS-DOC]`, `[MS-XLS]`, `[MS-PPT]`, etc.). As of multiple public statements (2009, 2016), Microsoft had **no plans** to document the `.pub` format, and none has appeared since.
- Apache POI's Publisher component (HPBF) states plainly that, as of their last assessment, there was no public format specification.

So all knowledge of the format is **community reverse-engineering**, not vendor documentation.

### What *is* known about the format (the reverse-engineered picture)
Despite the lack of a spec, the structure is reasonably well understood:

| Aspect | Detail |
|---|---|
| **Container (v1.0)** | A simple flat binary blob. Magic header `E7 AC 2C 00`. Rare today. |
| **Container (v2.0+, i.e. Publisher 2000 onward)** | **Microsoft Compound File Binary Format** (CFBF / OLE2 structured storage) — the same "file system in a file" container used by legacy `.doc`/`.xls`/`.ppt`. You open it like any OLE2 file and read named streams. |
| **Primary stream** | A `Contents` stream inside the OLE container. Magic headers: `E8 AC 22 00` (v2 / Publisher 2000), `E8 AC 2C 00` (Publisher 2002–2019). |
| **Drawing/graphics layer** | Uses **Escher** (a.k.a. the Office Drawing / `msofbt` records) — the same shape-container format used in older Office binary formats for autoshapes, images, text boxes, and positioning. |
| **Version marker (v11 / 2003+)** | The OLE container started carrying an OLE `DocumentSummaryInformation` stream that includes a version number. |
| **`.puz` files** | Publisher's "pack and go" archive for moving a publication (with linked assets/fonts) to another machine or a print bureau. These are actually **Microsoft Cabinet (CAB) archives** — unpack with any CAB tool, then you have `.pub` + assets inside. |

**Practical implication:** parsing `.pub` is a two-layer problem — (1) walk the OLE2 container, (2) decode the Escher/Contents records inside. Both layers are already implemented in `libmspub`. You almost certainly should not write this yourself.

### Reverse-engineering resources (if you ever need to go below `libmspub`)
- **`libmspub` source** — by far the most complete and current implementation; this *is* the de facto documentation of the format.
- **Apache POI HPBF** — Java implementation + a written "Guide to the Publisher File Format" describing streams and records. Good prose companion to the code.
- **"Just Solve the File Format Problem" wiki — Microsoft Publisher page** — concise summary of magic numbers, container versions, and the `.puz`/CAB detail.
- **OLEToy** — a Python visualizer for OLE2/Escher-style binary formats; useful for poking at individual `.pub` files byte-by-byte during debugging.
- **Steve Parker's reverse-engineering log** — historical, now largely superseded by `libmspub`, but documents the "feel" of the format (text + positioning interleaving, bold/normal encoding quirks).

---

## Part 2 — Parsing `.pub` in practice: `libmspub`

### What it is
`libmspub` is an import-filter library that reads Microsoft Publisher files. It is:
- Part of the **Document Liberation Project** (the same family as `libvisio`, `libcdr`, `libpagemaker`, `libqxp`, `libfreehand`, `libetonyek`).
- The Publisher import filter used by **LibreOffice** *and* **Scribus** (the open-source DTP app). That second point matters: Scribus is an existing, shipping product that imports `.pub` via `libmspub`, which is strong evidence the parse fidelity is production-grade.
- Written in C++ (~91% of the repo), MPL-2.0 licensed.
- Built on **`librevenge`** (the DLP's common "document interface" abstraction) and depends on `boost`, `icu`, `librevenge`, and `zlib`.

### Coverage
- **Publisher 2000 and newer: supported.**
- **Publisher 95–98: limited / partial import.**
- Handles the modern OLE2-container versions you'll encounter in practice.

### The crucial part: how `libmspub` exposes content
`libmspub` does not emit a file — it **drives a `librevenge` "drawing" interface** with a stream of callbacks. (Publisher is a page-layout/vector format, so it uses the *drawing* interface — `librevenge::RVNGDrawingInterface` — rather than the word-processor text interface. Verify the exact entry point against the installed header, e.g. `libmspub/libmspub.h` / `MSPUBDocument.h`, but the shape of the API is stable.)

You hand `libmspub` an input stream and a "painter" object implementing the drawing interface. As it parses, it calls methods on your painter in document order. The callback vocabulary is, in essence:

| Callback (drawing interface) | Meaning | What it carries |
|---|---|---|
| `startDocument` / `endDocument` | Document bounds | metadata |
| `startPage` / `endPage` | One page | `svg:width`, `svg:height`, etc. |
| `startLayer` / `endLayer` | A layer | layer props |
| `setStyle` | Current fill/stroke style | color, line, gradient |
| `drawRectangle` | A rectangle shape | `svg:x/y/width/height`, corner radii |
| `drawEllipse` | An ellipse | center + radii |
| `drawPolygon` / `drawPolyline` | Polygonal shape | point array |
| `drawPath` | Arbitrary vector path | path segments |
| `drawGraphicObject` | An embedded **image** | position + MIME type + binary data |
| `startTextObject` / `endTextObject` | A **text frame** | frame position & size |
| `openParagraph` / `closeParagraph` | A paragraph | alignment, indents, spacing |
| `openSpan` / `closeSpan` | A text run | font name, size, color, weight, style |
| `insertText` | Literal text | the string |
| `insertLineBreak` / `insertTab` | Inline breaks | — |
| `openTable` / `openTableRow` / `openTableCell` … | Tables | geometry + cell content |
| `openUnorderedListLevel` / `openListElement` … | Lists | list structure |

**This vocabulary maps almost one-to-one onto IDML constructs** (see Part 5). That correspondence is what makes this project tractable.

### The CLI tools (your pragmatic on-ramp)
`libmspub` ships command-line converters (packaged as `libmspub-tools` on most distros):

- **`pub2raw`** — runs the parse and **prints the entire callback sequence** (every `startPage`, `startTextObject`, `openSpan`, property list, etc.) as a structured textual trace. This is effectively "the whole document as a serialized event log." **For a converter, this is gold:** you can parse this trace in *any* language and translate it to IDML without writing or compiling a line of C++.
- **`pub2xhtml`** — renders the publication to XHTML with inline CSS positioning and **base64-embedded images**. Useful as a cross-check, for image extraction, and for a quick visual sanity render, though it flattens some layout fidelity.
- (Some historical builds also shipped `pub2svg`, producing one SVG per page. SVG preserves geometry well and is a useful intermediate/preview, but loses text editability and frame threading.)

Install (examples):
```bash
# Debian/Ubuntu
sudo apt install libmspub-tools libmspub-dev
# macOS (Homebrew has libmspub; MacPorts ships tools)
brew install libmspub        # library
sudo port install libmspub   # library + pub2raw/pub2xhtml

# Smoke test
pub2raw input.pub > trace.txt
pub2xhtml input.pub > preview.html
```

### Strategies for using `libmspub` from a non-C++ stack
Your project will likely be Python or TypeScript. Three options, cheapest first:

1. **Shell out to `pub2raw` and parse the trace.** Zero C++. Fastest path to a working prototype. The trace is verbose but deterministic and complete. **Recommended starting point.**
2. **Write a thin native generator.** Implement your own `librevenge` drawing-interface subclass (an "IDML generator") in C++ that `libmspub` drives directly, emitting IDML. This is the highest-fidelity, "do it properly" approach and mirrors how LibreOffice's `writerperfect` implements ODF generators. Compile it as a CLI your app invokes. More work; best output.
3. **FFI bindings.** Wrap `libmspub` (plus a small C shim) and call it from Python via `ctypes`/`cffi` or from Node via N-API. Middle ground; more plumbing than #1, less than a full generator.

---

## Part 3 — The target format: IDML

### What it is
IDML (InDesign Markup Language) is Adobe InDesign's **open, documented, backward-compatible interchange format**, as opposed to the version-specific binary `.indd`. Key properties:

- It is a **ZIP archive** (Adobe calls it a "package") containing a tree of XML files plus assets. Rename `.idml` → `.zip` and unzip to inspect.
- It can **fully express** the content of a native InDesign document — text, styles, geometry, color, images, master pages, layers. This is why round-tripping and programmatic generation work.
- It can be **read and written without InDesign**, and opened by other apps including **Scribus** and **Affinity Publisher** (handy for free validation — see below).

### Internal structure (what you'll generate)
A minimal-but-valid IDML package looks like this:

```
mybook.idml (ZIP)
├── mimetype                      # first entry, stored (uncompressed); literal MIME string
├── designmap.xml                 # the manifest: ties all parts together, lists spreads/stories/resources
├── META-INF/
│   └── container.xml             # points to designmap.xml
├── Resources/
│   ├── Fonts.xml                 # FontFamily / Font definitions
│   ├── Styles.xml                # Paragraph, Character, Object, Table, Cell styles
│   ├── Graphic.xml               # Colors, Swatches, Gradients, Tints, Inks
│   └── Preferences.xml           # document/view/transparency preferences
├── MasterSpreads/
│   └── MasterSpread_*.xml        # master pages
├── Spreads/
│   └── Spread_*.xml              # page geometry + page items (frames, rectangles, images…)
├── Stories/
│   └── Story_*.xml               # text content + inline formatting, one per text flow
└── XML/
    ├── BackingStory.xml
    └── Tags.xml                  # (only needed if you use the XML structure feature)
```

Key facts for a generator:
- **`designmap.xml` is the spine.** It declares the document and references every `idPkg:Spread`, `idPkg:Story`, `idPkg:Graphic`, `idPkg:Fonts`, `idPkg:Styles`, etc. Get this wrong and InDesign rejects the package.
- **Everything has a `Self` ID.** Every object (`<Spread Self="ub2">`, `<TextFrame Self="u1e4">`, `<Story Self="u1e3">`…) carries a unique `Self` attribute, and cross-references use those IDs (e.g. a `TextFrame` names its `ParentStory`). Your generator must mint and track unique IDs consistently.
- **Namespaces & version.** Packaging parts use `xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"`, and a `DOMVersion` attribute encodes the InDesign target (e.g. `8.0` for CS6-era, `17.0` for 2022-era). Pick a `DOMVersion` that matches the audience's InDesign; lower = broader compatibility.
- **Coordinate system is points** (1/72"), with a spread origin convention (by default related to the spine/binding; a US-Letter page is 612 × 792 pt). Page items are positioned via a `<Properties><PathGeometry>` (geometric bounds / path point array) **plus** an `ItemTransform` attribute — a 6-value affine matrix `(a b c d tx ty)`. Translating Publisher's absolute frame coordinates into `ItemTransform` + geometry is the core geometry task; the Cookbook's page-builder examples show exactly how the origin offset works.

### Text model (the part most likely to bite)
Inside a `Story_*.xml`:
```
<Story>
  <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/...">
    <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/..." PointSize="12" FillColor="Color/...">
      <Content>Actual text goes here</Content>
      <Br/>                            <!-- forced line break -->
    </CharacterStyleRange>
  </ParagraphStyleRange>
</Story>
```
- A **Story** is a text flow. A **TextFrame** (a page item on a Spread) *references* a Story via `ParentStory`.
- **Threaded / linked text boxes** (Publisher's "continued on page X" chains) are represented by **multiple TextFrames sharing one ParentStory**, linked with `PreviousTextFrame` / `NextTextFrame`. This is the correct target for Publisher's linked text boxes.
- Formatting is expressed as nested `ParagraphStyleRange` → `CharacterStyleRange` with either an applied named style or direct property overrides. The simplest generator can lean on overrides and a couple of default styles; a nicer one synthesizes named styles.

### The IDML specification — where to actually get it
This is mildly annoying because Adobe has let the public links rot:
- **Adobe InDesign IDML File Format Specification (CS5, 2010 PDF)** — the *formal* element/attribute reference. **This 2010 edition is the most complete and is the one to use.** (The 2012 CS6 edition exists but contains little additional substance.)
- **Adobe InDesign Markup Language (IDML) Cookbook** — the informal "how-to," with worked examples (the page-builder sample is especially useful for geometry/origin handling).
- **Both ship inside the InDesign Plugin SDK** (`docs/` / `docs/html` folder). Downloading the SDK is the canonical way to get current docs.
- Because the on-Adobe links are flaky, community experts (e.g. Mike Witherell) host mirrors of the 2010 CS5 PDF. Search "Adobe InDesign IDML File Format Specification CS5 PDF" if the SDK route is inconvenient.

### Tooling for *writing* IDML
- **SimpleIDML** (`pip install SimpleIDML`, Starou/SimpleIDML on GitHub) — a mature Python library for manipulating IDML packages. Production-proven (Le Figaro / FigaroClassifieds). **Strengths:** opening/inspecting IDML, **composing** multiple IDML files into one, and **injecting** content into an IDML's XML structure via XPath. **Critical limitation for you:** it is designed for *template + data composition*, **not** for authoring brand-new layout geometry and text styling from scratch. (The related PDF2IDML project hit exactly this wall: "SimpleIDML can not edit layout and text style.")
  - **How to use it well:** if your Publisher documents fall into a small number of *templates* (newsletter, flyer, tri-fold, business card), build those IDML templates once, then use SimpleIDML to pour parsed Publisher content into the template's tagged structure. For arbitrary/freeform `.pub` layouts, you'll be authoring geometry directly and SimpleIDML becomes just a convenient ZIP/XML helper rather than the engine.
- **Hand-rolled writer** — because IDML is "just" a ZIP of XML, a templated XML writer (Jinja2 / lxml in Python; a builder in TS) is entirely viable and gives you full control over geometry and styling. This is what a from-scratch converter ultimately needs.
- **PDF2IDML** (yzyly1992/PDF2IDML) — not for `.pub`, but read it anyway: it's a documented attempt at the same *pattern* (foreign format → IDML in Python) and lays out the two viable roads — `source → XML → IDML` vs. `source → raw data → rebuild IDML` — and the tradeoffs. Good prior art for your design doc.

### Validation without buying InDesign
You don't need an InDesign license to verify output during development:
- **Scribus** opens IDML and can flag structural problems.
- **Affinity Publisher** imports IDML and will surface layout/text fidelity issues quickly and visually.
- **InDesign itself** is the final word, but use the free tools for the tight inner loop.
- (If you ever need *programmatic* InDesign rendering/round-trip — e.g., IDML→PDF/INDD at scale — SimpleIDML can drive an **InDesign Server** via SOAP, but that's a licensed, heavyweight dependency and is not needed for the core converter.)

---

## Part 4 — How the existing converter does it: Markzware

Markzware is the reference implementation in this space and worth studying because they've solved the exact end-to-end problem commercially.

### Generation 1 — Pub2ID (discontinued)
- An **InDesign plugin** (CS3/CS4, later CS6). You ran `File → Open` (or a Markzware menu item) on a `.pub`, and it **built the InDesign document live, in memory, via InDesign's own SDK/object model** — i.e., it didn't write IDML, it scripted InDesign to recreate the layout directly as `.indd`.
- Trade-off: required InDesign to be installed and running; tied to specific InDesign versions; eventually discontinued.

### Generation 2 — OmniMarkz / MarkzPortal (current)
- Markzware moved to **standalone converters that emit IDML directly**, with **no InDesign dependency**:
  - **OmniMarkz** — desktop app.
  - **MarkzPortal** — cloud/online conversion.
- Their marketing explicitly states these now "Convert Microsoft Publisher to IDML, Online & Offline." **This is precisely the architecture you want to build** — parse `.pub`, emit IDML as the interchange artifact, let any InDesign open it.
- They also ship **DesignMarkz** (Publisher → Canva) and a family of converters (IDMarkz, QXPMarkz, PDFMarkz) — useful context that IDML is their universal interchange hub.

### Markzware's supported-elements list = your conformance checklist
Across their Pub2ID/OmniMarkz materials, the elements they convert from Publisher are:

- [ ] **Page size** (per-page dimensions)
- [ ] **Object positioning** (absolute frame placement)
- [ ] **Color models** (RGB / CMYK / spot)
- [ ] **Fonts** (with a **missing-font remap** step on open)
- [ ] **Text attributes** (size, weight, style, leading, color)
- [ ] **Tables**
- [ ] **Text flow** (within and across frames)
- [ ] **Layers**
- [ ] **Text wrap** (runaround)
- [ ] **Linked text boxes** (threaded stories)
- [ ] **Embedded images** — extracted to a folder and **linked** into the output (rather than all embedded inline)

### Real-world fidelity notes (from practitioners)
- Conversion is **approximate, not pixel-perfect** — and even an approximate conversion is dramatically faster than rebuilding a document by hand (the historical reason designers dreaded receiving `.pub`).
- Observed Pub2ID quirks worth pre-empting in your own output: heavy use of **Text Wrap**, and a tendency to **fill text frames with a white background** (watch for this when frames overlap). Bake sane defaults so your output doesn't inherit these surprises.
- **Always include a post-conversion proofing step** and a font-remap pass — Markzware explicitly recommends proofing every converted file.

---

## Part 5 — Recommended architecture for your converter

### Pipeline
```
.pub
  │  (OLE2 + Escher decoding — DO NOT hand-write; use libmspub)
  ▼
libmspub  ──drives──►  drawing-interface callbacks
  │
  │  Option A (start here): capture via `pub2raw` → parse the trace
  │  Option B (later):      native librevenge "IDML generator" consumes callbacks directly
  ▼
Intermediate Layout Model        (your own clean data structures:
  Document → Pages → Frames →     Page{size}, TextFrame{bbox, transform, story},
  {TextRuns | Shapes | Images})   Shape{geometry}, Image{bbox, bytes, mime},
  │                               Run{text, font, size, color, …}, threading links)
  ▼
IDML Generator
  • mint Self IDs, build designmap.xml
  • Spreads/ (pages + page items + ItemTransform/PathGeometry)
  • Stories/ (paragraph/character ranges + Content)
  • Resources/ (Fonts, Styles, Graphic/colors, Preferences)
  • extract images → package assets + <Link>/<Image>
  • thread linked frames (Prev/NextTextFrame, shared ParentStory)
  ▼
ZIP as .idml  (mimetype first & stored; then META-INF/, designmap.xml, parts)
  ▼
Validate in Scribus / Affinity Publisher / InDesign
```

**Why an intermediate model rather than trace→IDML directly:** it decouples the messy parse from the messy generate, lets you unit-test each half independently, and makes the geometry/threading logic (the genuinely hard part) testable in isolation.

### The mapping (this is the heart of the converter)

| Publisher concept (via libmspub callback) | IDML target |
|---|---|
| `startPage` (w, h) | a `<Spread>` containing a `<Page>` with `GeometricBounds` + `ItemTransform` |
| `startTextObject` (frame bbox) | a `<TextFrame Self ParentStory>` page item (PathGeometry + ItemTransform) **and** a `Story_*.xml` |
| `openParagraph` (align, indents) | `<ParagraphStyleRange AppliedParagraphStyle … overrides>` |
| `openSpan` (font, size, color) | `<CharacterStyleRange …>` with `PointSize`, `FillColor`, `AppliedFont`, etc. |
| `insertText` | `<Content>…</Content>` |
| `insertLineBreak` | `<Br/>` |
| `drawRectangle` | `<Rectangle>` page item (+ optional `<Image>` fill) |
| `drawEllipse` | `<Oval>` page item |
| `drawPolygon` / `drawPath` | `<Polygon>` / `<GraphicLine>` page item with PathGeometry |
| `drawGraphicObject` (image bytes) | a `<Rectangle>` holding an `<Image>`/`<EPS>`/`<PDF>` + `<Link>` to an extracted asset |
| Linked text boxes (story continues) | multiple `<TextFrame>`s sharing one `ParentStory`, joined by `Prev/NextTextFrame` |
| Fill/stroke color (`setStyle`) | `<Color>`/`<Swatch>` in `Graphic.xml`, referenced by ID |
| Font name | `<FontFamily>`/`<Font>` in `Fonts.xml` (+ remap-on-open behavior) |
| `openTable…` | `<Table>` inside the owning Story |
| Layers | IDML `<Layer>` entries in `designmap.xml`, referenced by `ItemLayer` |

### Suggested milestone plan
1. **Spike — geometry only.** `pub2raw` on a one-page `.pub` → emit an IDML with correctly sized/positioned **empty** rectangles for every frame. Open in Affinity/Scribus. *Goal: prove the ZIP structure, `designmap.xml`, and the coordinate/`ItemTransform` math.*
2. **Unformatted text.** Add TextFrames + Stories with plain `<Content>` (single default paragraph/character style). *Goal: text lands in the right boxes.*
3. **Character & paragraph formatting.** Map fonts, sizes, colors, weights, alignment, leading → ranges + Fonts/Styles/Graphic resources.
4. **Images.** Extract embedded raster data, write package assets, link via `<Image>`/`<Link>`. (Use `pub2xhtml`'s base64 output as a cross-check.)
5. **Threading.** Linked text boxes → shared ParentStory + Prev/Next frame links. (Highest-value differentiator; also the trickiest.)
6. **Tables, lists, text wrap, layers.**
7. **Color fidelity.** Spot/CMYK swatches, tints; correct ink definitions.
8. **Master pages**, then a **font-remap report** and a **preflight/QA pass** over output (this is squarely in your wheelhouse).

### Build/runtime notes for a Claude Code project
- The only non-trivial system dependency is `libmspub` + `libmspub-tools` (which pull in `librevenge`). On Linux CI: `apt install libmspub-tools`. Containerize this so the toolchain is reproducible.
- Core converter in **Python** pairs well: `lxml`/Jinja2 for IDML XML, `Pillow` for image transcoding, and `subprocess` to call `pub2raw`/`pub2xhtml`. SimpleIDML is an optional helper (best if you adopt the template-injection strategy).
- TypeScript is equally viable for the generator; you'd still shell out to the C++ `libmspub` tools.

---

## Part 6 — Risks, gotchas & conformance checklist

**Top risks**
- **Fonts.** Publisher embeds/uses fonts you may not have. IDML can *reference* fonts without supplying them; plan a **missing-font remap** step and emit a report (mirror Markzware's behavior). Don't try to embed fonts you don't have rights to.
- **Text threading.** Getting Prev/Next frame links + shared story right is the difference between "editable InDesign doc" and "disconnected text boxes." Budget real time here.
- **Color models.** Publisher mixes RGB/CMYK/spot. Decide your swatch strategy early; preserve spot colors by name where possible (print workflows care).
- **Geometry & origin.** The `ItemTransform` + spread-origin convention is the most common source of "everything is offset/mirrored" bugs. Nail it in Milestone 1 with the Cookbook's page-builder example as reference.
- **Overset text.** Publisher's autofit vs. InDesign's fixed frames differ; text may overflow after conversion. Flag overset frames in a preflight report rather than silently clipping.
- **Encoding / RTL / special characters.** Trust ICU-decoded text from `libmspub`; preserve Unicode end-to-end in the XML.
- **The "white fill" / "text wrap" surprises** noted from Pub2ID output — set deliberate defaults so you don't reproduce them.

**Conformance checklist (acceptance criteria)** — borrow Markzware's list:
page size · positioning · color models · fonts (+ remap) · text attributes · tables · text flow/threading · layers · text wrap · linked text boxes · embedded-image extraction & linking · *(plus your own:)* overset/preflight report · round-trip opens cleanly in InDesign.

---

## Part 7 — Why now: the October 2026 driver

- Microsoft is **retiring Publisher in October 2026.** Per Microsoft's own support guidance: support for the perpetual version ends **October 1, 2026** (tied to Office LTSC 2021 end-of-support), and Publisher will be **removed from Microsoft 365** around the same time (some communications cite October 13, 2026). Microsoft 365 subscribers will no longer be able to open or edit `.pub` files in Publisher.
- Perpetual installs (Office 2019/2021 Pro / Pro Plus) will likely still *run* Publisher afterward, but **unsupported, with no security fixes.** Publisher is **not** in Office 2024.
- Microsoft's official recommendation is to **convert `.pub` files to other formats before the deadline** (they suggest PDF, with PowerShell for bulk export). PDF is lossy/non-editable, which is exactly the gap a `.pub → IDML` converter fills for anyone who wants their content to stay **editable** in a modern layout tool.
- The commercial players are already converging on this event (Markzware is actively marketing Publisher migration, including `.pub → IDML` and `.pub → Canva`). If this converter is a product/feature rather than a one-off, there is a real, time-boxed demand window.

---

## Part 8 — Curated references

**Publisher format (reverse-engineering)**
- `libmspub` — git mirror: https://github.com/LibreOffice/libmspub · DLP wiki: https://wiki.documentfoundation.org/DLP/Libraries/libmspub
- Apache POI HPBF (Java + format guide): https://poi.apache.org/components/hpbf/
- Just Solve the File Format Problem — MS Publisher: http://justsolve.archiveteam.org/wiki/Microsoft_Publisher
- Document Liberation Project (library family, incl. OLEToy): https://www.documentliberation.org/projects/

**IDML (target format)**
- Adobe InDesign IDML File Format Specification (CS5, 2010) + IDML Cookbook — ship in the InDesign Plugin SDK; community mirror of the 2010 PDF commonly hosted (search the exact title).
- "Inside IDML" walkthrough: https://www.idml.dev/en/inside-idml.html
- SimpleIDML (Python IDML manipulation): https://github.com/Starou/SimpleIDML · https://pypi.org/project/SimpleIDML/
- PDF2IDML (prior-art pattern, Python): https://github.com/yzyly1992/PDF2IDML

**Existing converter (precedent)**
- Markzware Pub2ID (legacy plugin approach): https://markzware.com/pub2id/
- Markzware OmniMarkz / MarkzPortal (current, `.pub → IDML`): https://markzware.com/
- Practitioner review of Pub2ID fidelity: https://www.graphic-design-employment.com/convert-publisher.html

**Publisher retirement**
- Microsoft — "Publisher will no longer be supported after October 2026": https://support.microsoft.com/en-us/publisher/microsoft-publisher-will-no-longer-be-supported-after-october-2026

---

*Bottom line: the parse is a solved problem (`libmspub`), the target is fully documented (IDML), and there is a working commercial precedent (Markzware OmniMarkz/MarkzPortal). The build reduces to writing a faithful IDML **generator** over `libmspub`'s output — start by parsing the `pub2raw` trace into an intermediate model, prove the geometry on a one-page file, then layer in text, styles, images, and threading against Markzware's feature list as your acceptance criteria.*
