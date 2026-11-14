# Stitchwork — Next.js Architecture Plan

> Status: **plan**, 2026-11-14. Source of truth for behaviour: [`SPEC.md`](./SPEC.md) and the current `index.html`.
> Goal: a codebase a person can find their way around in minutes, where each kind of change
> touches a small, predictable set of files.

---

## 1. Guiding principles

1. **Four levels, one direction.** Code is split into levels; a level may only import from the levels below it.
   The domain (cross-stitch rules, maths, file formats) knows nothing about React, the canvas, Next.js or storage.
2. **The editor is a client app inside a Next.js shell.** Next.js provides routing, i18n, fonts, metadata, and
   later auth/API/DB. The editor itself is browser-only (canvas, pointer events, IndexedDB) and is rendered as a
   single client boundary. We don't force server rendering where it adds nothing.
3. **Registries over `if/else` chains.** Tools, shortcuts/commands, stitch types and shopping calculators are
   each a list of plain objects. Adding one means adding a file and one line to the registry.
4. **Ports for anything that will change backend.** Saving/loading goes through interfaces. Today they're backed
   by localStorage/IndexedDB; tomorrow by an API + database — with no changes to the editor or UI.
5. **No user-facing strings below the UI level.** Core returns data and message keys, and the UI translates them.
6. **Pixels are configuration.** Every canvas colour, line width and ratio lives in one theme object shared by the
   screen renderer and the PNG exporter.
7. **File format compatibility is sacred.** JSON v3 and OXS round-trip exactly like today (golden tests).

---

## 2. The levels

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │ L4  app/            Next.js routes, layouts, metadata, i18n wiring    │  thin
 ├──────────────────────────────────────────────────────────────────────┤
 │ L3  ui/             React components, dialogs, panels, hooks          │  presentation
 ├──────────────────────────────────────────────────────────────────────┤
 │ L2  editor/         state store, commands, tools, shortcuts,          │  application
 │     render/         viewport, history · canvas drawing (no React)     │
 ├──────────────────────────────────────────────────────────────────────┤
 │ L1  core/           domain: pattern model, colours, catalog, stitch   │  pure TypeScript
 │                     types, geometry, calculator, file formats         │  (no DOM)
 └──────────────────────────────────────────────────────────────────────┘
   side: persistence/  ports (interfaces) + local adapters  — used by L2
         platform/     browser services: download, file pick, font probe, image decode
         workers/      Web Workers for heavy core functions
         (future) server/  DB, auth — server-only, used by app/api routes
```

**Import rules** (enforced by ESLint, see §12):

| Level | May import from |
|---|---|
| `core` | nothing (only other `core` modules) |
| `persistence`, `platform` | `core` |
| `render` | `core` |
| `editor` | `core`, `render`, `persistence` (ports only), `platform` |
| `ui` | `editor`, `render`, `core` (types + pure helpers), `platform` |
| `app` | `ui`, `i18n` |

So the domain is testable in plain Node, the editor works without React, and the UI can be rearranged freely.

---

## 3. Folder structure

```
stitchwork/
├─ messages/                         translations (one JSON per locale)
│  ├─ en.json
│  └─ uk.json
├─ public/
├─ src/
│  ├─ app/                           ── L4 ─────────────────────────────────────────
│  │  ├─ [locale]/
│  │  │  ├─ layout.tsx               <html lang>, fonts (next/font), NextIntlClientProvider, metadata
│  │  │  ├─ page.tsx                 server component → renders <EditorEntry/> (client, no SSR)
│  │  │  └─ not-found.tsx
│  │  ├─ globals.css                 UI design tokens (CSS variables)
│  │  └─ (future) api/patterns/…     Route Handlers for DB persistence
│  │
│  ├─ i18n/                          next-intl config: routing.ts, request.ts, navigation.ts
│  │
│  ├─ ui/                            ── L3 ─────────────────────────────────────────
│  │  ├─ EditorEntry.tsx             'use client'; dynamic(() => import('./EditorApp'), { ssr:false })
│  │  ├─ EditorApp.tsx               creates the editor instance, providers, mounts the layout
│  │  ├─ layout/
│  │  │  ├─ EditorLayout.tsx         slot-based shell: header | stage | side | status
│  │  │  └─ layout.module.css
│  │  ├─ header/                     PatternName, FileMenu, ViewSwitch, ExportMenu
│  │  ├─ stage/                      ChartCanvas, ZoomControls, MiniToolbar, DropZone
│  │  ├─ side/                       ToolBar, KeyPanel, KeyRow, FabricPanel, TotalsPanel
│  │  ├─ status/                     StatusBar
│  │  ├─ dialogs/
│  │  │  ├─ key-entry/               KeyEntryDialog, ThreadPicker, BeadPicker, BlendEditor, SymbolGrid
│  │  │  ├─ NewPatternDialog.tsx, OpenPatternDialog.tsx, ResizeDialog.tsx
│  │  │  ├─ ImageImportDialog.tsx, SaveToFileDialog.tsx, ConfirmDialog.tsx
│  │  ├─ references/                 ReferenceLayer, ReferenceWindow, ReferenceToolbar
│  │  ├─ common/                     Modal, Toast, Menu, Swatch, KeyIcon, IconButton, Icon
│  │  ├─ i18n/                       formatKeyLabel(), formatShoppingLine() — data → translated text
│  │  └─ hooks/                      useEditor(selector), useCommand(id), useToast()
│  │
│  ├─ editor/                        ── L2 application ─────────────────────────────
│  │  ├─ createEditor.ts             builds one Editor instance: store + services + registries
│  │  ├─ store/
│  │  │  ├─ editorStore.ts           Zustand vanilla store (see §5)
│  │  │  └─ selectors.ts
│  │  ├─ actions/                    every state change goes through here
│  │  │  ├─ paint.ts                 paintCells, eraseCells, fill, addSegment, eraseSegments
│  │  │  ├─ keyEntries.ts            addEntry, updateEntry, deleteEntry, setActive
│  │  │  ├─ pattern.ts               newPattern, resize, setFabric, rename, loadDocument
│  │  │  └─ importExport.ts          exportAs(format), importFile(file)
│  │  ├─ history/history.ts          patch-based undo/redo (see §5.3)
│  │  ├─ commands/
│  │  │  ├─ types.ts                 Command { id, labelKey, run, isEnabled? }
│  │  │  └─ registry.ts              all commands (tool.select, history.undo, view.zoomIn, file.save…)
│  │  ├─ shortcuts/
│  │  │  ├─ keymap.ts                declarative bindings → command ids
│  │  │  └─ ShortcutManager.ts       key matching, "hold" bindings, ignore-in-inputs rules
│  │  ├─ tools/
│  │  │  ├─ types.ts                 Tool interface
│  │  │  ├─ registry.ts              ordered list → toolbar is generated from it
│  │  │  ├─ ToolManager.ts           routes pointer events to the active tool, momentary tools
│  │  │  ├─ pencil.ts  line.ts  rect.ts  filledRect.ts  fill.ts
│  │  │  ├─ eraser.ts  picker.ts  pan.ts
│  │  │  └─ backstitch.ts            used automatically when the active entry is a backstitch
│  │  ├─ viewport/viewport.ts        zoom, pan, fit, screen ↔ grid conversion
│  │  ├─ references/references.ts    reference windows state + persistence
│  │  └─ autosave.ts                 debounced draft save + flush on pagehide
│  │
│  ├─ render/                        ── L2 drawing (no React) ──────────────────────
│  │  ├─ theme.ts                    CanvasTheme: every colour / width / ratio (see §8)
│  │  ├─ ChartRenderer.ts            screen: culling, rAF batching, overlays from active tool
│  │  ├─ exportChart.ts              PNG chart & preview (uses the same primitives)
│  │  ├─ keyIcon.ts                  small key-entry icons (list, PNG key, mini toolbar)
│  │  ├─ referenceRenderer.ts
│  │  └─ primitives/
│  │     ├─ stitches.ts              one draw function per stitch type id (see §9)
│  │     ├─ beads.ts  backstitch.ts  symbols.ts  grid.ts  rulers.ts
│  │
│  ├─ core/                          ── L1 domain (pure TS) ────────────────────────
│  │  ├─ color/                      colorMath.ts (sRGB, linear, Lab, ΔE), colorEntry.ts (mkColor)
│  │  ├─ catalog/
│  │  │  ├─ data/dmc.json            488 threads (extracted from DMC_RAW, order preserved)
│  │  │  ├─ data/millhill.json       527 beads with series
│  │  │  ├─ catalog.ts               lookup by id, search(query), sort(by number | colour)
│  │  │  └─ beadShapes.ts
│  │  ├─ symbols/symbols.ts          ordered symbol list, firstFreeSymbol, normalise (U+FE0E)
│  │  ├─ pattern/
│  │  │  ├─ types.ts                 Pattern, KeyEntry, Layers, Segment, Blend, Combo, CustomColor
│  │  │  ├─ createPattern.ts
│  │  │  ├─ resolve.ts               getEntry(id) for dmc/bead/custom/blend/combo
│  │  │  ├─ keyEntries.ts            sameKey, findSameKey, occupancy rules (override)
│  │  │  ├─ blends.ts  combos.ts
│  │  │  └─ resize.ts
│  │  ├─ stitches/
│  │  │  ├─ types.ts                 StitchType interface
│  │  │  └─ registry.ts              full, half, halfb (+ future types)
│  │  ├─ geometry/                   bresenham, floodFill, shapes, brush, mirror, segmentDistance, snap
│  │  ├─ calculator/
│  │  │  ├─ usage.ts                 counts per entry, backstitch lengths (pure facts)
│  │  │  ├─ types.ts                 ShoppingCalculator, ShoppingList
│  │  │  ├─ registry.ts
│  │  │  └─ classicSkeins.ts         today's algorithm (SPEC §7.2)
│  │  ├─ labels/keyLabel.ts          returns structured label parts, NOT text
│  │  ├─ formats/
│  │  │  ├─ json/  serialize.ts  parse.ts  rle.ts  migrations.ts (v1→v3)
│  │  │  ├─ oxs/   exportOxs.ts  importOxs.ts  resolveCodes.ts
│  │  │  └─ csv/   exportCsv.ts
│  │  └─ imageToPattern/             quantize.ts (works on pixel arrays), findBlends.ts
│  │
│  ├─ persistence/                   ── ports + adapters ─────────────────────────
│  │  ├─ ports.ts                    PatternRepository, ReferenceRepository, DraftStore
│  │  ├─ local/
│  │  │  ├─ localPatternRepository.ts    "stitchwork.library" (compatible keys)
│  │  │  ├─ indexedDbReferenceRepository.ts  "stitchwork" DB, "refs" store (compatible)
│  │  │  └─ localDraftStore.ts           "stitchwork.current"
│  │  └─ index.ts                    the ONE place that picks implementations
│  │
│  ├─ platform/                      download.ts, pickFile.ts, decodeImage.ts, fontProbe.ts, clipboard.ts
│  └─ workers/                       imageToPattern.worker.ts, findBlends.worker.ts
│
├─ tests/
│  ├─ fixtures/                      1.json, 1.oxs (+ more real patterns)
│  └─ e2e/                           Playwright specs
├─ eslint.config.mjs                 includes level boundary rules
├─ next.config.ts
└─ vitest.config.ts
```

Unit tests sit next to their files (`floodFill.test.ts`). Each folder has a short `README.md` only where the
folder's role isn't obvious from its name (`editor/tools`, `core/stitches`, `persistence`).

---

## 4. Next.js usage

| Concern | Decision | Why |
|---|---|---|
| Router | App Router, single route `/[locale]` for the editor | One-screen app; locale prefix enables i18n now and `/[locale]/patterns`, `/[locale]/p/[id]` later |
| Rendering | `layout.tsx` + `page.tsx` are **Server Components**; editor loaded through `EditorEntry` with `dynamic(..., { ssr: false })` | Canvas, pointer, IndexedDB and font probing are browser-only; avoids hydration mismatches; the shell, metadata and messages still come from the server |
| Fonts | `next/font/google` for Fraunces and DM Sans | Self-hosted and no layout shift. The canvas waits for `document.fonts.ready` before probing symbols |
| i18n | `next-intl` (App Router integration, middleware locale detection) | Standard for App Router; messages loaded on the server, client gets only what it needs |
| Styling | CSS Modules per component + CSS variables in `globals.css` | Theme changes in one file; no global class collisions; no utility-class soup in a dialog-heavy UI |
| Metadata | `generateMetadata` in `[locale]/layout.tsx` | Localised title/description |
| Heavy work | Web Workers (`new Worker(new URL('…', import.meta.url))`) for image → pattern and blend finder | `findBlends` is ~120k pair evaluations; image quantisation can freeze the UI |
| Data files | DMC / bead JSON imported statically by `core/catalog` | ~60 KB, needed instantly, cacheable |
| Future server | Route Handlers in `app/api/**`, DB and auth code in `src/server/**` marked `import 'server-only'` | Keeps secrets and DB clients out of client bundles |
| Deployment | Default Node/Vercel output (not `output: 'export'`) | We'll need server routes for login/DB soon. Today it works statically anyway |

What we deliberately **don't** use: Server Actions for editing (the document lives in the browser), React state for
grid cells (too slow), or a component library (the UI is small and custom).

---

## 5. Editor state & data flow

### 5.1 One editor instance
`createEditor()` builds a plain object holding the store, history, viewport, tool manager, shortcut manager,
command registry and persistence services. React receives it through a context. Non-React code (canvas renderer,
shortcuts, tools) uses it directly. This keeps the hot paths free of React re-renders.

### 5.2 Store shape (Zustand vanilla store)
```ts
interface EditorState {
  doc: Pattern;              // the document (layers are typed arrays, mutated in place by actions)
  docRevision: number;       // ++ on every change → renderer & panels subscribe to this
  keyRevision: number;       // ++ when key entries change (key list, palette cache)
  ui: {
    tool: ToolId; momentaryTool: ToolId | null;
    activeEntry: number;     // key index, 0 = none
    view: 'color' | 'both' | 'symbols';
    brush: 1|2|3|4|5; mirror: boolean; override: boolean;
    panelCollapsed: boolean;
  };
  status: { hoverCell: Cell | null; saveState: SaveState };
}
```
Typed arrays are **not** copied into React state. Actions mutate the document and bump a revision number.
React components subscribe with selectors, for example `useEditor(s => s.keyRevision)`. Derived data such as
usage counts and the shopping list is memoised per revision and computed off the pointer path (debounced like today).

### 5.3 History: patches, not snapshots
Today each undo step copies all layers. For a 500×500 pattern that's ~1 MB × 60 steps. The new history stores **patches**:
```ts
type Patch =
  | { kind: 'cells'; layer: LayerId; indices: Uint32Array; before: Uint16Array; after: Uint16Array }
  | { kind: 'segments'; added: Segment[]; removed: Segment[] };
history.transaction(label, () => { /* actions record patches */ });
```
A stroke is one transaction. Empty transactions are dropped, which matches "a stroke that changed nothing is not
an undo step". Key-entry deletion and resize stay as "clear history" events, as in the spec. Changing that later
is a local change in `history.ts`.

### 5.4 Flow of a pencil stroke
```
pointerdown on <ChartCanvas>
  → ToolManager.pointerDown(gridPoint, modifiers)          editor/tools
     → resolves tool (momentary Alt → picker; backstitch entry → backstitch tool)
     → pencil.onPointerDown(ctx)
         → history.transaction → actions.paintCells(cells)  editor/actions
              → core/geometry (brush, mirror) + core/pattern (occupancy rules)
              → store.docRevision++
  → ChartRenderer (subscribed) schedules one rAF redraw     render/
  → KeyPanel / TotalsPanel recompute after 300 ms           ui/ (selectors)
  → autosave debounced 600 ms → persistence DraftStore      editor/autosave
```

---

## 6. Extension points (what you asked to stay easy)

### 6.1 Adding a tool
```ts
// editor/tools/types.ts
export interface Tool {
  id: ToolId;
  icon: IconName;
  labelKey: MessageKey;            // translated in UI
  cursor(ctx: ToolContext): Cursor;
  usesBrush?: boolean;             // shows the brush-size hover square
  appliesTo?(entry: KeyEntry | null): boolean;
  onPointerDown(ctx: ToolContext, p: GridPointer): void;
  onPointerMove?(ctx: ToolContext, p: GridPointer): void;
  onPointerUp?(ctx: ToolContext, p: GridPointer): void;
  onCancel?(ctx: ToolContext): void;                // Esc / tool switch
  drawOverlay?(g: CanvasRenderingContext2D, ctx: OverlayContext): void;  // previews, rubber bands
}
```
**Recipe:** create `editor/tools/myTool.ts` → add it to `tools/registry.ts` (order = toolbar order) → add
`tools.myTool` to `messages/*.json` → optionally bind a key in `keymap.ts`. Toolbar, mini toolbar, tooltips and
the help list are generated from the registry.

### 6.2 Adding a shortcut
All actions are **commands**. Buttons, menus and keys call the same command ids.
```ts
// editor/shortcuts/keymap.ts
export const keymap: Binding[] = [
  { keys: 'mod+z',       command: 'history.undo' },
  { keys: 'mod+shift+z', command: 'history.redo' },
  { keys: 'mod+y',       command: 'history.redo' },
  { keys: 'mod+s',       command: 'file.save' },
  { keys: 'p',           command: 'tool.select', args: 'pencil' },
  { keys: 'shift+r',     command: 'tool.select', args: 'filledRect' },
  { keys: '1..9',        command: 'key.selectNth' },
  { hold: 'Space',       command: 'tool.momentary', args: 'pan' },
  { hold: 'Alt',         command: 'tool.momentary', args: 'picker' },
  // …
];
```
`mod` = ⌘ on macOS, Ctrl elsewhere. `ShortcutManager` handles the rules from the spec: ignore keys while typing
in inputs or while a modal is open, release hold-keys on window blur, and ignore auto-repeat for hold bindings.
**Recipe:** add one line (and a command if it's a new action). The status-bar hint and a future "Keyboard
shortcuts" dialog are generated from the keymap, and later user-customisable keymaps only need to merge a user
override over this list.

### 6.3 Changing the UI layout
`EditorLayout` has named slots (`header`, `stage`, `side`, `status`, `overlays`). Panels are self-contained:
each reads the editor through hooks and takes no props from parents. Moving the key list into a left sidebar,
making panels collapsible/tabbed, or building a mobile layout means editing `EditorLayout` and its CSS only.

### 6.4 Changing the look of the canvas
See §8: one `CanvasTheme` object. The UI chrome uses CSS variables in `globals.css`.

### 6.5 Adding new kinds of stitches ("added crosses")
See §9: the stitch-type registry.

### 6.6 Changing how the shopping list is calculated
See §10: usage facts are separate from calculator strategies.

### 6.7 Localization
See §11.

### 6.8 Login and database
See §13.

---

## 7. Core domain notes

- **Types mirror the spec** (SPEC §3). `Pattern.layers` is a record `{ stitches: Uint16Array; beads: Uint16Array }`
  plus `segments: Segment[]`. Keeping layers as a map rather than fixed fields leaves room for new layers.
- **Key labels are data**:
  `keyLabel(entry) → { kind:'thread', brand:'DMC', code:'310', name:'Black', strands:2, stitchType:'full' }`.
  The UI turns it into "DMC 310 — Black · 2 strands · full cross" in the current language.
- **Catalog**: `catalog.search(kind, query, { series, sort })` holds the matching rules from SPEC §8.1.
  Custom colours come from the pattern, so search takes them as an argument.
- **Formats** are pure `(Pattern) → string` and `(string) → { pattern, report }`. `report` lists simplified items
  as data (`{ code:'oxs.simplified', count: 3 }`) for the UI to translate.
- **Image → pattern** takes `ImageData`-like `{ width, height, data }`, so it runs in a worker or in Node tests.

---

## 8. Canvas appearance — `render/theme.ts`

Everything visual on the canvas becomes a named value. It's used by both the on-screen renderer and the PNG exporter.

```ts
export const defaultCanvasTheme = {
  stageBackground: '#E9E2D5',
  accent: '#B5452F',
  grid: { minor: 'rgba(60,45,30,.22)', minorSymbols: 'rgba(0,0,0,.28)', major: 'rgba(30,20,10,.65)',
          majorEvery: 10, minMinorZoom: 5 },
  symbols: { font: '600 {px}px "DM Sans", system-ui, sans-serif', minZoom: 9,
             scale: { full: .68, half: .56, bead: .5, combo: .5 }, darkInk: '#1d1a16' },
  halfStitch: { colorWidth: .34, symbolWidth: .07, symbolColor: 'rgba(0,0,0,.38)' },
  bead: { outline: 'rgba(0,0,0,.55)', highlight: 'rgba(255,255,255,.85)', shade: -.35, comboScale: .8 },
  backstitch: { baseWidth: .07, perStrand: .035, maxStrands: 4, lightThreshold: 215, darken: -.45 },
  rulers: { size: 26, background: '#F4EFE6', text: '#7A7064' },
  preview: { alpha: .55 },
  export: { chartCell: [16, 24], previewCell: [4, 12], margin: { chart: 40, preview: 16 }, keyColumnWidth: 420 },
} satisfies CanvasTheme;
```
Small appearance changes are a one-line edit. A themes switcher (high contrast, dark stage, print-optimised
export) becomes "pass a different theme object".

---

## 9. Stitch types — `core/stitches` + `render/primitives/stitches.ts`

```ts
// core/stitches/types.ts  (pure: rules + numbers)
export interface StitchType {
  id: StitchTypeId;                // 'full' | 'half' | 'halfb' | …
  labelKey: MessageKey;            // "full cross", "half cross ╱"
  glyph: string;                   // shown on the type picker button: ✕ ╱ ╲
  threadFactor: number;            // used by calculators: full 1, half 0.5
  countsAs: 'full' | 'partial';    // totals row
  oxs: { export: OxsStitchExport; importMatch?: OxsImportMatcher };
}
// render/primitives/stitches.ts  (drawing, keyed by the same id)
export const stitchPainters: Record<StitchTypeId, StitchPainter> = { full, half, halfb };
```
**Recipe for a new cell-sized stitch** (e.g. a petite cross or a "cross + border" variant): add an entry to
`core/stitches/registry.ts`, add a painter, add translations, and add OXS mapping if one exists. The key-entry
dialog, totals, calculator, PNG export and OXS export pick it up automatically.

**Sub-cell stitches** (quarter, three-quarter, French knots) need more than one stitch per square. The model
already allows a new layer (`layers.partials` as a sparse list `{ cell, corner, entry }`). That would be a planned
feature touching core, renderer, eraser/picker and OXS. The structure doesn't block it, but it isn't free.

---

## 10. Shopping calculator — `core/calculator`

Two separate steps:

```ts
// 1. Facts — never changes when the shopping rules change
export function computeUsage(p: Pattern): UsageReport;
// per key entry: { cells, segments, segmentLength } + totals by stitch type

// 2. Strategy — swap or add freely
export interface ShoppingCalculator {
  id: string;                      // 'classic-skeins'
  labelKey: MessageKey;
  defaults: Record<string, number>;          // e.g. { stitchesPerSkein: 3600, backstitchFactor: .42 }
  calculate(input: { pattern: Pattern; usage: UsageReport; settings: Record<string, number> }): ShoppingList;
}
export interface ShoppingList {
  lines: Array<{ item: ColorRef; kind: 'thread' | 'bead' | 'other';
                 quantity: number; unit: 'skein' | 'meter' | 'bead' | 'pack'; detail?: LabelData }>;
  notes: MessageKey[];
}
```
- `classicSkeins.ts` is today's logic (SPEC §7.2) with its constants turned into `defaults`.
- Panel, CSV and PNG key all render a `ShoppingList`, so a new calculator needs no UI or export changes.
- Stitch factors come from the stitch-type registry (`threadFactor`), not hard-coded `0.5`.
- Room for: thread length in metres, waste %, cost per item, packs of beads, per-brand skein sizes, user-adjustable
  settings stored on the pattern (`pattern.calculator = { id, settings }`).

---

## 11. Localization

- **Library:** `next-intl`. Locale in the URL (`/en`, `/uk`), detected by middleware, default `en`.
- **Messages:** `messages/<locale>.json`, namespaced by area: `header.*`, `tools.*`, `keyDialog.*`, `toasts.*`,
  `export.*`, `stitches.*`, `calculator.*`. All strings from SPEC §13 move here verbatim as `en`.
- **Rule:** `core`, `editor` and `render` never build user-visible sentences. They emit message keys + params
  (`toast({ key: 'toasts.entryDeleted' })`). The UI translates them.
- **Exports with text** (CSV headers, PNG key heading, OXS `name` suffixes) receive a `translate` function as a
  parameter, so files come out in the user's language. OXS technical attributes stay English.
- **Numbers/dates:** `useFormatter()` (Intl) for counts, dates in the Open dialog, inches/cm.
- **Thread names** (e.g. "Black") stay English initially, since that's how the manufacturer publishes them.
  The catalog can add optional `names: { uk: … }` later without code changes elsewhere.
- **Layout:** CSS uses logical properties (`margin-inline-start`), which keeps RTL possible.

---

## 12. Quality: tests and guardrails

| What | Tool | Notes |
|---|---|---|
| Domain logic | Vitest | Geometry, colour maths, occupancy rules, calculator, formats |
| **Golden files** | Vitest | `tests/fixtures/1.json` and `1.oxs`: parse → serialize must be identical. OXS export snapshot. Shopping list snapshot |
| Parity with old app | Vitest | Run the same fixtures through the old `index.html` functions (extracted) and compare outputs during migration |
| Editor flows | Vitest + jsdom | Tool manager, history transactions, shortcut manager |
| UI end-to-end | Playwright | Draw, undo, key dialog, save/open, import/export download, Alt-pick, reference persistence across reload |
| Level boundaries | `eslint-plugin-boundaries` | Fails the build if e.g. `core` imports `react` or `ui` imports `persistence/local/*` |
| Types | TypeScript `strict`, `noUncheckedIndexedAccess` | Typed arrays and key indices are where bugs hide |

---

## 13. Ready for login and a database (not built yet)

**Today** — ports in `persistence/ports.ts`:
```ts
export interface PatternRepository {
  list(): Promise<PatternSummary[]>;             // id, name, w, h, updatedAt
  load(id: string): Promise<PatternFile>;        // JSON v3 document
  save(doc: PatternFile): Promise<SaveResult>;
  remove(id: string): Promise<void>;
}
export interface ReferenceRepository { load(patternId: string): Promise<RefWindowData[]>; save(patternId: string, refs: RefWindowData[]): Promise<void> }
export interface DraftStore { load(): PatternFile | null; save(doc: PatternFile): void }
```
Local adapters keep **today's storage keys** (`stitchwork.library`, `stitchwork.current`, IndexedDB `stitchwork/refs`),
so users moving from the single-file app keep their work.

**Later**, without touching `editor/` or `ui/` panels:
1. `src/server/db/` — Postgres via Drizzle. Table `patterns(id, user_id, name, w, h, data jsonb, updated_at)`.
   `data` is the same JSON v3 document.
2. `src/server/auth/` — Auth.js or Better Auth. Session read in `[locale]/layout.tsx` (server) and passed down.
3. `app/api/patterns/route.ts` and `[id]/route.ts` — Route Handlers implementing list/load/save/remove.
4. `persistence/api/` — `ApiPatternRepository` calling those routes; reference photos uploaded to object storage
   (S3/R2), with only their URLs stored in the DB.
5. `persistence/index.ts` — returns API repos when signed in, local ones otherwise. Add a one-time "import your
   browser patterns into your account" flow.

Choices made now so that later step is easy:
- Pattern ids are opaque strings, and new ones use `crypto.randomUUID()`. Old `p…` ids stay valid.
- The JSON document has a `v` field and `formats/json/migrations.ts`, so server and client share one migration path.
- `SaveResult` already has room for `conflict` (a newer version on the server).
- The Claude-runtime `window.claude` cloud/downloads hooks are **not** carried over.

---

## 14. Migration plan

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | Repo setup: Next.js + TS strict, ESLint boundaries, Vitest, Playwright, next-intl with `en` | CI green on an empty app |
| 1 | `core/`: catalog JSON extracted, colour maths, pattern model, geometry, formats, calculator | Golden tests pass on `1.json` / `1.oxs`; outputs match the old app |
| 2 | `render/` + theme: screen renderer and PNG export | Screenshot comparison of the chart matches the old app at several zooms |
| 3 | `editor/`: store, history, viewport, tools, commands, shortcuts, autosave, local persistence | Editor drivable from tests without React |
| 4 | `ui/`: layout, panels, dialogs, reference windows, drop zone, toasts | Full SPEC parity checklist ticked (one checkbox per SPEC section) |
| 5 | Polish: workers for heavy jobs, `uk` translation, accessibility pass (focus, labels) | Lighthouse a11y ≥ 90; no UI freeze on 400-wide image import |
| 6 (later) | Login + DB per §13 | — |

Until phase 4 is finished, `index.html` stays the working product.

---

## 15. Quick map: "I want to change…"

| Change | Where |
|---|---|
| A tool's behaviour | `editor/tools/<tool>.ts` |
| Add a tool | new file in `editor/tools/` + `tools/registry.ts` + messages |
| A keyboard shortcut | `editor/shortcuts/keymap.ts` |
| Grid/symbol/bead look on canvas | `render/theme.ts` |
| Buttons, panels, colours of the UI | `ui/**` component + its `.module.css`, tokens in `app/globals.css` |
| Panel placement | `ui/layout/EditorLayout.tsx` |
| A new stitch type | `core/stitches/registry.ts` + `render/primitives/stitches.ts` + messages |
| Shopping list rules | `core/calculator/` (new strategy or edit `classicSkeins.ts`) |
| A text / translation | `messages/<locale>.json` |
| OXS import/export | `core/formats/oxs/` |
| Where patterns are saved | `persistence/index.ts` (+ a new adapter) |
| DMC / bead data | `core/catalog/data/*.json` |
