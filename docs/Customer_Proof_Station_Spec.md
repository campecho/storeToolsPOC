# Customer-Facing Proof Station — Functional & Technical Spec

Scope for Claude Design (customer-view wireframes) and Claude Code (session/transport slice). Covers the **remote customer proof screen**: a network-paired touch device at the counter where the customer reviews a soft proof and signs off while the associate keeps working at the MPS station. This implements the customer-facing half of **Proofing & Approval** (feature list, "Customer-facing proof sign-off with audit trail") and requirements **§8.12**.

**Decisions locked in this spec:** SSE + HTTPS POST transport (not WebSockets), station-based pairing (not per-session QR), and a **Raspberry Pi + touchscreen running Chromium kiosk for the POC**. Go-forward fleet hardware is an **IT decision deferred past the POC** — the architecture is deliberately hardware-agnostic so that choice doesn't rework anything.

**Why this shape:** the proof is server-rendered (flattened PDF/PNG), so the customer screen is a thin viewer — consistent with the suite-wide server-side-rendering posture driven by the in-store hardware profile. The associate machine is physically distant from the counter, so a tethered second display is ruled out; the customer screen is an independent network device running a route of the same web app.

---

## 1. Concept & roles

Two views of one **proof session**:

- **Associate view** (existing MPS station) — prepares the file, triggers "Send to customer," sees live session status, receives the outcome.
- **Customer view** (counter proof station) — idles on a branded screen; when a proof arrives it displays it read-only with zoom/paging, and captures **Approve** / **Request changes** plus signature.

The customer view is a **route in the same web app** (`/proof-station/:storeId/:stationId`), not a separate application. Any browser pointed at that route becomes a proof station — this is what keeps the POC hardware decision reversible.

**One session, one customer.** A proof session binds one job, one customer, one station. Session state clears completely on completion or timeout (see §6).

---

## 2. Transport — SSE down, HTTPS POST up

**[CORE]** The customer screen's traffic is modest and asymmetric, which fits Server-Sent Events better than WebSockets on retail network infrastructure:

| Direction | Mechanism | Payloads |
|---|---|---|
| Server → customer screen | **SSE** (`EventSource`) | session start, proof-ready (render URL), page-render updates, session cancel/timeout |
| Customer screen → server | **HTTPS POST** | approve / request-changes, signature blob, page-view telemetry (optional) |
| Server → associate view | **SSE** | station online/offline, customer viewing status, decision received |

**Why SSE over WebSockets**
- Plain HTTP — survives store proxies and middleboxes that mishandle WebSocket upgrades
- **Native auto-reconnect** with `Last-Event-ID` resume; a dropped Wi-Fi blip recovers without custom code
- No additional library on either end; one less dependency to patch
- The flow has no chatty bidirectional state that would justify a socket

The proof asset itself is **not** pushed over SSE — the event carries a short-lived URL and the screen fetches the render over normal HTTPS (cacheable, resumable, keeps the event stream tiny).

**Heartbeat & presence.** Server emits a heartbeat event (~15s); the station's connection state drives an online/offline indicator on the associate view so a dead counter device is visible before a customer is standing at it.

---

## 3. Pairing model — station-bound, not per-session

**[CORE]** Devices pair **once at provisioning**, not per customer:

- The counter device boots into its route with a persisted `storeId` / `stationId` (set during a one-time setup flow; stored locally on the device).
- The associate's "Send to customer" action targets a station from a list of that store's registered proof stations (most stores: exactly one — auto-selected).
- No QR scanning or code entry during a transaction; the customer never touches pairing.

**Registration flow:** device provisioning generates a station record (store, station label, device identity) and a long-lived station credential used only to open the SSE stream — it grants no access to any job content until a session is dispatched to it.

**[ROADMAP]** The same session model supports a **customer's-own-phone** path later (associate surfaces a QR containing a single-session tokenized URL) and remote/texted proof approval feeding the self-service web-to-print direction. Nothing in the MVP needs to change to enable this — flagging so it stays a free option.

---

## 4. Customer view — screens & interactions

Wireframe as four states:

**Idle** — Staples-branded attract screen (design-system: Staples Red `#CC0000`, Arial, sentence case). Shows station label small (for associate reference), nothing else. No customer data ever visible in idle.

**Proof review**
- Full-screen proof render with **pinch-zoom / pan** and page thumbnails or swipe paging for multi-page jobs
- Job header: customer first name, product, quantity, finishing summary — enough to confirm "this is my job," no more (PII minimization)
- Persistent legibility of print intent: show **trim and bleed** subtly (this is a *print* proof, not just a picture)
- Actions pinned and thumb-reachable: **Approve** · **Request changes**

**Sign-off**
- Approve → confirmation step: brief attestation text ("I approve this proof for production as shown"), **finger-signature capture** with typed-name fallback, single confirm tap
- Request changes → optional quick-pick reasons (wrong color, typo, layout, other) + free-text; routes back to the associate view instantly

**Done** — thank-you screen with the outcome, auto-returns to Idle after a short dwell. Session data purged (§6).

**Accessibility & counter reality:** large touch targets, high contrast, works in landscape at counter height, glove/stylus-tolerant. No login, no keyboard-dependent step (typed-name fallback gets an on-screen keyboard).

---

## 5. Sign-off record & audit trail

**[CRITICAL]** The approval must stand up later ("that's not what I approved"). On approve, the server persists an immutable **signed-proof artifact**:

- The exact proof render(s) displayed (not a re-render — the same bytes/version the customer saw)
- Signature image or typed name + attestation text version
- Timestamp, store, station, session ID, associate ID, order/job reference
- Proof-version hash, so any later file change visibly breaks the link to the approval

Any post-approval edit **invalidates the approval** and requires re-proofing — this is the same customer-re-approval gate the security doc requires on the production write path (SECURITY_CONSIDERATIONS §2.6); this artifact is the evidence half of that control.

Retention of the signed-proof artifact should follow order-record retention, **not** the 14-day attachment window used by the feedback tracker — it's a transaction record, not a scratch file. *(Policy owner to confirm retention period — open question §8.)*

---

## 6. Security & session hygiene

Inherits SECURITY_CONSIDERATIONS §2.7 (kiosk/endpoint) and §2.5 (web/platform); items specific to this surface:

- **[HIGH]** **Short-lived, single-session proof URLs** — render links are tokenized, expire on session end, and are never reusable after sign-off (IDOR/replay). A revisited URL shows nothing.
- **[HIGH]** **Kiosk hardening on the counter device** — Chromium kiosk mode, no URL bar, no OS escape, auto-relaunch on crash, remote reboot path.
- **[HIGH]** **Inter-customer clearing** — all session state, renders, and cached assets purge on Done/timeout; idle screen is provably clean.
- **[MED]** **Session timeout** — unattended proof sessions auto-cancel (suggest 10 min) and notify the associate; customer walking away must not leave their job on screen.
- **[MED]** **Least-privilege station credential** — the station credential opens the event stream only; job content is reachable solely via the per-session tokens dispatched to it.
- **[MED]** **Physical mounting** — locked counter mount; the POC Pi especially (exposed ports) needs an enclosure. Fleet device gets this properly via the IT decision.

---

## 7. Hardware — POC now, fleet decision later

**POC (decided): Raspberry Pi + official touchscreen, Chromium kiosk.**
- Lowest unit cost; Ethernet-native (skips store Wi-Fi variability for the pilot); runs the web route with zero app development
- Known trade-off accepted for POC scope: no MDM story, hand-managed fleet — fine for pilot stores, **not** the 1,500-station answer
- POC build notes: boot-to-Chromium kiosk, watchdog/auto-relaunch, read-only filesystem overlay so power cuts don't corrupt the device, locked enclosure

**Fleet (deferred to IT):** candidates on the table are commercial kiosk tablets (e.g. Elo I-Series — PoE, MDM, retail-rated) vs. managed consumer tablets vs. scaling the Pi approach with a fleet-management layer. **Because the station is just a browser on a route, this choice is purely an IT/procurement decision with no application impact** — that separation is the point of the architecture.

**Network prerequisites to raise with IT before the POC install:** Ethernet drop vs. Wi-Fi at the counter position; VLAN placement relative to the MPS station and whether the proof service must be reachable across segments; proxy behavior for long-lived SSE connections (verify no aggressive idle-connection reaping — heartbeat interval may need tuning per store profile).

---

## 8. Open questions

1. **Retention period for the signed-proof artifact** — policy/legal owner to set; spec assumes order-record retention, not the 14-day scratch window.
2. **Network topology per store** — Ethernet availability at counters, VLAN/segmentation posture, SSE-friendliness of the store proxy profile (IT, pre-POC).
3. **Fleet device strategy** — IT decision after POC results; no application dependency.
4. **Signature legal weight** — whether finger-signature vs. typed-name attestation carries different standing for dispute handling (policy owner; both are captured identically by the system).

---

*Bottom line: the customer proof screen is a thin, server-fed viewer route paired to a counter station over SSE — cheap to pilot on a Raspberry Pi, hardware-agnostic by construction, and it turns the §8.12 sign-off requirement into a concrete, auditable artifact that also satisfies the security doc's re-approval gate.*
