# Session handoff — пташечка (bohdana-stitch)

Load with `@.claude/HANDOFF.md` at the start of a session. Written 2026-11-14 at commit `04d0232` (branch `dev`).

## What this is
A cross-stitch & bead pattern editor, made mainly for **перенабір** (e-copies of paper charts: trace a photo of the
chart, export `.oxs` for the reader apps **Хрестики** and **Ruta Stitch**). App name **пташечка** (renamed by the
user from бджілка; icon `src/app/icon.svg`). Ukrainian is the default locale (`/` → `/uk`, `localeDetection: false`).
Originally a single-file vanilla app `index.html` (still in the repo, still used by the user — **do not edit it**).

## Docs (read these first)
- `docs/SPEC.md` — behaviour spec of the old app + "*New app*" notes + §15 backlog (§9.6 image store, §9.7 .xbird
  files, §9.8 quick-start guide, §15.15 underlay/straighten/pad, §15.16 highlighting, §15.13 OXS partials).
- `docs/ARCHITECTURE.md` — levels, folders, extension points; §17 "Implementation notes" lists every recent addition
  with file paths.
- `AGENTS.md` — this Next.js version differs from training data; read `node_modules/next/dist/docs/` before Next APIs.

## Stack & commands
Next.js 16.4.6 (App Router, Turbopack, `src/proxy.ts` = next-intl middleware), React 19.3, TS strict, pnpm 12.16.1,
Node 24 via fnm (**run `eval "$(fnm env)"` before pnpm in the shell**), next-intl 4 (en/uk), zustand 5, Vitest 5,
Playwright (port 3200, `channel: "chrome"`), eslint-plugin-boundaries.
- `pnpm test` (149 unit), `pnpm test:coverage` (per-area minimums: core 85/75, editor 60), `pnpm lint`,
  `pnpm exec tsc --noEmit -p .`, `pnpm exec playwright test` (52 e2e: `editor.spec.ts` per feature, `flows.spec.ts`
  main journeys; kill port 3200 first: `lsof -ti :3200 | xargs kill` — it reuses a running server, so a stale build
  tests old code). The old "fails on page load" flake was a real bug (flush before start-up saved the blank
  placeholder over the draft), fixed 2026-11-16; stress check: `--repeat-each 8 --workers 12`.
- e2e helper `openEditor(page, locale, { firstVisit })` sets `stitchwork.guideSeen` so the guide doesn't block tests.

## Code map (levels: core ← render/editor ← ui ← app; persistence, platform, workers on the side)
- `src/core` pure TS: pattern model, layers, stitches/partials, transforms, calculator, formats (json v4 →
  `.xbird`, OXS import/export incl. `oxs/partials.ts` half-grid quarters/petites), underlay geometry,
  `geometry/homography.ts` (4-corner warp), `symbols/lineStyles.ts` (20 backstitch line styles).
- `src/render` canvas drawing (`ChartRenderer`, `primitives/cells.ts`, `primitives/lineStyles.ts`, theme).
- `src/editor` `Editor` class + services: history, commands (`commands/registry.ts`), keymap/ShortcutManager,
  tools (`resolveTool`), selection, references, `underlay/UnderlayService` (straighten), `images/ImageService`,
  autosave (draft 0.6 s + library every minute), snapshots (versions), `heavy.ts` (workers).
- `src/persistence` ports + local adapters; IndexedDB `stitchwork` v4 stores refs/snaps/underlays/**images**
  (Blobs by content id `img:…`, GC 10 s after boot, old data-URL records migrated on read).
- `src/ui` header (Menu ▾ first, toolbar with groups, Transform, i shortcuts popover, language, panel toggle),
  side (Drawing-with card, Key with highlight eye, underlay panel incl. opt-in pad checkbox, fabric, totals),
  stage (canvas, view switch stacked over zoom, underlay pad), status (active entry), dialogs (incl.
  `StraightenDialog`), `guide/Guide.tsx` (quick-start tour, opens menus via `menuReveal`), `common/Tooltips.tsx`.
- Messages: `messages/en.json`, `messages/uk.json` (same keys; edit via JSON load/dump, `ensure_ascii=False, indent=2`).

## Recent features (all committed on `dev`)
Backstitch line styles + strand widths (2× then halving) · regrouped toolbar in header · one-click brush sizes ·
Menu with submenus (New, Export, Reference pictures) · `.xbird` pattern files (old `.json` still opens) ·
image behind chart: 4-corner straighten editor (worker warp, original kept), opt-in floating move/resize pad ·
stitch highlighting (V) · minute autosave to library, Versions dialog · resizable side panel · fast tooltips ·
fabric counts 11/14/16/18 Aida + 20/24/31 over 1 · delete-confirmation for saved patterns · OXS quarters/petites on
the half grid (fixes 4 quarters stacking in Хрестики) · Pattern info dialog: OXS fields first (name, author,
copyright, instructions — the only ones OXS has), rest folded · quick-start guide (first visit only, Menu reopens).

## Current state / open items
- Working tree: **user's own uncommitted change** — added `@vercel/speed-insights` to package.json + lockfile
  (not wired into the app yet). Don't commit it unless asked.
- Deploy: **GitHub Pages was abandoned** (static export needed proxy removal, root redirect, basePath; all reverted).
  Target is **Vercel** as-is: import repo at vercel.com/new, env `ENABLE_EXPERIMENTAL_COREPACK=1`, Node 24.x,
  production branch `main` (only `main` exists on origin; work is on `dev` — merge & push, or set prod branch to dev).
- Ideas offered, not built: auto backstitch outline between colours, text/alphabet tool, PDF chart export with page
  overlaps (SPEC §15.10), multi-brand threads (§15.8), rotation for underlay, chart checks redesign (§15.4 removed).
