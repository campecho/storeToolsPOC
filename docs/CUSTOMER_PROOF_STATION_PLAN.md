# Store Tools POC — Customer Proof Station Implementation Plan (Proofing & Sign-off, Customer View)

**Scope of this plan:** the **customer-facing proof station** — the counter touch device where a customer reviews a soft proof and signs off while the associate keeps working — plus the **associate-side "Send to customer"** affordance and the **proof-session service** that connects them. This is the POC implementation of `docs/Customer_Proof_Station_Spec.md` (the customer-facing half of Proofing & Approval, requirements §8.12).

**Where it sits in the pipeline:** this slice lands **before field UAT begins** (user direction, 2026-07-05) so the counter sign-off flow is part of the UAT script from the first session — associates rehearse the full transaction (prepare → send → customer reviews → signs → outcome), not just the editing half. It is **independent of the layout editor's K/P tranches** (`docs/LAYOUT_EDITOR_PLAN.md` §11) and can be built in parallel with the `.pub` import proof point.

**Inputs reviewed:**

| Input | Where | Role |
|---|---|---|
| Customer Proof Station spec | `docs/Customer_Proof_Station_Spec.md` | The functional/technical spec this plan implements — transport, pairing, screens, artifact, hygiene are all decided there |
| Store Tools Suite implementation plan | `docs/Store_Tools_Suite_Implementation_Plan.md` | Fit: §8.12 proofing/handoff; the customer re-approval gate feeds Phase 5's write-back follow-on |
| Security considerations | `docs/SECURITY_CONSIDERATIONS.md` | §2.6 (re-approval gate — this artifact is its evidence half), §2.7 (kiosk/endpoint), §2.5 (web/platform) |
| Layout editor plan | `docs/LAYOUT_EDITOR_PLAN.md` | The document/render model the proof displays; §8.6's render-parity contract is the production proof-render path |
| Stubs registry | `STUBS.md` | The seams this slice adds (session store, station identity) get registered there |

---

## 1. Review findings

### 1.1 The spec is decision-complete; what's missing is a design handoff

Unlike the tracker and layout editor, there is **no wireframe handoff package** for this surface yet — the spec itself notes customer-view wireframes as a separate design work item. The spec's §4 does fully enumerate the four states (Idle / Proof review / Sign-off / Done), the interaction rules (thumb-reachable pinned actions, pinch-zoom, quick-pick reasons), and the accessibility bar. **This plan proceeds from §4 at mid-fidelity using the suite's existing tokens** (Staples red `#CC0000`, the wireframe grays, sentence case); when the design handoff arrives, restyling is a surface pass — the states, transport, and session model don't move.

### 1.2 This is the POC's first server-backed slice — and that's the point

Everything built so far is client-side (`localStorage`/IndexedDB; no API routes). A proof session is inherently **cross-device shared state**, so this slice stands up the POC's first server seam: in-memory session state behind Next.js route handlers (SSE + POST, per the spec's locked transport decision). Two consequences worth naming:

- **The same seam serves the `.pub` import service.** The import pipeline (layout plan §10.1) also needs Node-runtime route handlers in the POC container. Whichever slice lands first establishes the pattern (route-handler conventions, Zod contracts at the API boundary, the Docker/`standalone` posture); the other reuses it.
- **In-memory state pins the POC to a single server instance.** Fine for the demo/pilot deploy (Cloud Run `max-instances=1` or a single container); recorded as a POC deviation with the production swap being a real session/service store behind the one-file seam (§3.4).

### 1.3 Proof render: model-replay now, server-flattened render when the print slice lands

The spec's target is a **server-rendered flattened proof** (PDF/PNG) so the customer sees exact bytes. The POC has no server render or export pipeline yet — that's the print-production slice (layout plan §8.6). Building a throwaway rasterizer here would pre-empt the engine decision the suite plan reserves for evidence.

**POC posture — model-replay:** the dispatch carries a **snapshot of the `LayoutDocument` plus its asset bytes**; the station renders it read-only through the **same object-render components the editor and its page thumbnails already use**. Fidelity holds because it is literally the same render code on both screens — the POC equivalent of §8.6's "WYSIWYG by sharing the layout code, not by trusting two engines to agree."

The seam is explicit: the `proof` event's payload is a set of **tokenized fetch URLs** (spec §2 — the asset never rides the event stream). Today those URLs serve `doc` + `asset` JSON/bytes; when the print slice lands they serve flattened page renders, and the station viewer swaps its body without touching transport, pairing, sessions, or sign-off. The signed artifact records which mode produced what the customer saw (§4).

**Fonts follow the same rule:** the station must render with the same faces as the editor, which is one more reason the font library is **self-hosted** (`public/fonts/`, layout plan §10.6) — a converted `.pub` proof on the counter device renders identically to the associate's screen with no CDN dependency on the store network.

### 1.4 What this slice deliberately does not build

- **Hardware/kiosk provisioning** (Pi image, Chromium kiosk config, watchdog, enclosure) — spec §7's build notes; ops work outside this repo.
- **Real station credentials/provisioning** — POC pairing persists `storeId`/`stationId` locally after a one-time setup screen; the credential is a demo-grade token (§5).
- **Order/job integration** — there is no order model in the POC; the job header (customer first name, product, quantity, finishing) is typed by the associate at dispatch, with `doc.product`/doc name prefilled where they exist.
- **Customer's-own-phone / QR path** — spec [ROADMAP]; the tokenized-session model keeps it free, nothing built now.

---

## 2. What we're building (fidelity & scope contract)

- **Follow the spec exactly:** the four customer states and their content rules (no customer data in Idle; PII-minimized job header; trim/bleed subtly visible; pinned Approve / Request changes; attestation + finger-signature with typed-name fallback; quick-pick change reasons; Done with dwell → Idle), station-bound pairing, SSE-down/POST-up transport, heartbeat presence, the timeout, and the purge rules.
- **Mid-fidelity styling** from the suite's existing tokens until the design handoff arrives (§1.1). Touch targets ≥ 44px, high contrast, landscape-first — the spec's accessibility bar is in scope now, not later.
- **Kiosk chrome:** the `/proof-station` route renders **without the suite header** (no Give feedback, no bell, no navigation — a customer surface must expose no associate affordances). This inverts the "one shared surface" rule deliberately; the associate-side dialog keeps the suite chrome.
- **POC deviations (recorded):** model-replay proof instead of server-flattened render (§1.3) · in-memory single-instance session service (§1.2) · demo-grade station credential (§5) · artifact held in server memory and downloadable as JSON, not durably stored (§4) · associate dispatch lives in the layout editor only (the one tool surface that exists).

---

## 3. Architecture

### 3.1 Routes & surfaces

| Route | Surface | Notes |
|---|---|---|
| `/proof-station` | Customer view: setup → idle → review → sign-off → done | Chrome-less kiosk route; one-time setup persists `storeId`/`stationId`+label locally (spec §3), then boots to Idle on every load |
| (in `/layout`) | Associate view: **Send proof** in the editor title bar → dialog | Station picker (auto-selected when the store has one online), job-header fields, live session status, outcome banner |
| `/api/proof/*` | Session service | Route handlers, Node runtime; contracts in Zod |

The spec's `/proof-station/:storeId/:stationId` shape is honored via the persisted setup — the POC route reads its identity from local persistence rather than the path so a mis-shared URL can't impersonate a station by typing.

### 3.2 Transport endpoints (the spec's §2 table, made concrete)

```
GET  /api/proof/stream?role=station&station=…     SSE: hello · heartbeat(15s) · proof{token, jobHeader} · cancel{reason}
GET  /api/proof/stream?role=associate&store=…     SSE: station-presence{online} · session-state{viewing|…} · decision{…}
POST /api/proof/dispatch                          doc snapshot + asset bytes (size-capped) + job header → session token
POST /api/proof/decision                          {token, approve:{signature, attestationVersion} | changes:{reasons[], note}}
POST /api/proof/cancel                            associate cancel of the active session
GET  /api/proof/session/:token/doc                tokenized fetch — the proof payload (single-session, expires on end)
GET  /api/proof/session/:token/asset/:assetId     tokenized fetch — asset bytes for the render
```

SSE streams honor `Last-Event-ID` resume; a reconnecting station re-syncs its state (an in-flight session re-presents, an ended one lands on Idle). Heartbeat presence drives the associate's online/offline indicator (spec §2).

### 3.3 Component map

```
src/app/proof-station/page.tsx        // kiosk route (no suite header); state machine over the four states
src/components/proof-station/
  StationSetup.tsx                    // one-time pairing: store id + station label → persisted
  IdleScreen.tsx                      // branded attract screen, station label small, provably clean
  ReviewScreen.tsx                    // job header · ProofViewer · pinned Approve / Request changes
  SignOffScreen.tsx                   // attestation text · SignaturePad (drawn / typed-name) · confirm
  ChangesScreen.tsx                   // quick-pick reasons (color/typo/layout/other) + free-text
  DoneScreen.tsx                      // outcome + dwell → Idle
  ProofViewer.tsx                     // read-only true-scale render (shared object-render tree),
                                      // pinch-zoom/pan, page nav, subtle trim/bleed
  SignaturePad.tsx                    // pointer-drawn canvas → PNG; typed-name fallback
src/components/layout-editor/
  SendProofDialog.tsx                 // associate: station list + presence, job header, live status, outcome
src/app/api/proof/                    // route handlers per §3.2
src/lib/proof/
  session-store.ts                    // in-memory session registry + timers (the production seam)
  events.ts                           // Zod contracts: SSE events, dispatch/decision payloads, artifact
  hash.ts                             // doc-snapshot SHA-256 for the artifact
```

### 3.4 The proof session (server, in-memory behind a one-file seam)

`{ token, storeId, stationId, jobHeader, docSnapshot, assets, state: dispatched|viewing|deciding|done, dispatchedAt, timeoutAt, decision?, artifact? }`

- **One active session per station** — a second dispatch to a busy station is refused with the live status shown to the associate (spec: one session, one customer).
- **Timeout:** 10 min unattended → auto-cancel, associate notified (spec §6 [MED]).
- **Purge on any end** (done / timeout / cancel): payload and assets dropped server-side, token invalidated (a revisited URL 404s — "shows nothing"), station clears all local state and returns to Idle.
- Production swap: this file becomes a client of a real session/artifact service; contracts in `events.ts` are the API shape.

---

## 4. The signed-proof artifact (POC shape)

Assembled server-side at the moment of approval (spec §5):

`{ docHash, docSnapshot, renderMode: 'model-replay', attestationVersion, signature: { kind: 'drawn'|'typed', image?|name }, decidedAt, storeId, stationId, sessionToken, associateStation, jobHeader }`

- `docHash` is the SHA-256 of the dispatched snapshot — the "any later edit visibly breaks the link" property. `renderMode` records honestly that the POC customer saw a model replay; the production artifact stores the flattened render bytes themselves (spec: "the same bytes/version the customer saw").
- **Request-changes** produces the outcome record (reasons + note) routed to the associate instantly; no artifact.
- **POC retention:** the artifact lives with the session in memory and is **downloadable as JSON from the associate's outcome banner** — enough to demo the audit story. Durable storage under order-record retention is production work (spec open question §8.1).
- The re-proofing gate (post-approval edit invalidates approval) is real in production via the write-back path; the POC demos it by hash comparison — re-send after an edit yields a new hash, visibly unlinked from the prior artifact.

---

## 5. Security & session hygiene (POC-enforced vs. deferred)

Same split discipline as the import pipeline (layout plan §10.1): the POC enforces the portable, our-own-code half; device/infra controls defer to the production tranche as recorded accepted risk.

**POC-enforced (built in PS2–PS4, tested in PS5):**
- Single-session tokenized proof URLs; expire on session end; never reusable after sign-off (spec §6 [HIGH]).
- Inter-customer clearing — full purge on done/timeout/cancel, both server- and station-side; Idle is provably clean (asserted in e2e).
- Session timeout with associate notification.
- Station credential scope: the persisted station identity opens the SSE stream only; job content is reachable solely via dispatched per-session tokens.
- Dispatch size cap and payload validation (Zod) at every endpoint; signature blobs capped.
- No customer PII beyond the job header's first name; nothing persisted on the station device.

**Production-deferred (accepted risk for the POC, recorded):**
- Real station provisioning/credential strength (device identity, revocation) — POC pairing is a demo-grade local setup.
- Kiosk hardening of the device itself (Chromium kiosk, no OS escape, auto-relaunch, remote reboot, enclosure) — spec §6/§7, ops-owned.
- TLS posture on the store LAN, VLAN/proxy topology — spec §7's IT prerequisites.
- Durable, tamper-evident artifact storage under order-record retention.

---

## 6. Build order (one commit per step, each demoable)

| Step | Lands | Newly available |
|---|---|---|
| PS1 | Session service spine + paired idle station | A browser becomes a proof station; associate sees it online/offline live |
| PS2 | Dispatch + proof review screen | "Send to customer" puts the real document on the counter screen, zoomable, multi-page |
| PS3 | Decisions: approve/sign + request changes | The full sign-off round-trip with the signed-proof artifact |
| PS4 | Session hygiene | Timeout, cancel, purge, dead-token, reconnect-resync — the spec's §6 rules |
| PS5 | Hardening & ship shape | Two-context e2e as the demo script; docs/registry updates |

### PS1 — Session service & the paired idle station
`session-store.ts` + `events.ts`; the SSE endpoint with heartbeat; `/proof-station` (chrome-less) with the one-time setup flow, then the branded Idle screen showing the station label small. Associate side: the **Send proof** title-bar affordance opens the dialog listing the store's stations with live presence (dispatch disabled until PS2 — honest "coming next step" state).
*Done when:* two browser contexts — one pairs as a station and idles; the associate dialog shows it online within a heartbeat; closing the station tab flips it offline; unit tests cover presence bookkeeping.

### PS2 — Dispatch & the proof review screen
Dispatch POST (doc snapshot + referenced asset bytes, size-capped) → session + `proof` event; the station fetches via tokenized URLs and renders **ReviewScreen**: PII-minimized job header, `ProofViewer` (true-scale shared render, pinch-zoom/pan via pointer events, page nav for multi-page, subtle trim/bleed), pinned Approve / Request changes (inert until PS3). One-session-per-station enforced; associate dialog shows live state (Sent → Viewing).
*Done when:* e2e — build a doc with text + a placed image in the editor, send, and it renders on the station context (image included); a second dispatch while busy is refused; a used/foreign token 404s.

### PS3 — Decisions: approve, sign & request changes
Approve → **SignOffScreen** (attestation text, drawn-signature pad with typed-name fallback, single confirm) → server assembles the artifact (§4); Request changes → **ChangesScreen** (quick-pick reasons + free text) → outcome routed instantly. **DoneScreen** with dwell → Idle. Associate gets the decision event: outcome banner with the change reasons or the artifact download.
*Done when:* both paths round-trip in e2e; the artifact's `docHash` matches an independent hash of the dispatched snapshot; a post-edit re-send produces a different hash; signature blob size is capped.

### PS4 — Session hygiene
The 10-minute timeout (auto-cancel + associate notification), associate cancel, and the full purge on every end state: server payload dropped, token invalidated, station cleared to Idle with nothing recoverable. SSE reconnect with `Last-Event-ID` re-syncs station state (in-flight session re-presents; ended session → Idle).
*Done when:* hygiene e2e — timeout fires (timer injectable), the token is dead, and the station context holds no session data (asserted via the page, not assumed); reconnect mid-session resumes correctly.

### PS5 — Hardening & ship shape
The full two-context Playwright suite as the stakeholder demo script (pair → send → view → sign → artifact → clean idle; plus the changes path and the timeout). A11y pass on the customer surface (target sizes, contrast, landscape, on-screen-keyboard fallback for typed name). README demo script + status table; STUBS.md gains the new seams (session store, station pairing, artifact retention, model-replay render mode).
*Done when:* e2e green; `docker run` serves both surfaces from the one container; the single-instance constraint is documented where the deploy story lives.

---

## 7. Testing strategy

- **Unit (Vitest):** session lifecycle (dispatch → states → end), one-session-per-station, token single-use/expiry, timeout scheduling, purge completeness, presence from heartbeats, artifact hashing, Zod contract round-trips.
- **E2E (Playwright, two browser contexts):** the PS5 flows — Playwright's multi-context model is exactly this topology (associate + station in one test), no device required.
- **Manual/counter checks:** pinch-zoom on a real touch device; landscape at counter height; the spec's glove/stylus tolerance — before UAT starts.

---

## 8. Open questions / assumptions (proceeding unless redirected)

1. **Job header source** — no order model exists in the POC; the associate types customer first name / quantity / finishing at dispatch (product prefills from `doc.product` or the doc name). Order integration replaces this at the backbone.
2. **Station registry scope** — POC: any station that completes setup under a store id is visible to that store's associates. Real provisioning (and credential strength) is production work (§5).
3. **Design handoff** — proceeding at mid-fidelity from spec §4; restyle when the customer-view wireframes land (§1.1).
4. **Artifact retention** — POC holds it in session memory + JSON download; the retention owner decision (spec §8.1) lands with the production artifact store.
5. **Timer values** — heartbeat 15s, timeout 10 min, done-dwell ~8s per the spec's suggestions; all constants in one place for per-store tuning (spec §7 flags proxy-dependent heartbeat tuning).

---

*This plan turns the proof-station spec into the POC's first cross-device, server-backed slice — five demoable steps that put a real counter sign-off (with its audit artifact) in front of UAT, while keeping the spec's production posture (flattened server render, real provisioning, durable retention) as recorded seams rather than rework.*
