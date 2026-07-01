# In-Store Suite — Feedback, Bug & Feature-Request Tracker — Functional Design

**Document type:** Functional design (behavior & flows; pre-technical-design)
**Status:** Draft v0.1 — for product review & refinement
**Author:** Jennifer Allen, Sr Mgr Product Management
**Last updated:** 2026-07-01

---

## 1. Overview

### 1.1 Purpose
Give every store a single, low-friction place to **report a bug, request a feature, and upvote what other stores raised** — from inside the tools they already use — and give the product team a **ranked, de-duplicated, release-aware** view of what the fleet needs. The tracker is also the suite's at-scale test signal: it ships early so the field can react to wires, prototypes, and beta features from day one.

### 1.2 Vision
> One "Give feedback" button on every counter. An associate reports a problem or an idea in one sentence; the tool captures the rest. Repeat requests from across the fleet automatically gather into one ranked item instead of scattering. Every item has a visible status, and when it ships, the stores that asked for it are told which release delivered it — closing the loop on "you said → we did," release by release.

### 1.3 Where it fits
The tracker is one shared surface across the whole suite — not a per-tool feature — reachable from the Publisher-replacement, the Word/PowerPoint/Excel handlers, the PDF toolkit, and the shared services.

---

## 2. Goals

- Let an associate file a bug or feature request in seconds, with rich context captured automatically.
- Let associates see and **upvote** what other stores raised, so shared pain rises to the top.
- Track everything at **store-ID level**, with an optional associate name.
- Let users **filter and roll up** feedback by the store hierarchy — store, district, region, or chain (all) — using fed-in store listing data.
- **Automatically consolidate** duplicate or near-duplicate topics into one ranked item, so repeats reinforce rather than scatter.
- Give every item a **visible status** and close the loop to the stores that raised it.
- Make participation **feel worth it** through visible, **collective recognition** — celebrate the stores whose feedback shaped the product — supported by light, purposeful motion that never gets in the way.
- **Track versions and releases**: show what shipped in each version, and tie every closed/delivered item to the release (and, for bugs, the fix) that resolved it.
- Turn scattered counter frustration into a **prioritized, evidence-backed queue** for the team.

---

## 3. Who this serves

| Role | What they do here |
|---|---|
| **Counter associate** (primary) | Reports bugs, requests features, upvotes, sees status and "what's new." The voice that matters most; effort must be near-zero. |
| **Champion / ambassador** | Goes deeper — validates, tags, and rallies their region; a trusted contributor, not an admin. |
| **Product / Ops team** | Reviews, de-duplicates, sets status, prioritizes, links items to releases, composes release notes. |
| **Store Ops / Comms** | Owns moderation — handles abuse/PII on the self-serve surface; the named owner required per Implementation Plan §7. |

---

## 4. The tracker at a glance — four surfaces

1. **The report entry** — a "Give feedback" affordance inside every tool. One tap opens a short form; the tool has already gathered the context.
2. **The board** — the population-wide, ranked list of open items. Browse, search, filter, upvote, comment, follow status.
3. **What's new / Releases** — the version history: each release, what shipped in it (features delivered and bugs fixed), and who asked for it. The public face of "you said → we did."
4. **The triage console** — the team-side view: ranked queue, de-dup suggestions, status and release management, telemetry context, and the moderation queue.

---

## 5. Functional behavior

### 5.1 Reporting — "Give feedback"

**Design principle:** the associate types one sentence; the tool captures everything else.

**Entry.** A persistent, unobtrusive "Give feedback" affordance is available inside every tool and never blocks counter work (it is opt-in and lightweight, per the engagement guardrails). Selecting it asks first: **"Report a problem"** or **"Request a feature."**

**Report a problem (bug).** The associate provides a short title and, optionally, a one-line description of what happened. Behind that, the tool automatically gathers and attaches, without the associate doing anything:
- which **tool / mode** they were in,
- the **file type**, detected dimensions, and the **product / catalog spec** in play,
- **what they were doing** and the **error or failure** that appeared,
- a short **recent-action trail** (the last few steps before it broke),
- **store ID, station/device ID, app version, and timestamp.**

**Attaching the offending file.** In one tap, the associate can attach the **actual customer file** that misbehaved — the single most useful artifact for reproducing a bug. No separate consent step is needed, since the suite already operates under permission to handle and review customer files; the file is still treated as sensitive and passes through the suite's existing intake handling and security/retention rules.

**Request a feature.** The associate provides a title and description of what they want and why. The tool tags it to the current tool/area automatically. No file capture unless they choose to attach an example.

**Before submit — see if it already exists.** As the associate types the title, the tracker surfaces **similar existing open items** (see §5.4). If one matches, they upvote it in one tap instead of filing a new report — this is the primary way duplicates are prevented.

**After submit.** The associate gets an immediate confirmation, the item (or the upvote) is recorded against their **store ID** (and name, if given), and they can follow it for status updates. Filing must feel finished in seconds.

### 5.2 The board — browse, upvote, follow

- **Population-wide, ranked view.** Everyone sees the same open items, ranked so the most-backed, highest-pain topics are at the top. Seeing that others share a problem is itself the point — it tells a store its pain is shared and prioritization is transparent.
- **Upvote.** One tap adds the store's backing to an item (see the vote model, §5.7). Upvoting is the main interaction and must be effortless.
- **Comment.** A simple comment adds context or a "+1 with a twist." Not a threaded forum.
- **Search & filter.** By keyword, by tool/area, by type (bug vs. request), and by status. Views can also be **scoped by the store hierarchy — store, district, region, or chain (all)** — so anyone can look at just their own store, their district or region, or the whole chain. A **"raised by my store"** filter lets a store pull up its own submitted items and check where each one stands — the store-level need is met by this filter, not a separate rollup view or dashboard.
- **Follow.** A store (or associate) can follow an item to be notified on status changes and release.

### 5.3 Item lifecycle & status

Every item carries a **visible status** at all times — the acknowledgment commitment: nothing disappears into a void. Bugs and feature requests share a spine but differ at the delivery end.

**Feature request statuses**

| Status | Meaning |
|---|---|
| New | Submitted, not yet reviewed. |
| Planned | Accepted; on the roadmap. |
| **Shipped** | Delivered — **tied to the release/version that delivered it** (§5.5). |
| Declined / Won't do | Not proceeding, with a short honest reason. |

**Bug statuses**

| Status | Meaning |
|---|---|
| New | Reported, not yet reviewed. |
| Planned | Scheduled for a fix. |
| **Fixed** | Resolved by a **fix tied to the release/version that shipped it** (§5.5). |
| Closed — can't reproduce / by design | Closed without a fix, with a short reason. |

**Who moves items:** the product/ops team sets status. Champions may propose tags or flag severity, but status transitions are a team action. Every transition is visible to followers and reporters.

### 5.4 Automatic consolidation of topics

The core requirement: repeat requests must **group and upvote together**, not scatter. Two behaviors.

**(a) Prevent at the source — "similar items" while typing.** As an associate writes a title, the tracker shows the closest existing open items: *"3 stores already raised something like this."* One tap upvotes the existing item. This is the highest-leverage consolidation step and the best associate experience — instant validation, no retyping, and the store's weight lands where it belongs.

**(b) Catch what slips through — suggested merges.** For items filed in different words but meaning the same thing, the tracker proposes consolidations to the triage team:
- Candidates are ranked by similarity and shown in **confidence bands** — *high* (propose a one-click merge), *medium* (surface for a human to review with both items side by side), *low* (not surfaced, to avoid noise). Exact band thresholds are a tuning decision for tech design; functionally, the team should never be drowned in weak suggestions.
- **A human always confirms.** The tracker suggests; it does not silently auto-merge.
- **Merging links and combines.** The duplicate becomes part of a single **canonical item**; the backing votes **aggregate** onto it, so its rank reflects the *combined* fleet demand.
- **Original context is never destroyed.** Each merged report keeps its own **store, timestamp, name (if given), and original words.** The canonical item *accumulates* evidence; it does not overwrite it. This matters twice over: the per-store wording is itself signal, and every store must be able to see that *their* report was captured, not flattened. This is the spine of "you said → we did."
- **Merges are reversible.** Any merge can be undone; the history is kept. Occasional wrong merges must be trivial to correct.

**(c) Theme clusters for triage.** Beyond one-to-one merges, the triage console groups related items into **themes** (e.g. "large-format import problems") so the team can see and act on a cluster, not just individual tickets. Grouping is a review aid — the team decides what is genuinely one problem.

### 5.5 Version & release tracking *(new — first-class)*

The tracker doesn't just collect requests; it **records what was delivered, and when.** This closes the loop with proof and gives the fleet a running history of the tool's improvement.

**Releases.** A **release** is a named version of the suite (e.g. *v1.4*) with a date and a set of delivered items. A release bundles:
- **Features shipped** — feature-request items moved to *Shipped* in that release.
- **Bugs fixed** — bug items resolved by a **fix** that shipped in that release.

**Automatic publishing.** Because the tracker is maintained in the **same repo/app as the suite it supports**, releases are **assembled automatically** — when the tools ship an update, the matching release and its delivered-items list appear without a manual release cut, and cadence follows the suite's own rhythm. (The field-facing release note that goes with it is drafted by Claude and approved by product before it's shown — see below.)

**Tying items to releases and fixes.**
- When a feature request moves to **Shipped**, it is associated with the **release/version** that delivered it. The item now shows "Shipped in v1.4."
- When a bug moves to **Fixed**, it is associated with the **fix** and the **release** that carried it. The item shows "Fixed in v1.4."
- The link is **two-directional**: from any delivered item you can see which release delivered it; from any release you can see every item (features + fixes) it contains, and — because context is preserved — which stores asked for each.

**What's new / Releases surface (for the field).**
- A running, reverse-chronological list of releases. Each entry is a **release note**: the version, its date, and a plain-language summary of what shipped — features and fixes — written for associates, not engineers.
- Release notes are **authored by Claude** from the delivered items, then **reviewed and approved by the product team** before publishing — so the changelog is a by-product of doing the work, not a separate chore. Claude drafts the plain-language wording; product signs off.
- Where a store asked for something in a release, that store is credited ("you asked, we shipped") and notified (§5.6).

**Version history / "what changed in version X."**
- Any associate can look up a version and see what it changed: the features it added and the bugs it fixed, in readable terms.
- The team retains an ordered history of releases so "what shipped when" is always answerable — for the field, for support, and for the team's own record.

### 5.6 Close-the-loop & "you said → we did"

- **Notifications (header icon + count).** A **notification icon in the main app header** carries a **count** of unread updates. A store is pinged on **status transitions** for items it has **reported, upvoted, or follows** — **including grouped items** (a store that backed a report later merged into a canonical still gets that canonical's updates). Each notification's **"see detail"** link opens the relevant **release notes** for the full picture.
- **Release-tied loop-closing.** When an item ships or a bug is fixed, the stores that raised or backed it are told **which release delivered it** — the loop closes with a concrete "here's the version that fixed your thing."
- **Celebrate the delivery.** **Every time** a request a store backed reaches *Shipped/Fixed*, its close-the-loop notification carries a brief, tasteful celebratory moment — the payoff of the whole loop (see §5.9).
- **Roadmap.** A simple public view of what's *Planned* and recently *Shipped*, mapped to the build phases, so the fleet can see direction.
- **The changelog is the Releases surface** (§5.5) — one source of truth for "what changed," doubling as lightweight change communication.

### 5.7 Identity, privacy & anti-abuse

- **Store as the unit of voice.** Items and votes are tracked at **store-ID level**. Prioritization reflects **how many distinct stores** back an item — a naturally spam-resistant, fleet-level demand read (and it makes merges cleaner: a merged item's rank becomes "N stores are asking for this").
- **Store hierarchy (fed-in data).** Store listing data — each store's **district, region, and chain** — is fed into the tracker so every item and vote can be **scoped and rolled up** to any level. This powers the field-facing filters (§5.2) and the team's demand read (§5.8), and lets prioritization be seen as, e.g., "raised across 9 stores in 3 districts" rather than a flat count. The directory is maintained as an **Excel document imported ad hoc**, so alignment changes are applied as they're executed. **Store numbers never change; district and region alignment can.** Activity always stays attached to the **store** — when a store's district or region changes, its rollup simply **shifts to the new alignment** going forward. No historical alignment is tracked; rollups always reflect the current directory.
- **Name or anonymous — the poster's choice.** The associate who posts an item (or casts a vote) chooses to **attach their name or stay anonymous**; by default it's attributed to the store only. Names are never required. Recognition and loop-closing land at the **store level** regardless (§5.9, §7), so staying anonymous costs a store nothing.
- **Vote model — one vote per store.** Each store gets a **single vote per item**, so a request's rank reflects **how many distinct stores** back it. A second vote attempt from a store that has already voted doesn't add another tally — the store's one vote already stands, however many associates share the station.
- **Moderation & safety.** Free text and attached files can carry profanity or PII. The Store Ops / Comms team has a **review/hide** path; the surface applies basic filtering and per-station rate limits. Attached customer files are the highest-sensitivity artifact: they are **retained for 14 days, then purged**, consistent with the security/PII posture. The 14-day rule governs the attached file itself — the item record and its release/version history persist.

### 5.8 Team / triage side

- **Ranked, filterable queue.** By store-reach, frequency, status, tool/area, severity, theme, and **org level — store, district, region, or chain (all)** — so demand can be read and compared at any tier, not just fleet-wide.
- **De-dup workspace.** Review and confirm suggested merges; manage canonical items and their preserved children (§5.4).
- **Status & release management.** Move items through their lifecycle; tie delivered items to releases and fixes; compose/curate release notes (§5.5).
- **Telemetry context.** Alongside an item, the team can see how often the related tool/file-type/error actually occurs in the field, so severity and reach are grounded in evidence, not just vote count. *(How telemetry is gathered and joined is a tech-design concern; functionally, the team sees the item with its real-world frequency.)*
- **Handoff to Claude Code.** The suite is built and maintained in **Claude Code**, so an item becomes a work handoff there rather than a ticket elsewhere. Product adds **notes on execution** (intent, context, constraints, what "done" looks like) and clicks to **generate a Claude Code handoff file** — the item bundled with those notes, ready for Claude Code to pick up and implement. The tracker stays the field-facing front door; the build itself happens in Claude Code.
- **Moderation queue.** Flagged content routed to the Store Ops / Comms team.

### 5.9 Engagement, recognition & motion

Participation has to feel worth it. Two levers do that work — **recognition** (making a store's impact visible) and **light motion** (small, purposeful touches that make the tool feel responsive and alive). Both are shaped by the same constraints as the rest of the suite: they run well on the in-store hardware and **never disrupt counter work.** The guiding principle is **collective recognition, not individual competition** — a fit for the store-anonymous model and the fleet's trust-first culture.

**Recognition (make impact visible).** All of these ship in the first release — recognition is core engagement, not a later add-on.
- **"You asked, we shipped."** A shipped item credits the **stores** that raised or backed it, and each release spotlights the contributing stores. This is both recognition and proof the loop works — the highest-value mechanic.
- **Store impact tally.** A quiet running count — *"Feedback from your store helped ship 7 improvements"* — framed as impact, not a score.
- **"You're not alone" signal.** *"12 stores backed this with you"* on an item, so a store sees its pain is shared.
- **Contribution milestones.** Gentle, thank-you-style markers for real moments — a store's first report, or a store's request that ships — always **store-level recognition, never a currency to farm.**
- **Light participation.** One-tap reactions and micro-polls (from the engagement plan) let a store take part without writing anything.
- **Collective momentum.** Fleet-wide framing — *"stores raised 40 ideas this month"* — as shared progress, never a shaming streak or individual ranking.
- **Top contributing stores spotlight.** A positive, **store-level** highlight of the stores contributing the most (e.g. a periodic "top contributing stores" spotlight) — celebrated as participation and impact, never a competitive ranking that singles out or shames quieter stores.

**Motion & micro-interactions (responsive, not showy).** Motion is used to **communicate state, not to perform**: an upvote is acknowledged as the count ticks up; a filed report confirms with a clear success cue; status changes transition smoothly; items reorder gently on the board as backing shifts; and content appears progressively while a slow station loads, so the tool feels fast. The one place a small celebratory flourish is spent is the **shipped/fixed moment** (§5.6) — the payoff of the loop. *(How motion is built is a tech-design concern; functionally it stays light, purposeful, and brief.)*

**Guardrails.**
- **Collective, never individual.** No **individual** associate-versus-associate rankings, leaderboards, or points-as-currency — these invite gaming, can erode genuine motivation, and read as surveillance. Recognize **stores** and impact, not individuals or raw activity volume. (Store-level spotlights that celebrate participation are fine; individual ones are not.)
- **Opt-in and non-intrusive.** Engagement moments never block order-taking or production, and are sized to the hardware.
- **Fun but subtle.** Animations should add a bit of delight without being obtrusive — subtle, brief, and never in the way of counter work.

**Sequencing note (decision in §9).** The recommendation is to treat **recognition and close-the-loop as core engagement** — shipped with the core loop, because they *are* the reason participation sustains — and treat purely **decorative motion as polish** that can follow.

---

## 6. Item & release lifecycle (consolidated)

**An item's life:**
`Reported (or upvoted)` → `de-dup check (may merge into a canonical, votes aggregate, context preserved)` → `triage & status` → `(feature) Planned → Shipped in vX` **or** `(bug) Planned → Fixed in vX` → `reporters notified with the release` → `visible forever in that release's history`. Declined/closed items end with a visible, honest reason.

**A release's life:**
`Open (accumulating delivered items)` → `dated & published as vX` → `release note composed from its items` → `appears in What's new / Releases` → `raising stores credited & notified` → `permanent version-history record`.

**Key connections:**

| From | You can see |
|---|---|
| A delivered item | The release (and fix) that delivered it, and every store that asked for it |
| A release | Every feature + fix it contains, and who requested each |
| A version-history lookup | What changed in that version, in plain language |
| A canonical item | All merged reports, each with its original store, name, time, and words |

---

## 7. Rules & edge cases (for PM refinement)

- **Merging preserves everything.** A merge never deletes a report or its wording; it links and aggregates. Unmerge restores the prior state.
- **Votes follow the merge.** Backing from a merged duplicate moves to the canonical; a store never loses its voice, and double-backing from one store collapses to one.
- **Status is honest.** Declined and can't-reproduce closures always carry a short reason; silence is not a status.
- **A bug fix maps to exactly one release** (the one that first shipped the fix), even if later releases also contain it.
- **Anonymous-by-store loop-closing.** If no name was given, the loop closes to the **store**, not an individual — the store still learns its request shipped.
- **Attached files are handled as sensitive.** Customer files attached to a report pass through the suite's existing intake and security/retention rules; no separate consent step is required, since the suite already operates under permission to handle them.
- **De-dup suggestions never auto-act.** A human confirms every merge and every status change.

---

## 8. Out of scope / explicitly deferred

- Per-person accounts, SSO for associates, or an associate directory (store-ID identity is the model).
- Threaded discussion / forum depth.
- Silent (no-human) auto-merge.
- Individual (associate-level) leaderboards, competitive rankings, or points-as-currency — recognition is collective and store-level; the store spotlight is the permitted form (see §5.9).
- Being the build environment — the suite is built and maintained in Claude Code; the tracker generates handoffs into that workflow, it doesn't replace it.

---

## 9. Open questions & decisions (for product review)

1. **Confidence bands for merges.** Where do we draw high/medium/low for surfacing suggestions? (Behavioral intent is set here; exact thresholds are a tech-design tuning task, but the team's tolerance for false suggestions is a product call.)
2. **Engagement in MVP vs. polish.** Confirm the recommendation: recognition/close-the-loop ships with the core loop; decorative motion follows as polish. (§5.9)

---

*For product review: refine the flows, the status vocabulary, the vote/name model, and the release model here — then this document hands off to technical design, which chooses how to build the behavior it describes. The three things that make this tracker worth building are the store-ID identity model, the one-tap bug capture that carries real reproducing context, and the automatic consolidation that keeps repeats reinforcing instead of scattering — now paired with release tracking so every closed item points at the version that delivered it, and every store sees the tool visibly getting better on their say-so.*
