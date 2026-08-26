# Fonts

The wires specify **Motiva Sans** (the Staples brand face). The licensed WOFF2 files were
supplied 2026-08-26 and now ship here:

```
public/fonts/MotivaSans-Light.woff2    (300)
public/fonts/MotivaSans-Regular.woff2  (400)
public/fonts/MotivaSans-Medium.woff2   (500)
public/fonts/MotivaSans-Bold.woff2     (700)
```

The matching `@font-face` declarations live in `src/app/globals.css`, and the font stack
there (`--font-sans`) lists "Motiva Sans" first, so the face applies app-wide. Weight 600
(`font-semibold`) has no file and resolves to the 700 face per CSS font matching.

Known quirk: the Regular file's internal name table is malformed (its family name reads as
junk bytes on every platform). Web rendering is unaffected — `@font-face` matches on the
CSS-declared name — but installing that file on an OS won't group it under "Motiva Sans".

---

## Import stand-ins (plan §10.5 — vendored, P2)

The subdirectories here (`arimo/`, `carlito/`, `caladea/`, `cousine/`,
`gelasio/`, `libre-franklin/`, `sorts-mill-goudy/`, `tinos/`) are **libre
webfonts self-hosted for the `.pub` import font library** — no CDN at runtime.
They are vendored from the pinned `@fontsource/*` devDependencies by:

```
node scripts/vendor-fonts.mjs
```

The catalog that consumes them (CSS stacks, FontFace registration) is
`src/lib/layout/font-catalog.ts`; lazy loading lives in
`src/lib/layout/webfonts.ts`. The stand-in model: a document that says
"Calibri" keeps saying Calibri — the local face renders where installed, the
metric-compatible stand-in (Carlito) everywhere else. Latin subset only for
now (store corpus is English).

Licenses: Arimo/Tinos/Cousine/Carlito/Caladea (metric-compatible cores),
Libre Franklin, Sorts Mill Goudy, and Gelasio are all OFL/Apache-licensed —
self-hosting is permitted; see each @fontsource package for the license text.
