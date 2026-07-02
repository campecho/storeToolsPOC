# Design Document — Desktop Publishing Application

**Working title:** Project Compose (placeholder)
**Document type:** Product / Engineering Design Document
**Status:** Draft v0.1
**Author:** Jennifer Allen, Sr Mgr Product Management
**Last updated:** 2026-06-24

---

## 1. Overview

### 1.1 Purpose
This document defines the features and capabilities for a new professional desktop publishing (DTP) application. The product is positioned as a **modern replacement for Microsoft Publisher**, which reaches end of support in October 2026, and is benchmarked against **Affinity Publisher** for layout, typography, and print-production quality.

The defining differentiator versus Affinity is **native Microsoft Publisher (`.pub`) import**: Affinity cannot open `.pub` files at all, forcing manual rebuilds. This product will open existing Publisher documents directly, making it the lowest-friction migration path for the millions of organizations leaving Publisher.

### 1.2 Vision statement
> A professional-grade page layout tool that opens your old Publisher files on day one, matches Affinity on print quality and typography, and removes the migration tax that blocks every other replacement.

### 1.3 Strategic differentiators
1. **Native `.pub` import** — open and convert legacy Publisher files with high fidelity (no other major DTP tool does this).
2. **Approachable-to-professional curve** — Publisher-class simplicity for casual users, with a clear path up to professional layout features.
3. **Print-shop-ready output** — true CMYK, spot/PANTONE, PDF/X export, and preflight, matching the Affinity benchmark.
4. **Predictable, enterprise-friendly licensing** — perpetual/owned licensing with no mandatory third-party account tie-in (a direct contrast to the post-Canva Affinity model).

---

## 2. Goals & non-goals

### 2.1 Goals
- Deliver feature parity with Affinity Publisher on core layout, typography, color, and print production.
- Provide best-in-class `.pub` import that preserves text, layout, images, and styling with measurable fidelity.
- Offer a migration experience that lets a Publisher user become productive in under one hour.
- Provide broad platform reach for in-store associates. *(Target platforms and delivery model — native desktop, web/browser-based, or hybrid — are not yet decided; see §11.)*
- Ship a data merge engine that covers Publisher's mail merge / catalog merge use cases.

### 2.2 Non-goals (v1)
- Full Adobe InDesign feature parity (advanced GREP styles, scripting marketplace, deep print-house imposition).
- Real-time multi-user co-editing (planned post-v1).
- Native `.indd` import (IDML interchange only, consistent with industry norms).

### 2.3 Success metrics
| Metric | Target |
|---|---|
| `.pub` import visual fidelity (automated diff vs. source render) | ≥ 90% element-level fidelity |
| Time-to-first-successful-document for ex-Publisher user | < 60 minutes |
| Print-ready PDF/X export success rate (passes print-shop preflight) | ≥ 98% |
| Crash-free session rate | ≥ 99.5% |
| Migration of a 20-page Publisher newsletter | < 15 minutes incl. cleanup |

---

## 3. Target users & use cases

### 3.1 Target user profile
Our users are **in-store retail associates** with a wide range of design skill and tenure. They are not professional designers — design is one task among many in their day. The product must serve both ends of a broad spectrum *simultaneously*:

- **Veterans (20+ years on Publisher):** deeply fluent, want *all* the features and tools available. Value speed, density, keyboard-driven workflows, and full manual control. They will resent anything that hides or dumbs down capability.
- **Novices (brand new, no design training):** need simple, guided, task-oriented tools and **AI-assisted help** ("help me make a sign," "fix the spacing"). Easily overwhelmed by a dense professional UI.
- **The in-between majority:** occasional creators who want a good-looking result quickly without learning the whole tool.

The core UX challenge is serving all three without forcing the novice into a pro cockpit or capping the veteran's ceiling. See **3.3 Experience model**.

### 3.2 Representative use cases
- **Novice, AI-assisted:** "Help me make a promo sign for an in-store event" — guided, template- and AI-driven, minimal manual layout.
- **Novice → intermediate:** Open a legacy `.pub` flyer, update the text and image, export a print-ready PDF.
- **Intermediate:** Lay out a tri-fold brochure on a baseline grid with linked text frames.
- **Pro:** Build a multi-page catalog driven by a product spreadsheet (data merge with images).
- **Pro:** Generate personalized signage, shelf talkers, or event badges in bulk from a CSV.

### 3.3 Experience model (novice → pro)
The application uses a **single document model with multiple experience layers**, so a file created by a novice can be opened and refined by a veteran — and vice versa — without conversion or feature loss.

- **Modes / workspaces:** selectable experience levels — e.g. **Simple** (curated, task-first toolset), **Standard**, and **Pro** (full panel set, every tool exposed). Users switch at any time; mode changes the UI surface, never the underlying file.
- **Progressive disclosure:** advanced controls remain present but tucked behind "more options" affordances in lower modes, and are fully surfaced in Pro. Nothing is permanently hidden — the ceiling is always reachable for the curious novice.
- **Alternate tool layouts:** customizable, savable workspace layouts (panel arrangement, toolbars, shortcuts). Ship a **Publisher-familiar** layout + shortcut map for veterans, and a streamlined layout for novices.
- **AI-assisted creation & help (novice-first):**
  - Natural-language task help ("make me a sign for a sidewalk sale," "make this fit on one page").
  - Smart suggestions: layout/spacing fixes, font pairing, brand-color application, image placement.
  - Guided, conversational onboarding and in-context tips.
  - AI is **assistive and optional** — fully bypassable so pros can ignore it entirely.
- **Templates as the on-ramp:** a rich, retail-relevant template gallery (signage, shelf talkers, flyers, price cards) so novices start from a finished-looking result.
- **Graceful skill growth:** discoverable hints nudge users from Simple toward more capability as they're ready, without ever blocking them.

---

## 4. Core capabilities

> Benchmarked against Affinity Publisher. Each area notes parity targets and where we intend to exceed the benchmark.

### 4.1 Document & page model
- Multi-page documents with **facing pages / spreads** and single-page modes.
- **Master pages** ("smart" masters): reusable layouts, multi-master support, per-page overrides, master inheritance.
- Page sizes, custom dimensions, mixed page sizes within a document, page rotation.
- **Sections** with independent page numbering, prefixes, and restart rules.
- Document presets (US Letter, A4, business card, brochure, booklet, etc.).
- Bleed, margins, and slug areas as first-class document properties.

### 4.2 Layout & design aids
- **Layout grids** and **column guides** (per-page and per-master).
- **Baseline grids** — document-wide *and* per-text-frame, aligning baselines across linked and independent frames (Affinity parity).
- Snapping (to guides, grids, objects, geometry), smart alignment guides, and distribution tools.
- Rulers, custom guides, guide manager.
- Layers panel with groups, lock/hide, and per-layer opacity/blend.
- Pasteboard / scratch area for off-canvas assets.

### 4.3 Text & typography
- **Frame text** (linked text frames with autoflow) and **artistic/point text**.
- **Text threading** across frames and pages with overflow indicators.
- **Live text wrap** around objects and images (with contour/alpha-based wrap).
- Paragraph and character **styles** with hierarchy, based-on inheritance, and quick-apply.
- Full **OpenType** support: ligatures, stylistic sets, contextual alternates, small caps, oldstyle figures.
- **Variable font** support.
- Drop caps, tab stops, leaders, hyphenation & justification controls, optical kerning, tracking, baseline shift.
- Bulleted/numbered lists with custom list styles.
- Footnotes and endnotes; running headers; cross-references (stretch goal).
- Spell check and grammar hints; find/replace incl. style-aware and regex find.

### 4.4 Tables
- Native table tool with row/column structure, cell merging/splitting.
- Cell and table styles, alternating row formatting, cell insets, borders, fills.
- Import tables from spreadsheets/CSV; basic in-table formatting.

### 4.5 Objects, vectors & images
- Shape and pen/curve tools (vector primitives, Bézier editing, boolean operations).
- Image frames with fit modes (fill, fit, stretch), non-destructive crop, and placeholder frames.
- **Linked vs. embedded** images with a resource manager (relink, update, collect-for-output).
- Non-destructive adjustments, effects (shadow, glow, outline), and blend modes.
- Vector and raster brushes; gradients (linear, radial, conical); transparency.

### 4.6 Color management & print production *(benchmark-critical)*
- **Color models:** RGB, **CMYK**, grayscale, LAB.
- **Spot colors** and **PANTONE** library support; global/document swatches.
- ICC color profile assignment and soft-proofing.
- **Registration marks** (registration black across all plates), **printer's marks**, crop marks.
- **Bleed** management and overprint controls.
- **Preflight panel** — live and on-export checks (overflow text, missing/low-res images, RGB-in-CMYK warnings, missing fonts) with severity levels and click-to-fix.
- **Overprint preview** and separations preview (stretch goal).

### 4.7 Data merge *(Publisher mail/catalog merge replacement)*
- Merge from **CSV, TSV, XLSX, and JSON** data sources.
- **Text token** insertion and **image merge** (field-driven image swapping).
- **Conditional logic** (show/hide content based on field values).
- Repeating records across a layout (catalog/grid merge) and one-record-per-page (badges, certificates).
- Live preview of merged records; export to print or per-record PDF.
- *Note: Affinity restricts data merge to its desktop app. Whether a comparable platform constraint applies here depends on the final delivery model (TBD).*

---

## 5. File format support

### 5.1 Flagship: Microsoft Publisher import
This is the product's primary wedge. Requirements:

- **Open `.pub` files directly** (Publisher 2007–2021 / Microsoft 365 binary formats).
- **High-fidelity conversion** of:
  - Page geometry, sections, and master pages.
  - Text content, fonts, paragraph/character formatting, and text frames/flow.
  - Images (embedded and linked), shapes, and WordArt-style objects (mapped to closest native equivalent).
  - Tables, color fills, and basic effects.
- **Import report**: a post-import summary flagging anything that could not be perfectly mapped (substituted fonts, unsupported effects, RGB→CMYK shifts) so the user knows exactly what to review.
- **Batch import**: convert a folder of `.pub` files (template-library migration) in one operation.
- **Font handling**: detect and remap missing fonts with a guided substitution dialog.

> **Engineering note:** `.pub` is a proprietary, undocumented Microsoft binary format. Plan for a dedicated parser/reverse-engineering effort, a conformance test corpus of real-world `.pub` files, and a fidelity-scoring harness (render source in a reference environment, diff against our render). This is the hardest and most defensible part of the product.

### 5.2 Other import formats
- **PDF** (open/place), **PSD**, **AI**, **SVG**, **TIFF**, **EPS**, **IDML** (InDesign interchange; no native `.indd`), **DWG/DXF** (stretch).
- Common images: JPG, PNG, GIF, WEBP, HEIC.
- Word/RTF text import for content reuse.

### 5.3 Export formats
- **PDF/X-1a, PDF/X-3, PDF/X-4** (print) and standard/interactive PDF (digital).
- Image export: PNG, JPG, TIFF, SVG, EPS (per-page, per-spread, or per-object/slice).
- **ePub** (reflowable/fixed-layout) — stretch goal.
- Package/collect-for-output (gathers document + linked assets + fonts).

### 5.4 Native format
- Open, documented native file format (proposed `.cdoc`), with forward/backward-compatibility policy and a published spec to avoid lock-in.

---

## 6. Platform reach & performance

> **Open decision:** the delivery model — native desktop app, web/browser-based app, or a hybrid — has **not** been decided. The points below are stated in delivery-model-neutral terms; platform- and architecture-specific requirements will be filled in once that decision is made (see §11).

- **Broad platform reach** for in-store associates across the devices they actually use; specific OS/device targets TBD pending the delivery-model decision.
- **Performance:** smooth handling of large, image-heavy documents (fast rendering, scrolling, and export) regardless of delivery model.
- **Resilience:** the experience should degrade gracefully under poor or intermittent in-store connectivity; exact offline/online behavior depends on the delivery model (TBD).

---

## 7. Migration experience (ex-Publisher users)
- **First-run migration wizard**: "Open a Publisher file" front and center.
- **Template gallery** mirroring common Publisher templates (newsletters, flyers, brochures, cards, calendars) so users land on familiar starting points.
- **Familiar layout** option / keyboard-shortcut mapping for Publisher and Office muscle memory.
- **Guided tours** for the few concepts new to Publisher users (master pages, styles, preflight, CMYK).
- In-app **import report** and font-substitution guidance (see 5.1).
- Goal: a Publisher user opens an existing `.pub`, makes edits, and exports a print-ready PDF within their first session.

---

## 8. Enterprise & IT considerations
*(Designed as explicit advantages over the current Affinity/Canva model.)*
- **Licensing:** perpetual / owned licensing option; no mandatory third-party account; no recurring online entitlement check required for core use.
- **Deployment:** centralized mass deployment and management for IT. *(Specific mechanism depends on the delivery model — e.g., managed installers with MDM/Group Policy for a native app, or tenant/admin provisioning for a web-based app.)*
- **Volume licensing** with centralized admin and seat management.
- **Security & compliance roadmap:** target SOC 2 Type II and ISO 27001; documented data-handling (local-first, no forced cloud upload).
- **Support & SLA tiers** for enterprise customers.
- **Microsoft 365 fit:** smooth interop with the existing Office ecosystem (Word/RTF/Excel import, OneDrive/SharePoint file access).
- **Business continuity:** published native format spec and export guarantees so customers are never locked out of their own documents.

---

## 9. Collaboration & cloud (post-v1 roadmap)
- Cloud storage integration (OneDrive, SharePoint, generic WebDAV) for open/save.
- Shared template and brand-asset libraries (locked brand colors, fonts, logos).
- Comments/annotations and review mode.
- Real-time co-editing (longer-term).

---

## 10. Out of scope / explicitly deferred
- AI *generative imaging* (text-to-image asset creation) — may integrate later; not a v1 dependency. **Distinct from** the AI-assisted creation & task help in 3.3, which *is* a core v1 capability.
- Native `.indd` import.
- Advanced print-house imposition and trapping (basic overprint only in v1).

---

## 11. Open questions & risks
| # | Item | Notes |
|---|---|---|
| 1 | `.pub` parser fidelity ceiling | The format is undocumented; achievable fidelity is the biggest technical unknown. Needs an early spike + test corpus. |
| 2 | Font licensing/substitution on import | Legacy docs reference fonts users may not own; substitution UX and licensing must be handled carefully. |
| 3 | Template library sourcing | Need a sizable, license-clean template set to match Publisher's out-of-box experience. |
| 4 | Delivery model & platforms | Native desktop vs. web/browser-based vs. hybrid is **undecided** — it drives architecture, offline behavior, platform reach, performance approach, and deployment. Needs an early decision. |
| 5 | Color-accuracy expectations | Casual Publisher users are RGB-native; managing the CMYK learning curve without overwhelming them. |
| 6 | Pricing/packaging | Perpetual vs. subscription vs. hybrid; how to position against "free" Affinity while emphasizing ownership and `.pub` migration value. |

---

## 12. Appendix — capability comparison snapshot

| Capability | MS Publisher | Affinity Publisher (benchmark) | This product (target) |
|---|---|---|---|
| Open `.pub` files | ✅ native | ❌ none | ✅ **native import (flagship)** |
| Master pages | ✅ basic | ✅ smart masters | ✅ smart masters |
| Linked text frames / autoflow | ⚠️ limited | ✅ | ✅ |
| Baseline grids | ❌ | ✅ doc + per-frame | ✅ doc + per-frame |
| OpenType / variable fonts | ⚠️ partial | ✅ | ✅ |
| CMYK / spot / PANTONE | ⚠️ limited | ✅ | ✅ |
| Preflight | ❌ | ✅ | ✅ |
| PDF/X export | ⚠️ limited | ✅ X-1a/X-3/X-4 | ✅ X-1a/X-3/X-4 |
| Data / mail / catalog merge | ✅ | ✅ (desktop-only) | ✅ |
| IDML import | ❌ | ✅ | ✅ |
| Account-free (no forced sign-in) | ✅ | ❌ Canva account required | ✅ **no mandatory account** |
| Enterprise centralized deployment | ✅ (via M365) | ⚠️ SSO only | ✅ centralized deployment + MDM |

> Legend: ✅ full · ⚠️ partial/limited · ❌ none. Benchmark column reflects Affinity's post–Canva-acquisition state (unified "Affinity" app, Oct 2025).

---

*End of document.*
