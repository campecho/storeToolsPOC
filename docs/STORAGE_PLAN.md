# Storage Plan — local device files for the host POC

**Status:** Plan of record for POC storage, 2026-08-20 — **P1 and P2 shipped the same
day** (user-directed): the layout editor's File menu opens and saves `.staples` files
with the default-folder grant, recents, and the fallback tier
(`src/lib/storage/`, `src/components/layout-editor/ribbon/FileMenu.tsx`; registry row
in `STUBS.md`). P3 (photo documents) and P4 (recovery hardening) remain planned. This
plan aligns the POC with the storage requirement adopted in
`publisher-prototype/PLAN.md` §6.9 (plan v2.4). Nothing here changes the prototype —
its plan is its own.

## The requirement

Storage is **local device storage only**: documents open from and save to real files
on the device's filesystem — no cloud, no server, no browser-storage stand-in as the
primary store. The native document format is **`.staples`** (renamed from the `.cdoc`
working name in `publisher-prototype/docs/microsoft_publisher_feature_requirements.md`
§13.2). A **default storage folder** is the default target for every open and save.

## Where the POC is today

- **No document files exist.** The layout editor autosaves its single working document
  to localStorage (`stp-layout-v1`, every state change, via zustand `persist` —
  `src/lib/store/layout-store.ts`); the photo editor does the same under
  `stp-photo-v1`. Asset bytes live separately in IndexedDB (`stp-assets-v1`,
  `src/lib/assets/blob-store.ts`).
- The ribbon's **File tab is an inert label** (`RibbonTabs.tsx`); there is no
  open/save-as/recents, and the only save-to-disk path in the repo is the photo
  editor's rendered-image download (`downloadBlob`, `src/lib/photo/client.ts`).
- The one migrate-on-read implementation (layout v1 → v2,
  `src/lib/schema/layout-v1.ts`) is the pattern the `.staples` version gate keeps.
- `docs/LAYOUT_EDITOR_PLAN.md` §7.3 recorded "single working document … multi-document
  / open / save-as is backlog" — **this plan supersedes that line**: the backlog item
  is now the requirement.

## Target architecture

The POC adopts the same design the prototype specifies in PLAN.md §6.9 — read that
section first; this file only records the POC-specific deltas.

- **Format:** the identical `.staples` container (ZIP: `manifest.json`,
  `document.json`, `assets/<id>`). The POC's payload is its own schema-v2 layout
  document (or photo document); the manifest names which schema and version the
  payload carries, so one extension serves both apps and the eventual v3 world.
  The prototype owns the format spec; the POC copies it (prior-art direction is
  reversed here — the POC follows).
- **Default folder:** one-time `showDirectoryPicker({ mode: "readwrite" })` grant,
  handle persisted in IndexedDB, Chromium ≥122 persistent permission, `startIn:` on
  every picker, in-app Open dialog enumerating the folder's `.staples` files. One
  grant, stored once, shared by the layout and photo editors.
- **Provider seam:** a `StorageProvider` (File System Access primary,
  download/upload fallback for non-Chromium) in `src/lib/storage/`, injected for
  tests. Store hardware is managed Chromium, so the fallback is a safety net, not a
  second product.
- **Demotion, not removal, of today's persistence:** localStorage keeps exactly one
  job — crash/refresh recovery of unsaved changes (the requirement's autosave
  clause) — and stops being the document's home. The IndexedDB blob store stays as
  the working asset cache; save packs those bytes into the file, open unpacks them
  back.

## Phases

| Phase | Delivers |
|---|---|
| **P1 — File tab goes live (layout)** ✅ shipped | Open / Save / Save As `.staples` in the layout editor; retained file handle for silent Ctrl+S; dirty tracking + `beforeunload`; the working localStorage document becomes a file on its first save |
| **P2 — Default folder** ✅ shipped | Setup flow + persisted grant shared across editors (`stp-storage-v1`); `startIn` everywhere; in-app open-from-folder listing; recents |
| **P3 — Photo documents** | Photo editor saves/opens `.staples` too (recipe + source assets in the container), matching the prototype's one-format decision for `kind: "image"` documents |
| **P4 — Recovery hardening** | localStorage reduced to recovery snapshots keyed against the file's saved state; quota/permission failures surfaced in UI (closes the silent-`console.warn` PROD-TODO in `STUBS.md`) |

## Can a default storage folder be supported?

**Yes — as a remembered choice, not a hard-coded path.** On Chromium (the store
profile) the app asks once, persists the directory handle, and thereafter opens from
and saves into that folder without prompting — including listing its contents in-app.
What a browser cannot do: silently target a provisioned OS path with zero setup;
enterprise policy can allow the permission prompts but cannot pre-grant a directory.
If a mandated fixed path ever becomes binding, the contingency of record (prototype
`SEAMS.md`, 2026-08-20 entry) is a thin desktop shell over the same code with the
`StorageProvider` as its seam. Non-Chromium browsers fall back to download/upload,
where the browser's download directory wins and no folder control exists.

## Non-goals

- No cloud, server, or sync storage of documents — the requirement, not a deferral.
- The proof-station plan's in-memory server session state
  (`docs/CUSTOMER_PROOF_STATION_PLAN.md`) is out of scope here: it is transient
  cross-device session state, not document storage.
- No change to the feedback tracker's localStorage — it is a seeded demo, not a
  document tool.
