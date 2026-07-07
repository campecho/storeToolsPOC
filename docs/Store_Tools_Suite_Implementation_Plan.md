# In-Store Print & Design Tool Suite — Implementation Plan (Prototyping & Beta)

**Document type:** Implementation & delivery plan (prototype → open beta → production)
**Status:** Draft v0.2 — for internal review
**Author:** Jennifer Allen, Sr Mgr Product Management
**Last updated:** 2026-07-05
**v0.2:** adds the **customer proof station** (the customer-facing half of Proofing & Approval, §8.12) as a named Track B slice, sequenced ahead of field UAT — spec in `Customer_Proof_Station_Spec.md`, POC build plan in `CUSTOMER_PROOF_STATION_PLAN.md`.
**Companion to:** `Store_Tools_Suite_Feature_Requirements.md` (defines *what* the suite does; this plan defines *how* we build, test, and roll it out, and *in what order*)

**A note on technology:** this plan is intentionally **stack-agnostic**. It does not pick languages, frameworks, or engines. Those choices are made deliberately, with evidence, during the early spikes (Phase 0) and the per-tool build-vs-adopt decisions — measured against the real in-store hardware, real customer files, and the security bar, not chosen up front. Where the requirements doc lists candidate engines, treat them as inputs to evaluate, not commitments.

---

## 1. Approach in one paragraph

Build the suite **gradually and testably**: stand up a thin, end-to-end **walking skeleton** first — one file type traveling the whole pipeline (intake → sandboxed convert/render → preflight → print-ready export → order handoff) — so the hard integration seams are proven before any breadth. Then add each tool as its own **vertical slice** onto that proven spine, testing every piece on its own *and* the suite as a whole at each step. Put it in front of every store as an **open, feature-flagged beta** with a **built-in feedback-and-upvote system**, let real counter use and that feedback drive iteration, and only then **harden the proven prototype into the final production solution**. Progress is gated by **readiness, not dates** — with the one fixed external marker being Microsoft Publisher's October 2026 retirement.

---

## 2. Guiding principles

These shape every phase and should be treated as standing commitments.

**Walking skeleton first, then vertical slices.** The first build is not a feature — it is a complete, skinny path through the whole system. Every later capability is a slice added onto a spine that already works end to end, so integration risk is paid down first and breadth never outruns a working backbone.

**Test as you go *and* as a whole.** Each piece carries its own acceptance criteria and harness (e.g. round-trip fidelity, deterministic print, imposition alignment), and the integrated suite is exercised with real end-to-end scenarios at every phase. Nothing is "done" until it passes both its own tests and the whole-suite tests.

**Stack chosen by evidence, not assertion.** Build-vs-adopt and engine selection are settled by spikes against real files on the real hardware profile, with fidelity, performance, and security as the scoring bars. The plan names *capabilities and decisions*, never products.

**Real hardware, real files, from day one.** Everything is validated on the in-store machine profile (the shared HP ProDesk 600 G4 class) using a standing corpus of real customer files — not idealized samples on developer laptops.

**Ship behind flags, with a fallback.** Because the beta goes to everyone, every capability is independently flag-gated and reversible, and the existing tools remain available as a safety net (Publisher until its October 2026 retirement). A bad feature is switched off, not rolled back across the fleet.

**Feedback is a feature, not a survey.** The means of collecting field feedback — report a bug, request a feature, upvote others' reports, see what other stores are hitting — is **built into the tool** and shipped early, so the beta is self-instrumenting and the loop from "associate hits a problem" to "team sees it ranked" is short.

**Security is part of the skeleton.** Untrusted-file handling (sandboxed out-of-process parsing, scanning, content-only AI) is built into the spine from Phase 1, because every tool ingests hostile input — it is not a hardening pass bolted on before launch.

---

## 3. Workstreams

The suite is several things at once, so work proceeds along parallel tracks that integrate at the phase gates rather than as one monolith. Each track can move at its own pace as long as it meets the gate criteria.

| Track | What it covers | Why it's separable |
|---|---|---|
| **A. Shared backbone** | Intake/convert/route, sandboxed render, preflight + print-ready export, catalog/product-spec sync, order integration, identity/audit, AI-assist service | The moat and the spine; everything plugs into it. Built first as the skeleton, deepened continuously. |
| **B. Tool surfaces** | Quick-fix utilities, custom-size layout/design, Office handlers (Word/Excel/PowerPoint), PDF toolkit, `.pub` on-ramp, templates, VDP | Each is an independently testable slice onto the backbone; they can be built and flagged on in any order. |
| **C. Feedback & telemetry** | In-tool bug/feature reporting, cross-store upvoting and visibility, usage analytics, error monitoring, spec-violation flagging | Needed early to make the open beta observable and self-reporting; also a permanent product surface. |
| **D. Beta operations & enablement** | Feature-flag/rollout control, fallback & kill-switches, training/quick-guides, support path, content-moderation/abuse path | Operational readiness for an everyone-has-access beta; runs alongside the build. |
| **E. Quality & test harnesses** | Real-file corpus, fidelity/round-trip and render-diff harnesses, hardware load tests, security testing | A standing capability that every slice and the whole suite are measured against. |

---

## 4. Phased sequence

Phases are ordered by dependency and gated by **readiness criteria**, not calendar dates. The team slots dates later; the only fixed external marker is the **October 2026 Publisher retirement**, called out where it constrains sequence.

### Phase 0 — Foundations & spikes (decide, don't guess)

Prove the unknowns and make the technology decisions before committing to a build.

- Run **time-boxed spikes** on each hard, decision-bearing piece — `.pub` parsing/recovery, native Office-format fidelity and round-trip, headless convert/render, the image-processing stack, the PDF engine, the layout/canvas surface, and the AI-assist layer — and **score them on the real hardware against the real-file corpus** for fidelity, performance, and security. These spikes produce the **build-vs-adopt and engine decisions**; nothing about the stack is assumed before them.
- Stand up the **standing test assets**: the real-customer-file corpus, the fidelity/round-trip and render-diff harnesses, and a repeatable hardware-load test on the store machine profile.
- Establish the **security baseline**: prove the sandboxed, out-of-process parsing pattern (no network, confined FS, resource caps) on one genuinely risky format, plus malware scanning on ingest.
- Stand up the **flag/telemetry/feedback scaffolding** as a thin shell so later work is observable from its first commit.

*Exit gate:* engine/build-vs-adopt decisions recorded with evidence; fidelity/performance/security bars defined and demonstrated on the hardware profile; test harnesses and flag/telemetry scaffolding operational.

### Phase 1 — Walking skeleton (thin, end-to-end, one format)

Build the narrowest possible *complete* path through the whole backbone, so the seams are real.

- Take **one file type** all the way through: **intake → content-sniff/convert → sandboxed render → advisory preflight → print-ready export → order/handoff path**, with only the minimal UI needed to drive it. (A high-frequency format that exercises the order-file-fetch loop is the recommended choice, since it proves the integration that compounds the most value.)
- Wire in **identity/audit, the feature-flag framework, telemetry, and a minimal in-tool feedback control** so the skeleton is observable and reportable from the first run.
- Test **each seam** (unit + integration) and the **whole slice** end-to-end, on the hardware profile, with real files.

*Exit gate:* a real — if narrow — job goes counter-to-print through the suite; every backbone seam is exercised and instrumented; the fallback path and a feature kill-switch both work. This is the proof that the spine holds before any breadth is added.

### Phase 2 — Vertical slices, one tool at a time (breadth on a proven spine)

Add each tool surface as its own slice onto the skeleton. Each is independently built, independently tested, and independently flag-gated.

- Suggested slice order, leading with daily-frequency value while respecting the Publisher deadline: **quick-fix utilities** (image crop/resize/convert, one-click bleed) → **custom-size layout/design core** → **PDF toolkit** → **Office handlers** (Word round-trip, Excel deterministic print, PowerPoint render/light-edit) → **`.pub` on-ramp** → **templates & catalog/spec sync** → **VDP** → **AI highlight-to-change**. Deepen the **catalog/order integration** continuously alongside these (it is the long-pole `[INT]` dependency).
- **(v0.2) Customer proof station** — the customer-facing sign-off half of §8.12 (counter touch device, SSE-paired to the associate station, signed-proof audit artifact) is its own Track B slice per `Customer_Proof_Station_Spec.md`. It is sequenced **ahead of field UAT** so the full counter transaction — prepare → send → customer reviews → signs → outcome — is exercised from the first UAT session; its audit artifact is also the evidence half of the customer-re-approval gate the security doc requires on the eventual write-back path (Phase 5 follow-on).
- Each slice ships with its **own acceptance bar and harness** — e.g. bleed-expansion correctness, Word open→edit→save round-trip integrity, Excel "fix-the-print" determinism, N-up/cut alignment, preflight accuracy — **plus** an integrated test against the backbone and an on-hardware performance check.
- **Publisher-deadline constraint:** the **custom-size layout core** and the **`.pub` on-ramp** must reach a usable state *before associates lose Publisher in October 2026*. Even though quick-fixes lead on value, sequence these two early enough within Phase 2 that they clear their gates ahead of that marker.

*Exit gate (per slice):* meets its acceptance criteria, runs acceptably on the hardware profile, sits behind a flag, and is instrumented and reportable. Slices graduate independently — the suite grows one provable capability at a time.

### Phase 3 — The integrated whole (test the suite, not just the parts)

Bring the slices together into the single "one program" surface and prove the cross-tool behaviors.

- Assemble the **unified experience** (approachable→pro modes, one surface) and the **cross-tool flows**: route any file → the right product; convert an oversize deck → a poster in the design tool; fetch an order file → fix → return; hand a real design job to Design Services.
- Run **whole-suite testing**: end-to-end scenarios across tools, **concurrency on shared stations**, and the full **non-functional gauntlet** — performance under load on the hardware profile, a **security review** (untrusted-file red-team, prompt-injection on the AI layer, IDOR on order fetch, archive/zip-bomb handling, malware round-trip), accessibility, and an **ease-of-learning** check (time-to-first-success for a brand-new associate).
- **Dogfood internally** on store-spec hardware with the real-file corpus and fix what surfaces.

*Exit gate:* suite-level acceptance scenarios pass; the security review clears its launch-gating findings; fallback/rollback is proven at suite scale; per-tool quick-guides exist. This is the readiness bar for exposing it to the field.

### Phase 4 — Open beta to all stores (feature-flagged, feedback-driven)

Launch the beta to **everyone**, but turn capabilities on **progressively by flag** — every store has access; each feature switches on as it clears its gate. Existing tools stay available as the fallback (Publisher until October 2026).

- The **in-tool feedback system is the centerpiece** (see §6): associates **report bugs, request features, attach the offending file/context, upvote other stores' reports, and see what's already been raised** — and the team triages from that ranked feedback *plus* telemetry. The loop from field problem to ranked, deduplicated signal is built into the product.
- Operate the open surface deliberately: **error/usage telemetry**, **per-feature kill-switches**, a **support path**, a **content-moderation/abuse path** (sharpest on any customer-facing/self-serve surface), and **training/quick-guides** bundled per tool.
- **Iterate on a tight cadence:** regularly triage feedback + telemetry → fix / flag / refine → promote stable capabilities from "beta-on" toward "default-on." Stores effectively self-select into each feature as it stabilizes.
- Watch the **Publisher-replacement capabilities** especially closely here, since they must be trustworthy in the field before the October 2026 cutover.

*Exit gate:* per-feature stability, usage, and satisfaction thresholds met; critical/blocking issues from the feedback+telemetry stream burned down; the Publisher-replacement path validated in real use ahead of its deadline.

### Phase 5 — Final solution & production hardening

Turn the proven prototype into the durable product.

- **Retire the scaffolding:** replace any prototype stopgaps or interim adoptions with the committed implementations; finalize the build-vs-adopt decisions and resolve any **licensing posture** (including copyleft/AGPL) for embedded engines.
- **Productionize:** define and meet service-level objectives; finalize **centralized deployment, SSO/admin, seat management**; advance the **security-certification and data-retention** commitments; stand up disaster recovery.
- **Graduate beta → GA**, keep the **feedback/upvote surface as a permanent roadmap input**, and execute the **decommissioning/migration** path off the retiring tools with full training.
- **Layer in the deferred follow-ons** here or as fast-follows: automatic **write-back to the production queue**, and the **Design Services / Workfront handoff** (requirements §8.10, §8.14).

*Exit gate:* GA readiness — SLOs, security, deployment/admin, and support all production-grade; retiring tools have a dated decommissioning path; the feedback surface continues to feed the roadmap.

---

## 5. Testing strategy (pieces and whole)

Testing is continuous and layered, not a phase at the end.

**Piece-level (every slice).** Each tool carries explicit acceptance criteria backed by a harness: round-trip/fidelity corpora for the Office and `.pub` paths (open → edit → save → re-open with no drift); deterministic-print checks for spreadsheets; imposition and device-cut alignment for N-up/label work; bleed-expansion and safe-area correctness; preflight accuracy (right warnings, no false blocks). Unit and integration tests cover each backbone seam the slice touches.

**Whole-suite.** End-to-end scenario tests exercise cross-tool routing and the order-fetch→fix→return loop; concurrency tests confirm multiple stations working at once; the unified surface is tested as the associate actually experiences it.

**Non-functional gates.** Performance on the in-store hardware profile is an acceptance criterion at every phase. Security testing targets the untrusted-file threat model (sandbox escape, prompt injection, IDOR, archive bombs, malware round-trip) and gates launch. Accessibility and ease-of-learning (time-to-first-success for a new associate) are measured, not assumed.

**Standing assets.** The real-customer-file corpus and the render-diff/fidelity harness are maintained as durable test infrastructure from Phase 0 onward. During open beta, **field telemetry and the in-tool feedback stream act as continuous, real-world test coverage** that no synthetic suite can match.

---

## 6. The feedback & telemetry platform (a built feature)

Because the beta launches to every store at once, the feedback mechanism is a **first-class part of the product**, shipped early (skeleton in Phase 1, full in Phase 4) and kept permanently.

- **Report from inside the tool.** An associate can file a **bug** or a **feature request** without leaving the task, attaching the offending file and the relevant context (tool, product, file type, what happened) automatically.
- **Upvote and see across stores.** Associates can **upvote** existing reports and **see what other stores have already raised**, so the most common, highest-pain issues rise to the top and duplicates collapse into one ranked item.
- **Ranked, aggregated signal for the team.** Product can **generate and sort reports** by votes and frequency, and correlate them with **telemetry** (which feature, which file type, which store, which error) to decide what to fix and what to build next — turning scattered counter frustration into a prioritized queue.
- **Close the loop.** Status flows back to reporters ("triaged," "in beta," "shipped"), which both sustains participation and doubles as lightweight change communication.
- **Permanent, not temporary.** After GA the same surface becomes the **standing roadmap-input channel** from the field — the people serving customers keep steering the product.

---

## 7. Rollout & enablement (operating an everyone-has-access beta)

- **Progressive enablement under one launch.** All stores get the beta; individual capabilities turn on by flag as they clear gates, so "launched to everyone" never means "everything on for everyone at once."
- **Fallback and kill-switches.** Existing tools remain available (Publisher until October 2026); any feature can be switched off centrally without a fleet rollback.
- **Enablement.** Short, task-based **quick-guides** ship with each tool (a direct survey ask), lowering the learning curve the field repeatedly flags.
- **Support and safety.** A clear support path, plus a **content-moderation/abuse path** with a named owner — most important on any anonymous, customer-facing/self-serve surface.
- **Communication.** A regular cadence of "what changed / what's coming," fed partly by the feedback surface itself.

---

## 8. Risks, dependencies & constraints

- **October 2026 Publisher retirement (fixed marker).** The custom-size layout core and `.pub` on-ramp must be field-usable before it. *Mitigation:* sequence both early in Phase 2; validate them in the open beta ahead of the cutover.
- **Integration dependencies (`[INT]`).** Catalog, product-spec, order management, and (later) Workfront carry the highest cross-team dependency. *Mitigation:* scope and start the backbone integration in Phase 0–1 even though features land across phases.
- **Hardware performance.** The shared, modest in-store machines are a real ceiling. *Mitigation:* on-hardware load testing is a gate at every phase; heavy work runs server-side.
- **Untrusted-file security.** Every tool parses hostile input. *Mitigation:* sandboxing/scanning is in the skeleton; a security review gates Phase 3→4.
- **Engine & licensing decisions.** Adopted engines may carry copyleft/licensing implications. *Mitigation:* decide in Phase 0; resolve licensing posture before Phase 5 commitment.
- **Open-beta-to-everyone exposure.** Broad access raises the cost of a bad feature. *Mitigation:* flags, fallback, kill-switches, telemetry, and the feedback surface to catch issues fast.

---

## 9. Phase-gate summary

| Phase | Goal | Exit gate (readiness, not date) |
|---|---|---|
| **0 — Foundations & spikes** | Decide the stack and prove the unknowns | Engine/build-vs-adopt decisions evidenced on real hardware; harnesses + security baseline operational |
| **1 — Walking skeleton** | One format, end-to-end through the backbone | A real narrow job goes counter-to-print; all seams instrumented; fallback + kill-switch work |
| **2 — Vertical slices** | Add tools one provable slice at a time | Each slice meets its acceptance bar, runs on hardware, flag-gated; layout core + `.pub` on-ramp gated ahead of Oct 2026 |
| **3 — Integrated whole** | Prove the suite and cross-tool flows | Suite-level scenarios pass; security review clears; fallback proven at scale; quick-guides ready |
| **4 — Open beta (all stores)** | Field use + feedback-driven iteration | Per-feature stability/usage/satisfaction thresholds met; criticals burned down; Publisher path validated in the field |
| **5 — Final solution** | Harden the prototype into production | GA-grade SLOs/security/deployment; tools decommissioning path set; deferred follow-ons layered in |

---

## Appendix — Plan ↔ requirements mapping

| Requirements section | Where it's built/tested in this plan |
|---|---|
| §8.1 Intake, conversion & routing; §8.7 Preflight; §8.12 Ordering/handoff | Phase 1 walking skeleton (the spine) |
| §8.2 Quick-fix utilities | Phase 2, first slice |
| §8.3 Layout & design; §8.9 `.pub` on-ramp | Phase 2, sequenced early for the Oct 2026 constraint |
| §8.5 Office handlers; §8.6 PDF toolkit | Phase 2 slices |
| §8.4 Templates; §8.8 VDP; §8.11 AI highlight-to-change | Phase 2 later slices |
| §8.12 customer-facing proof sign-off (v0.2) | Phase 2 slice, ahead of field UAT — `Customer_Proof_Station_Spec.md` + `CUSTOMER_PROOF_STATION_PLAN.md` |
| §8.10 Catalog/order integration | Backbone, deepened across Phases 0–2 |
| §9 Non-functional (hardware, security, deployment, licensing) | Gated throughout; productionized in Phase 5 |
| §8.10 write-back; §8.14 Design Services / Workfront | Phase 5 follow-ons |
| (new) In-tool feedback & telemetry | Track C; skeleton in Phase 1, full in Phase 4, permanent after GA |

---

*End of draft. This plan sequences and gates the build of the suite defined in the companion requirements document; it deliberately leaves technology selection to the Phase 0 spikes and the per-tool build-vs-adopt decisions, and it leaves calendar dates to the delivery teams, anchored only to the fixed October 2026 Publisher marker.*
