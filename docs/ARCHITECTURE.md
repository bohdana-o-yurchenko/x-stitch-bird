# Stitchwork — Next.js Architecture Plan

> Status: **plan**, 2026-11-14. Source of truth for behaviour: [`SPEC.md`](./SPEC.md) and the current `index.html`.
> Goal: a codebase a person can find their way around in minutes, where each kind of change
> touches a small, predictable set of files.
>
> The initial draft also covers the first backlog features from SPEC §15: #1–#7 (metadata, grid numbering, transforms
> and mirror modes, error detectors, ambiguous marks, selection, snapshots) and the two high-priority drafts
> (fractional stitches §15.13, French knots §15.14). Their groundwork (layers §7.1, transforms, structural undo,
> JSON v4) is built **from the start**. The features themselves are delivered after parity (§15 phases).

---

## 1. Guiding principles

1. **Four levels, one direction.** Code is split into levels; a level may only import from the levels below it.
   The domain (cross-stitch rules, maths, file formats) knows nothing about React, the canvas, Next.js or storage.
2. **The editor is a client app inside a Next.js shell.** Next.js provides routing, i18n, fonts, metadata, and
   later auth/API/DB. The editor itself is browser-only (canvas, pointer events, IndexedDB) and is rendered as a
   single client boundary. We don't force server rendering where it adds nothing.
3. **Registries over `if/else` chains.** Tools, shortcuts/commands, stitch types, key-entry kinds, layers, chart
   checks and shopping calculators are each a list of plain objects. Adding one means adding a file and one line
   to the registry.
4. **Every layer obeys one contract.** Stitches, beads, backstitch, fractional stitches, knots and ambiguous marks
   all implement the same `LayerHandler` (§7.1). Resize, transforms, selection, eraser, picker, counting and
   serialization loop over the layer registry instead of naming layers. A new layer can't be forgotten.
5. **Ports for anything that will change backend.** Saving/loading goes through interfaces. Today they're backed
   by localStorage/IndexedDB; tomorrow by an API + database — with no changes to the editor or UI.
6. **No user-facing strings below the UI level.** Core returns data and message keys, and the UI translates them.
7. **Pixels are configuration.** Every canvas colour, line width and ratio lives in one theme object shared by the
   screen renderer and the PNG exporter.
8. **File format compatibility is sacred.** v1–v3 JSON files load exactly as today. The new app writes JSON v4,
   which only *adds* optional fields, so the old app can still open it (golden tests). OXS round-trips as today.
9. **Everything is undoable.** Whole-chart operations (resize, transforms, key deletion) record structural patches
   instead of wiping history (SPEC §15 groundwork).
10. **Code explains itself; comments are rare.** Short comments only on core public APIs and on non-obvious rules
    (§12.1). We don't maintain a heavily commented codebase.
11. **Tests where they pay off.** Unit tests cover domain logic and regressions, not everything. Coverage minimums
    apply only where tests matter (core 85% lines / 75% branches, key editor services 60%). The UI and wiring are
    excluded from measurement (§12.2).

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
│  │  ├─ header/                     PatternName, PatternInfoButton, FileMenu, TransformMenu, ViewSwitch, ExportMenu
│  │  ├─ stage/                      ChartCanvas, ZoomControls (+ view switch), UnderlayPad, SelectionActions
│  │  ├─ side/                       ToolBar, KeyPanel, KeyRow, FabricPanel (+ grid numbering), TotalsPanel, UnderlayPanel
│  │  ├─ status/                     StatusBar, AmbiguousStatus (only rendered when N > 0)
│  │  ├─ dialogs/
│  │  │  ├─ key-entry/               KeyEntryDialog, ThreadPicker, BeadPicker, BlendEditor, SymbolGrid
│  │  │  ├─ NewPatternDialog.tsx, OpenPatternDialog.tsx (+ SnapshotHistory), ResizeDialog.tsx
│  │  │  ├─ ImageImportDialog.tsx, SaveToFileDialog.tsx, ConfirmDialog.tsx
│  │  │  ├─ PatternInfoDialog.tsx    metadata form (§14.1)
│  │  │  ├─ GoToCellDialog.tsx       Ctrl/⌘+G (§14.2)
│  │  │  ├─ MirrorFromCentreDialog.tsx, ExtendCanvasDialog.tsx, ReplaceKeyDialog.tsx
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
│  │  │  ├─ paint.ts                 paintCells, eraseAt, fill, addSegment, placePartial, placeKnot
│  │  │  ├─ keyEntries.ts            addEntry, updateEntry, deleteEntry, setActive
│  │  │  ├─ pattern.ts               newPattern, resize, setFabric, rename, setMeta, setGridNumbering, loadDocument
│  │  │  ├─ transforms.ts            flip, rotate, mirrorFromCentre, cropToContent, extendCanvas (§14.3)
│  │  │  ├─ ambiguous.ts             toggleAt, next, clearAll (§14.5)
│  │  │  └─ importExport.ts          exportAs(format), importFile(file)
│  │  ├─ history/history.ts          patch-based undo/redo, including structural patches (see §5.3)
│  │  ├─ selection/                  §14.6
│  │  │  ├─ selection.ts             cell mask + bounds, add/replace, select all, select by key
│  │  │  ├─ floating.ts              floating fragment: move, nudge, flip/rotate, commit, cancel
│  │  │  └─ clipboard.ts             in-memory clipboard (survives project switch) + optional system clipboard
│  │  ├─ snapshots/SnapshotService.ts  5-min timer + "before destructive command" hook (§14.7)
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
│  │  │  ├─ select.ts  magicWand.ts  (§14.6)
│  │  │  ├─ partial.ts               fractional stitches: nearest corner, kind cycling, live preview (§14.8)
│  │  │  ├─ backstitch.ts            used automatically when the active entry is a backstitch
│  │  │  └─ knot.ts                  used automatically when the active entry is a French knot (§14.9)
│  │  ├─ viewport/viewport.ts        zoom, pan, fit, screen ↔ grid conversion, centreOn(cell) + flash
│  │  ├─ references/references.ts    reference windows state + persistence
│  │  └─ autosave.ts                 debounced draft save + flush on pagehide
│  │
│  ├─ render/                        ── L2 drawing (no React) ──────────────────────
│  │  ├─ theme.ts                    CanvasTheme: every colour / width / ratio (see §8)
│  │  ├─ ChartRenderer.ts            screen: culling, rAF batching, overlays from active tool
│  │  ├─ exportChart.ts              PNG chart & preview (uses the same primitives)
│  │  ├─ keyIcon.ts                  small key-entry icons (list, status bar, PNG key)
│  │  ├─ referenceRenderer.ts
│  │  └─ primitives/
│  │     ├─ stitches.ts              one draw function per stitch type id (see §9)
│  │     ├─ partials.ts  knots.ts    fractional triangles/squares, knot dots
│  │     ├─ beads.ts  backstitch.ts  symbols.ts  grid.ts  rulers.ts (use core/grid numbering)
│  │     └─ overlays.ts              ambiguous corners, selection marching ants, check rings, go-to flash, mirror guides
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
│  │  │  ├─ types.ts                 Pattern, KeyEntry, Segment, Knot, Partial, Blend, Combo, CustomColor
│  │  │  ├─ meta.ts                  PatternMeta fields + defaults (§14.1)
│  │  │  ├─ createPattern.ts
│  │  │  ├─ resolve.ts               getEntry(id) for dmc/bead/custom/blend/combo
│  │  │  ├─ keyEntries.ts            sameKey, findSameKey, findOrCreateTwin (opposite half-cross direction)
│  │  │  ├─ occupancy.ts             override rules across layers (SPEC §6.2, §15.13 Q4)
│  │  │  ├─ fragment.ts              extract / insert a multi-layer piece + its key entries (selection, paste)
│  │  │  └─ blends.ts  combos.ts
│  │  ├─ entryKinds/                 key-entry kinds: thread, combo, bead, back, knot (§7.2)
│  │  │  ├─ types.ts  registry.ts
│  │  ├─ layers/                     one handler per layer, same contract (§7.1)
│  │  │  ├─ types.ts                 LayerHandler
│  │  │  ├─ registry.ts              stitches, beads, partials, segments, knots, ambiguous
│  │  │  └─ stitches.ts beads.ts partials.ts segments.ts knots.ts ambiguous.ts
│  │  ├─ transform/                  shared by transforms, mirror drawing, selection, near-symmetry
│  │  │  ├─ cellTransform.ts         flipH/flipV/rot90/rot180/translate as index + point mappers
│  │  │  └─ direction.ts             ╱↔╲ and corner remapping rules
│  │  ├─ grid/numbering.ts           column/row labels, centre numbering, major-line offset, parse "col, row" (§14.2)
│  │  ├─ stitches/
│  │  │  ├─ types.ts                 StitchType interface
│  │  │  ├─ registry.ts              full, half, halfb
│  │  │  └─ partialKinds.ts          quarter, three-quarter, petite: geometry, thread factor, OXS mapping (§14.8)
│  │  ├─ checks/                     (removed — to be redesigned, §14.4)
│  │  │  ├─ types.ts  registry.ts
│  │  │  └─ isolated.ts  nearSymmetry.ts  unusedEntries.ts  rareEntries.ts  duplicateEntries.ts
│  │  ├─ snapshots/retention.ts      which snapshots to keep (pure function, §14.7)
│  │  ├─ geometry/                   bresenham, floodFill, shapes, brush, mirrorPoints, segmentDistance, snap, nearestCorner
│  │  ├─ calculator/
│  │  │  ├─ usage.ts                 counts per entry, backstitch lengths (pure facts)
│  │  │  ├─ types.ts                 ShoppingCalculator, ShoppingList
│  │  │  ├─ registry.ts
│  │  │  └─ classicSkeins.ts         today's algorithm (SPEC §7.2)
│  │  ├─ labels/keyLabel.ts          returns structured label parts, NOT text
│  │  ├─ formats/
│  │  │  ├─ json/  serialize.ts (writes v4)  parse.ts (reads v1–v4)  rle.ts  migrations.ts
│  │  │  ├─ oxs/   exportOxs.ts  importOxs.ts  resolveCodes.ts
│  │  │  └─ csv/   exportCsv.ts
│  │  └─ imageToPattern/             quantize.ts (works on pixel arrays), findBlends.ts
│  │
│  ├─ persistence/                   ── ports + adapters ─────────────────────────
│  │  ├─ ports.ts                    PatternRepository, ReferenceRepository, DraftStore, SnapshotRepository
│  │  ├─ local/
│  │  │  ├─ localPatternRepository.ts    "stitchwork.library" (compatible keys)
│  │  │  ├─ indexedDb.ts                 opens "stitchwork" DB; v1 → v2 upgrade adds "snaps"
│  │  │  ├─ indexedDbReferenceRepository.ts  "refs" store (compatible)
│  │  │  ├─ indexedDbSnapshotRepository.ts   "snaps" store, key [projectId, time] (§14.7)
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
    partialKind: 'quarter' | 'threeQuarter' | 'petite';   // current kind for the Partial tool (§14.8)
    view: 'color' | 'both' | 'symbols';
    brush: 1|2|3|4|5; override: boolean;
    mirror: 'off' | 'vertical' | 'horizontal' | 'quad';    // cycles (§14.3)
    panelCollapsed: boolean;
  };
  selection: { mask: Uint8Array | null; bounds: Rect | null; floating: Fragment | null };   // §14.6
  checks: { findings: Finding[]; index: number; ignored: Set<string> } | null;               // §14.4, session only
  flash: { cell: number; until: number } | null;                                             // Go to cell, findings
  status: { hoverCell: Cell | null; saveState: SaveState };
}
```
The clipboard lives in the editor instance, **outside** the store, so it survives project switches (§14.6).
Typed arrays are **not** copied into React state. Actions mutate the document and bump a revision number.
React components subscribe with selectors, for example `useEditor(s => s.keyRevision)`. Derived data such as
usage counts and the shopping list is memoised per revision and computed off the pointer path (debounced like today).

### 5.3 History: patches, not snapshots
Today each undo step copies all layers. For a 500×500 pattern that's ~1 MB × 60 steps. The new history stores **patches**:
```ts
type Patch =
  | { kind: 'cells';    layer: LayerId; indices: Uint32Array; before: Uint16Array; after: Uint16Array }
  | { kind: 'items';    layer: LayerId; added: unknown[]; removed: unknown[] }   // segments, knots, partials, ambiguous
  | { kind: 'keys';     before: KeyEntryChange[]; after: KeyEntryChange[] }      // added / edited / deleted entries
  | { kind: 'document'; before: DocumentState; after: DocumentState };           // w, h + all layers (structural)
history.transaction(label, () => { /* actions record patches */ });
```
- A stroke is one transaction. Empty transactions are dropped, which matches "a stroke that changed nothing is not
  an undo step".
- Small edits use `cells` / `items` patches. **Whole-chart operations** (resize, flip, rotate, mirror from centre,
  crop, extend, delete key entry, replace key) use one `document` patch. It holds `w`, `h` and every layer,
  including ambiguous marks, as SPEC §15 groundwork requires. These operations are rare, so a full copy is fine.
- So, unlike the single-file app, **resize and deleting a key entry no longer clear the history** (SPEC §14.4).
  Loading another pattern still starts a fresh history.
- The patch kinds don't name specific layers. `items` patches are applied through the layer's handler (§7.1), so
  knots and partials need no new history code.

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
`tools.myTool` to `messages/*.json` → optionally bind a key in `keymap.ts`. Toolbar, shortcut help, tooltips and
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
  { keys: 'mod+g',       command: 'view.goToCell' },                         // §14.2
  { keys: 'a',           command: 'ambiguous.toggleAtHover' },               // §14.5
  { keys: 'shift+a',     command: 'ambiguous.next' },
  { keys: 's',           command: 'tool.select', args: 'select' },           // §14.6
  { keys: 'w',           command: 'tool.select', args: 'magicWand' },
  { keys: 'mod+a',       command: 'selection.all' },
  { keys: 'mod+c',       command: 'clipboard.copy',   when: 'hasSelection' },
  { keys: 'mod+x',       command: 'clipboard.cut',    when: 'hasSelection' },
  { keys: 'mod+v',       command: 'clipboard.paste' },
  { keys: 'delete|backspace', command: 'selection.clear', when: 'hasSelection' },
  { keys: 'arrows',      command: 'selection.nudge',  when: 'hasSelection' },    // shift = 10 cells
  { keys: 'enter',       command: 'floating.commit',  when: 'floating' },
  // Esc: first matching binding wins → cancel paste, then deselect, then end backstitch chain
  { keys: 'escape',      command: 'floating.cancel',  when: 'floating' },
  { keys: 'escape',      command: 'selection.none',   when: 'hasSelection' },
  { keys: 'mod+d',       command: 'selection.none',   when: 'hasSelection' },
  { keys: 'escape',      command: 'tool.cancel' },
  // …
];
```
`mod` = ⌘ on macOS, Ctrl elsewhere. `when` names a context flag computed from the store (`hasSelection`,
`floating`, `checksOpen`, …), like VS Code's keybinding contexts. Bindings are tried top to bottom and the first
match wins. That's how one key can do different things in different situations without `if` chains in handlers.

Still open: the key that cycles the partial kind (§14.8). `Q` is free. `ShortcutManager` handles the rules from the spec: ignore keys while typing
in inputs or while a modal is open, release hold-keys on window blur, and ignore auto-repeat for hold bindings.
Commands can be flagged `destructive: '<reason>'`. The command registry then asks the snapshot service for a
snapshot **before** running them (§14.7). A new destructive command gets this protection by adding one field.

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
See §9 for the stitch-type registry, §7.2 for key-entry kinds, and §14.8–14.9 for fractional stitches and knots.

### 6.6 Changing how the shopping list is calculated
See §10: usage facts are separate from calculator strategies.

### 6.7 Localization
See §11.

### 6.8 Login and database
See §13.

---

## 7. Core domain notes

- **Types mirror the spec** (SPEC §3), extended with the v4 fields:
  ```ts
  interface Pattern {
    id; name; w; h; count; strands; fabric;
    meta: PatternMeta;                         // §14.1, all fields optional
    grid: GridNumbering;                       // §14.2, default { x0: 1, y0: 1, label: 10, fromCentre: false }
    key: (KeyEntry | null)[];                  // index 0 always null
    blends; combos; customs;
    layers: {
      stitches: Uint16Array;                   // dense, one key index per cell
      beads: Uint16Array;                      // dense
      partials: Map<number, PartialStitch[]>;  // sparse, ≤ 4 per cell (§14.8)
      segments: Segment[];                     // backstitch, half-grid points
      knots: Knot[];                           // French knots, half-grid points (§14.9)
      ambiguous: Set<number>;                  // cell indices (§14.5)
    };
  }
  ```

### 7.1 Layers — one contract for all of them

Every layer has a handler in `core/layers/`. Code that must touch "everything on the chart" loops over
`layerRegistry` and never names a layer:

```ts
export interface LayerHandler<T = unknown> {
  id: LayerId;                               // 'stitches' | 'beads' | 'partials' | 'segments' | 'knots' | 'ambiguous'
  geometry: 'cell' | 'point';                // cells (by index) or half-grid points (x, y)
  exported: boolean;                         // false for 'ambiguous' — never in PNG/PDF/OXS/CSV
  countsUsage: boolean;                      // false for 'ambiguous'
  // structure
  clone(layer: T): T;
  resize(layer: T, from: Size, to: Size, offset: Point): T;
  transform(layer: T, t: CellTransform, ctx: TransformContext): T;   // flips/rotations; ctx re-points ╱↔╲ entries
  // selection & clipboard
  extract(layer: T, mask: Uint8Array, size: Size): T;
  insert(layer: T, piece: T, at: Point, opts: { override: boolean; keyMap: KeyIndexMap }): T;
  // editing helpers
  eraseAt(layer: T, at: GridPoint, radius: number): Patch | null;
  pickAt(layer: T, at: GridPoint): number;    // key index or 0
  remapKeys(layer: T, map: KeyIndexMap): T;   // delete / replace key entry
  // facts
  usage(layer: T, add: (keyIndex: number, unit: UsageUnit, amount: number) => void): void;
  // persistence (JSON v4 field)
  serialize(layer: T, keyMap: KeyIndexMap): unknown;
  parse(raw: unknown, size: Size): T;
}
```
Benefits:
- **Resize, transforms (§14.3), selection (§14.6), the eraser, the picker, delete key, counting and JSON** each
  become one loop over the registry. Adding knots or partials automatically gets them resize, flips, copy/paste,
  undo and saving.
- **Picker priority** (SPEC §6.2 plus §15.14: knots and backstitch first, then beads, then partials, then stitches)
  is simply the registry order used by `pickAt`.
- The renderer has a matching painter per layer id (`render/primitives`), drawn in a fixed z-order:
  stitches → partials → beads → grid → segments → knots → ambiguous → tool overlays.

### 7.2 Key-entry kinds — `core/entryKinds`

Today's kinds (`thread`, `combo`, `bead`, `back`) and the new `knot` are registry entries:
```ts
export interface EntryKind {
  id: 'thread' | 'combo' | 'bead' | 'back' | 'knot';
  labelKey: MessageKey;            // dialog Type button
  layer: LayerId;                  // where pencil-style tools put it
  placement: 'cell' | 'point' | 'segment';   // chooses the tool behaviour: brush, knot.ts, backstitch.ts
  fields: Array<'colour' | 'blend' | 'bead' | 'stitchType' | 'strands' | 'wraps' | 'symbol'>;  // dialog sections shown
  label(entry, resolved): LabelData;          // title/subtitle parts (SPEC §3.4)
  oxs: { exportItem; importMatch };
}
```
The key-entry dialog builds its form from `fields`. The ToolManager uses `placement` to pick the tool behaviour,
the same way backstitch entries switch pencil/line/rect today. So knots are "one kind + one layer + one painter +
one tool behaviour".

### 7.3 Other domain notes
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
  partials: { symbolScale: .45, splitLine: 'rgba(0,0,0,.45)' },                   // §14.8
  knots: { radius: .2, outline: 'rgba(0,0,0,.6)', symbolsViewDot: '#1d1a16' },    // §14.9
  ambiguous: { corner: .28, minZoom: 6 },                                         // accent-coloured corner triangle
  selection: { ants: ['#000', '#fff'], dash: [4, 4], floatingAlpha: .8 },
  findings: { ring: 3, ringPadding: .3 },
  flash: { durationMs: 900 },
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

**Sub-cell stitches** (quarter, three-quarter, petite) and **French knots** don't fit "one stitch type per cell".
They get their own layers (`partials`, `knots`) through the layer contract (§7.1). Details are in §14.8–14.9.

---

## 10. Shopping calculator — `core/calculator`

Two separate steps:

```ts
// 1. Facts — never changes when the shopping rules change
export function computeUsage(p: Pattern): UsageReport;
// built by asking every counting layer (§7.1) to report units per key entry:
//   'cell' (by stitch type), 'quarter' | 'threeQuarter' | 'petite', 'segmentLength', 'segment', 'knot'
// + totals by unit. New layers add units here without touching calculators that ignore them.

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
- Stitch factors come from the registries (`threadFactor`: full 1, half 0.5, quarter 0.25, three-quarter 0.75,
  petite 0.5), not hard-coded `0.5`. Knots use a `knotAllowance` setting × strands (SPEC §15.14).
- The totals panel shows partial and knot counts only when they exist, e.g. `120 + 14¾` (SPEC §15.13 Q7).
- Room for: thread length in metres, waste %, cost per item, packs of beads, per-brand skein sizes, user-adjustable
  settings stored on the pattern (`pattern.calculator = { id, settings }`).

---

## 11. Localization

- **Library:** `next-intl`. Locale in the URL (`/en`, `/uk`), default `uk` (`localeDetection: false`, so the
  browser language is ignored; `src/i18n/routing.ts`).
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
| **Golden files** | Vitest | `tests/fixtures/1.json` and `1.oxs`: v3 parse → v4 serialize → parse gives the same pattern; v4 adds only defaulted fields. OXS export snapshot. Shopping list snapshot |
| Layer contract | Vitest | One shared test suite run against **every** registered layer: resize, flip twice = identity, rotate ×4 = identity, extract + insert = identity, serialize + parse = identity. A new layer must pass it |
| Transforms & checks | Vitest | ╱↔╲ re-pointing, corner remapping, near-symmetry on fixtures with planted errors |
| Parity with old app | Vitest | Run the same fixtures through the old `index.html` functions (extracted) and compare outputs during migration |
| Editor flows | Vitest + jsdom | Tool manager, history transactions, shortcut manager |
| UI end-to-end | Playwright | Draw, undo, key dialog, save/open, import/export download, Alt-pick, reference persistence across reload |
| Level boundaries | `eslint-plugin-boundaries` | Fails the build if e.g. `core` imports `react` or `ui` imports `persistence/local/*` |
| Types | TypeScript `strict`, `noUncheckedIndexedAccess` | Typed arrays and key indices are where bugs hide |

All rows above follow the scope limits in §12.2: each row names *what* is worth testing, not a promise to test
everything in that area.

### 12.1 Comments — minimal

- **Where comments go:** a one- or two-line comment on the **public API of core modules and services**: exported
  functions, interfaces and registries in `core/`, `persistence/ports.ts`, and editor services (`history`,
  `ToolManager`, `ShortcutManager`, `SnapshotService`). Say what it does and anything surprising, such as units,
  coordinate systems (cells vs half-grid points) or invariants (key index 0 is always empty).
- **Also allowed:** a short *why* comment where the code can't speak for itself. For example, a domain rule
  ("a bead may sit on a plain stitch, floss + bead needs an empty cell"), a compatibility hack (`14.01` = "28 ct
  over 2"), or a link to the SPEC section (`// SPEC §15.3 direction rule`).
- **Not wanted:**
  - comments that repeat the code (`// increment i`, `// set the name`)
  - JSDoc on every function, parameter and React component
  - comments on UI components, hooks, CSS, or private helpers
  - commented-out code
  - change logs in comments (git has the history)
- **Prefer instead:** clear names, small functions and precise types (`HalfGridPoint`, `KeyIndex`). A type often
  replaces a comment.
- Rough guide: comments well under 10% of lines. If a file needs many comments to be understood, simplify the
  code instead.
- Folder `README.md` files stay limited to the few folders named in §3, a few lines each.

### 12.2 Unit tests — minimal and useful

**Guardrail: coverage minimums per area, measured only where unit tests make sense.** One global number would mix
domain logic with UI code nobody should unit-test, so it's not used as a rule.

| Area | Measured | Enforced minimum (CI fails below) |
|---|---|---|
| `core/**` (formats, geometry, transforms, layers, calculator, checks, retention) | yes | **85% lines, 75% branches** |
| Editor services: `editor/history`, `editor/tools/ToolManager.ts`, `editor/shortcuts/ShortcutManager.ts`, `editor/selection`, `editor/snapshots` | yes | **60% lines** |
| `persistence/local/**` | yes | none (thin adapters, covered by e2e) |
| `ui/`, `render/`, `app/`, `i18n/`, `platform/`, `workers/`, data JSON, messages | **excluded** | — |

- **Minimums, not targets.** Nobody chases 100%. The last 10–15% of a module is usually trivial branches, and
  testing those is exactly the kind of test we don't want. Raise a minimum only when the team decides to, never
  automatically.
- **Excluded code isn't measured**, so there's no reason to write tests for panels, translations or the theme just
  to move a number. Rendering is checked by the e2e screenshot comparison (§15 phase 2), not by unit tests.
- **Whole-project coverage is reported, not enforced.** With this split it should land around 40–50%. That's a
  result, not a rule.
- **Branch coverage in `core`** matters most: occupancy/override, ╱↔╲ direction, OXS mapping and migrations are
  full of cases.
- A new module in `core/` is covered by the rule automatically. A new editor service is added to the list only if
  it holds real logic.
- Phases 0–3 (§15): the `core` minimum applies as soon as a module lands. Editor minimums apply from phase 3.

Vitest config (sketch):
```ts
coverage: {
  provider: 'v8',
  include: ['src/core/**', 'src/editor/**', 'src/persistence/**'],
  exclude: ['**/*.test.ts', 'src/core/catalog/data/**', 'src/editor/store/**', 'src/editor/createEditor.ts'],
  thresholds: {
    'src/core/**': { lines: 85, branches: 75 },
    'src/editor/history/**': { lines: 60 },
    'src/editor/tools/ToolManager.ts': { lines: 60 },
    'src/editor/shortcuts/ShortcutManager.ts': { lines: 60 },
    'src/editor/selection/**': { lines: 60 },
    'src/editor/snapshots/**': { lines: 60 },
  },
},
```

**Test these** (high value: logic that's easy to break and hard to see broken):
- file formats and compatibility: JSON v1–v4, OXS import/export, CSV (golden files)
- geometry and rules: flood fill, Bresenham, occupancy/override, mirror points, ╱↔╲ re-pointing, corner remap
- the layer contract suite (one parameterised suite for all layers, not one file per layer)
- calculator results on fixtures (one snapshot per calculator, not per formula)
- chart checks, using fixtures with planted errors
- history: transactions, empty-transaction drop, structural patches
- snapshot retention (pure function with fake clocks)
- every bug fix gets one regression test

**Don't test these:**
- translations / message files, labels and texts
- React components that only display data, layout, CSS, icons
- the theme object, registries that are plain lists, constants, the DMC/bead data tables
- type definitions, simple getters/setters, thin wrappers around browser or library APIs
  (`downloadFile`, the Zustand store setup, next-intl config)
- framework behaviour (Next.js routing, React rendering)
- the same behaviour at several levels: if core tests cover a rule, editor tests don't repeat it

**Keep tests small:**
- one behaviour per test, named after it (`flips a ╱ half cross into a ╲ entry`)
- use real fixtures instead of large hand-built mocks
- prefer a table of cases (`it.each`) over many near-identical tests
- no tests written only to raise coverage

**End-to-end (Playwright)** stays a short list of critical user journeys (§12 table, about 10–15 specs). It isn't
counted toward the unit-test target.

---

## 13. Ready for login and a database (not built yet)

**Today** — ports in `persistence/ports.ts`:
```ts
export interface PatternRepository {
  list(): Promise<PatternSummary[]>;             // id, name, w, h, updatedAt, designer (§14.1, shown in Open)
  load(id: string): Promise<PatternFile>;        // JSON v4 document (v1–v3 accepted)
  save(doc: PatternFile): Promise<SaveResult>;
  remove(id: string): Promise<void>;
}
export interface ReferenceRepository { load(patternId: string): Promise<RefWindowData[]>; save(patternId: string, refs: RefWindowData[]): Promise<void> }
export interface DraftStore { load(): PatternFile | null; save(doc: PatternFile): void }
export interface SnapshotRepository {                           // §14.7
  add(s: Snapshot): Promise<void>;                              // { projectId, time, reason, w, h, data, thumb }
  list(projectId: string): Promise<SnapshotSummary[]>;          // without `data`, for the History list
  get(projectId: string, time: number): Promise<Snapshot>;
  removeMany(keys: Array<[projectId: string, time: number]>): Promise<void>;
}
```
Local adapters keep **today's storage keys** (`stitchwork.library`, `stitchwork.current`, IndexedDB `stitchwork/refs`),
so users moving from the single-file app keep their work. Snapshots add the `snaps` store (IndexedDB version 2).

**Later**, without touching `editor/` or `ui/` panels:
1. `src/server/db/` — Postgres via Drizzle. Table `patterns(id, user_id, name, w, h, data jsonb, updated_at)`.
   `data` is the same JSON v4 document. Snapshots can later move to a `pattern_snapshots` table behind the same port.
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

## 14. Planned features (SPEC §15) — where each one lives

Each feature below lists its stored data, its modules by level, and its commands/shortcuts. Shared groundwork
used by several of them:

| Groundwork | Module | Used by |
|---|---|---|
| Layer contract | `core/layers` (§7.1) | 14.3, 14.5, 14.6, 14.8, 14.9, resize, eraser, picker, JSON |
| Transform helpers | `core/transform` | 14.3 transforms + mirror modes, 14.4 near symmetry, 14.6 flip/rotate selection |
| Structural undo | `editor/history` `document` patch (§5.3) | 14.3, 14.6 crop, resize, delete key |
| JSON v4 | `core/formats/json` | 14.1 `meta`, 14.2 `grid`, 14.5 `amb`, 14.8 `part`, 14.9 `knots` |
| Context-aware shortcuts | `editor/shortcuts` `when` (§6.2) | 14.6 Esc/Enter/arrows, 14.5 `A` |
| Destructive-command hook | `editor/commands` `destructive` flag | 14.7 snapshots before risky operations |

**JSON v4** (`formats/json`): `serialize` always writes `v: 4`. `parse` accepts v1–v4, and `migrations.ts`
upgrades older documents step by step (v1 → v2 → v3 → v4), with missing fields getting defaults. New fields:
`meta`, `grid`, `amb` (sorted cell indices), `part` (`[[i, kind, c, k], …]`), `knots` (`[[x, y, k], …]`). The
single-file app ignores unknown fields when opening v4. But if you re-save from the old app, those fields are lost.
The Save to file dialog should mention this during the transition.

### 14.1 Pattern metadata — priority one (SPEC §15.1)
- **Data:** `pattern.meta: PatternMeta` (`core/pattern/meta.ts`). All optional strings: designer, publisher, source,
  sourceYear, sourceRef, copyright, notes, instructions, mappedBy, mappedDate. JSON v4 `meta`.
- **UI:** `PatternInfoButton` next to the name opens `dialogs/PatternInfoDialog`. Labels for every field come from messages.
- **Exports:** `formats/oxs` writes and reads `author`/`copyright`/`instructions`. `formats/csv` appends a "Pattern
  info" block at the end. `render/exportChart` adds the `Designer · ©` line under the key heading. The PDF cover
  (SPEC #10) will read the same object.
- **Persistence:** `PatternSummary.designer`, so the Open list can show it without loading the whole document.
- **Command:** `pattern.editInfo`.

### 14.2 Grid numbering + Go to cell (SPEC §15.2)
- **Data:** `pattern.grid = { x0, y0, label: 10 | 5, fromCentre }`, JSON v4 `grid`.
- **Core:** `core/grid/numbering.ts` is the **only** place that turns indices into paper numbers and back:
  `columnLabel(i)`, `rowLabel(i)`, `majorLineOffset()` (so major lines align with the numbering) and
  `parseCellRef("12, 40") → cell | error`.
- **Users:** `render/primitives/rulers.ts`, `ui/status/StatusBar`, `render/exportChart`, `render/referenceRenderer`
  (grid read-out), `GoToCellDialog`. Nobody else does `x + 1`.
- **UI:** numbering controls in `FabricPanel`. **Command** `view.goToCell` (mod+G) opens `GoToCellDialog`, then
  `viewport.centreOn(cell)` and `store.flash` (painted by `overlays.ts`).

### 14.3 Whole-chart transforms & mirror modes (SPEC §15.3)
- **Core:** `core/transform/cellTransform.ts` defines `CellTransform` (flipH, flipV, rot90cw, rot90ccw, rot180,
  translate). It maps cell indices and half-grid points and gives the new size. `direction.ts` holds the rules:
  ╱↔╲ for flips and 90° turns (none for 180°), and corner remapping for partials (TL↔TR on flipH, …).
- **Half-cross re-pointing:** `TransformContext.repoint(keyIndex)` uses `keyEntries.findOrCreateTwin()` to find an
  entry with the same colour and strands and the opposite direction, or creates one with the next free symbol.
  It collects a report (`{ code: 'transform.newTwins', count }`) for the toast.
- **Editor:** `actions/transforms.ts`. Each operation is **one `document` patch** and a destructive command
  (snapshot first). It applies `layerHandler.transform` to every layer, so beads, backstitch, knots, partials and
  ambiguous marks all move.
- **Mirror from centre / Crop to content / Extend canvas:** also in `actions/transforms.ts`. Mirror from centre
  = extract the source half (`fragment.ts`) + transform + insert. Crop and extend = `layerHandler.resize` with an offset.
- **Mirror drawing modes:** `ui.mirror` cycles off → vertical → horizontal → quad (command `draw.cycleMirror`).
  `core/geometry/mirrorPoints(cell | point, mode, size)` returns the mirrored copies. Painting actions apply the
  same entry to them (half crosses keep their direction, SPEC §15.3 as revised 2026-11-14). Guides: `overlays.ts`.
- **UI:** `header/TransformMenu`, `MirrorFromCentreDialog` (with confirm when the target isn't empty), `ExtendCanvasDialog`.

### 14.4 Error detectors (SPEC §15.4)

> **Removed 2026-11-14, to be redesigned** (see §17). The design below describes the first version and is kept for
> reference; the folders it names no longer exist.
- **Core:** `core/checks/` is a registry of checks:
  ```ts
  interface ChartCheck {
    id: 'isolated' | 'nearSymmetry' | 'unusedEntries' | 'rareEntries' | 'duplicateEntries' | string;
    labelKey: MessageKey;
    options: OptionSpec[];                        // e.g. cluster size, include beads — with defaults
    run(p: Pattern, opts: Record<string, unknown>): Finding[];
  }
  interface Finding {
    id: string;                                   // stable, so "Ignore" can hide it for the session
    checkId: string; at: CellRef | PointRef; related?: CellRef[];
    messageKey: MessageKey; params?: Record<string, unknown>;
    suggestion?: { cells: Array<{ i: number; key: number }> };   // near symmetry: the majority side's value
  }
  ```
  `nearSymmetry.ts` uses `core/transform` (including the direction rule) to compare mirrored pairs. All checks are
  linear in the number of cells. If big charts ever feel slow, they can move to a worker without API changes.
- **Editor:** `checks/checksSession.ts` runs checks on demand, keeps the findings, the current index and the
  session-only ignores. Commands: `checks.open`, `checks.run`, `checks.next`, `checks.prev`, `checks.ignore`,
  `checks.applySuggestion` (one undo step).
- **UI:** `side/ChecksPanel` (options form generated from `options`, findings list). The canvas centres on the
  finding and draws a ring (`overlays.ts`).
- **Adding a check later** = one file in `core/checks/` + registry line + messages.

### 14.5 Mark cell as ambiguous (SPEC §15.5)
- **Data:** layer `ambiguous` (a `Set<number>`; JSON v4 `amb` as a sorted array). Its handler has `exported: false`
  and `countsUsage: false`, and `pickAt` always returns 0. Occupancy ignores it. So it **can't** leak into
  exports, totals, the picker or painting. That's enforced by the layer flags, not by remembering.
- Resize, transforms, selection moves and undo work for free through the layer contract.
- **No footprint:** no toolbar/tool registry entry. Only keymap lines (`A` → `ambiguous.toggleAtHover`,
  `Shift+A` → `ambiguous.next`), the overlay painter (corner triangle at `z ≥ 6`, theme `ambiguous`), the hover
  label in the status bar, and `status/AmbiguousStatus`, which renders **only when N > 0** (with a "Clear all"
  popover → `ambiguous.clearAll`).

### 14.6 Selection, copy/paste, move, flip/rotate (SPEC §15.6)
- **Core:** `core/pattern/fragment.ts`
  ```ts
  interface Fragment {
    size: Size; mask: Uint8Array;                 // cells covered
    layers: Partial<Record<LayerId, unknown>>;    // produced by each handler's extract()
    keys: KeyEntry[]; blends; combos; customs;    // only what the fragment uses, so it can travel between projects
  }
  extractFragment(p, mask) / insertFragment(p, f, at, { override }) → patch
  ```
  Backstitch extract keeps segments whose **both** endpoints are inside the selection outline (segments handler).
  Pasting into another project builds a `KeyIndexMap` with `sameKey`, appending missing entries with their
  blends, combos and customs.
- **Editor:** `selection/selection.ts` (mask + bounds; marquee, add with Shift, magic wand contiguous / all-of-key),
  `selection/floating.ts` (follows pointer/arrows, flip/rotate via `core/transform`, commit = one undo step,
  respects Override, ignores mirror mode), and `selection/clipboard.ts` (in-memory and kept across project switches;
  optional JSON copy to the system clipboard through `platform/clipboard`).
- **ToolManager rule:** while a fragment is floating, pointer events go to the floating controller first, then to
  the active tool.
- **Tools:** `select.ts` (`S`) and `magicWand.ts` (`W`). **Commands:** `selection.all/none/clear/nudge/flipH/flipV/
  rotate/replaceKey/cropToSelection`, `clipboard.copy/cut/paste`, `floating.commit/cancel` (keymap in §6.2).
- **UI:** `stage/SelectionActions` (small floating bar with flip/rotate/delete/replace), `ReplaceKeyDialog`;
  marching ants in `overlays.ts`.

### 14.7 Automatic snapshots — minimal versioning (SPEC §15.7)
- **Persistence:** `SnapshotRepository` port (§13) + `indexedDbSnapshotRepository.ts`. `local/indexedDb.ts` upgrades
  the `stitchwork` database to version 2 and adds the `snaps` store, key `[projectId, time]`, value
  `{ time, reason, w, h, data, thumb }`.
- **Core:** `core/snapshots/retention.ts`, a pure function `pick(snapshots, now) → toDelete` (last 10, hourly for
  24 h, daily for 14 days, cap ~50). Fully unit-tested with fake clocks.
- **Editor:** `snapshots/SnapshotService.ts`
  - Timer: every 5 minutes, only if `docRevision` changed since the last snapshot.
  - **Before destructive commands**: the command registry calls `snapshotService.before(reason)` for every command
    with `destructive` set (delete key, resize, transforms, mirror from centre, Open, New, file/OXS import,
    image → pattern, later brand conversion). New destructive commands are covered by setting that one field.
  - Thumbnail: `render/exportChart` in preview mode at a small cell size.
  - Quota errors: drop the oldest and retry once.
- **UI:** a **History…** section in `OpenPatternDialog` (`time · reason · W×H` + thumbnail). **Restore** snapshots
  the current state first, then loads the chosen one with the same project id. Reasons are message keys, so the
  list is translated.

### 14.8 Fractional stitches — quarter, three-quarter, petite (SPEC §15.13, **design gate**)
SPEC §15.13 still has open questions. The architecture keeps the stored data independent of most answers:
- **Data:** layer `partials`, sparse `Map<cellIndex, PartialStitch[]>` with `{ kind: 'quarter' | 'threeQuarter' |
  'petite', corner: 0..3 (TL, TR, BR, BL), key: number }`. JSON v4 `part: [[i, kind, c, k], …]`. This is the SPEC's
  recommended model: stitches, not areas, and 1:1 with OXS `<partstitch>`.
- **Kinds:** `core/stitches/partialKinds.ts` registry. Each kind has its corner geometry (for drawing and
  hit-testing), `threadFactor` (0.25 / 0.75 / 0.5), allowed combinations within one cell, and an optional OXS
  mapping (petite may have none, so export skips it and reports it).
- **How the open questions map to code:**

  | SPEC question | Where the decision lands | Cost of either answer |
  |---|---|---|
  | Q1 kind on the cell vs on the key entry | `PartialStitch.key` points at the colour's cross entry (cell-level kind). If you decide "on the entry", add an `EntryKind` `partial` instead. The layer data stays the same | small |
  | Q2 which kinds in v1 | entries in `partialKinds.ts` | one registry line each |
  | Q3 placement feel | `tools/partial.ts` (nearest corner via `core/geometry/nearestCorner`, kind from `ui.partialKind`, cycle key TBD) | local to the tool |
  | Q4 coexistence with full/half | `core/pattern/occupancy.ts`, the only place with "what may share a cell" rules | local |
  | Q5 erase / pick / fill | `layers/partials.ts` `eraseAt` (corner under pointer; brush > 1 clears cells) and `pickAt`; fill only targets its own layer | local |
  | Q6 rendering | `render/primitives/partials.ts` + theme `partials` | local |
  | Q7 counting | `usage()` reports `quarter` / `threeQuarter` / `petite` units; totals panel formatting | local |
  | Q8 transforms | `core/transform/direction.ts` corner remap | already designed |
  | Q9 OXS | `formats/oxs`: `<partstitch>` with directions and `palindex1/2`. Replaces today's "simplified" path in import | local |

### 14.9 French knots (SPEC §15.14, **design gate**)
- **Data:** layer `knots`, `Knot = { x, y, key }` with half-grid coordinates (JSON v4 `knots: [[x, y, k], …]`).
  New `EntryKind` `knot` with fields `colour | blend`, `strands`, `wraps` (1–3) and an optional `symbol`.
- **Placement:** `placement: 'point'` → `tools/knot.ts` is used whenever the active entry is a knot (pencil places
  one; dragging places one per half-unit passed; never two on the same point; override off = no second knot on an
  occupied point). Snapping is a function on the entry kind (`snap: 'halfGrid'`), so the SPEC Q2 answer "free
  placement" is a one-line change.
- **Layer handler:** `eraseAt` uses the eraser radius. `pickAt` runs before beads and stitches (registry order,
  §7.1). Transforms and mirror move knots like backstitch points.
- **Rendering:** `render/primitives/knots.ts`, drawn above backstitch. In symbol view it draws a black dot, or the
  symbol if the entry has one (SPEC Q1 is just whether the dialog shows the `symbol` field).
- **Totals / calculator:** `knot` usage unit; the classic calculator uses the `knotAllowance` setting.
- **OXS:** `<object objecttype="knot">` export and import, replacing today's "simplified" path.
- **Open questions** Q3 (point-placed beads) and Q4 (long stitches, lazy daisies) fit the same model. Point beads
  = a `point` placement option for the bead kind plus a points layer. Long stitches / lazy daisies = new entry kinds
  with `placement: 'segment'` and their own painter. Neither needs structural changes.

---

## 15. Migration plan

The groundwork for §14 is built **in the first phases**, even though the features come later. Retrofitting the
layer contract or structural undo after parity would mean rewriting half of `core` and `editor`.

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | Repo setup: Next.js + TS strict, ESLint boundaries, Vitest, Playwright, next-intl with `en` | CI green on an empty app |
| 1 | `core/`: catalog JSON extracted, colour maths, pattern model, **layer contract**, **transform helpers**, geometry, formats (**JSON v4**), calculator | Golden tests pass on `1.json` / `1.oxs`; outputs match the old app; layer contract suite green |
| 2 | `render/` + theme: screen renderer and PNG export | Screenshot comparison of the chart matches the old app at several zooms |
| 3 | `editor/`: store, history (**with `document` patches**), viewport, tools, commands (**with `when` + `destructive`**), shortcuts, autosave, local persistence | Editor drivable from tests without React |
| 4 | `ui/`: layout, panels, dialogs, reference windows, drop zone, toasts | Full SPEC parity checklist ticked (one checkbox per SPEC section) |
| 5 | Polish: workers for heavy jobs, `uk` translation, accessibility pass (focus, labels) | Lighthouse a11y ≥ 90; no UI freeze on 400-wide image import |
| 6 | §14.1 metadata + §14.2 grid numbering / Go to cell | Fields round-trip through JSON v4 and OXS; numbering used everywhere |
| 7 | §14.3 transforms & mirror modes | Flip/rotate identity tests; twins toast; one undo step each |
| 8 | §14.5 ambiguous marks + §14.4 error detectors | Marks never appear in exports (test); planted-error fixtures found |
| 9 | §14.6 selection, clipboard, floating paste | Cross-project paste maps keys; Esc/Enter priority tests |
| 10 | §14.7 snapshots | Retention tests; restore after resize / New works |
| 11 | §14.8 fractional stitches, §14.9 French knots — **after SPEC §15.13/§15.14 questions are answered** | OXS partstitch/knot round-trip; layer contract suite green for both layers |
| 12 (later) | Login + DB per §13 | — |

Until phase 4 is finished, `index.html` stays the working product.

---

## 16. Quick map: "I want to change…"

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
| A new layer (something new on the chart) | `core/layers/<layer>.ts` + `layers/registry.ts` + painter in `render/primitives` |
| A new key-entry kind | `core/entryKinds/registry.ts` (+ layer and tool behaviour if it places differently) |
| A chart check | `core/checks/<check>.ts` + `checks/registry.ts` + messages |
| Pattern info fields | `core/pattern/meta.ts` + `PatternInfoDialog` + messages |
| Column/row numbering | `core/grid/numbering.ts` |
| Flip / rotate / mirror rules | `core/transform/` |
| Which operations create a snapshot | `destructive` flag on the command in `editor/commands/registry.ts` |
| Snapshot retention | `core/snapshots/retention.ts` |
| Fractional stitch kinds | `core/stitches/partialKinds.ts` + `render/primitives/partials.ts` |
| What may share a cell | `core/pattern/occupancy.ts` |

---

## 17. Implementation notes (first build, 2026-11-14)

Decisions taken while implementing this plan. Each one lives in the single place named here.

**Draft features (SPEC §15.13–15.14) follow the spec's proposals; revisit when the open questions are answered**
- Fractional stitches: kind stored per cell, pointing at the colour's cross-stitch entry (Q1). Kinds: quarter,
  three-quarter, petite (Q2). Placement: Partial tool, nearest corner, `Q` cycles the kind (Q3). Sharing rules
  (Q4) use an 8-slot cell model — `core/stitches/partialKinds.ts`, `core/pattern/occupancy.ts`.
- OXS: three-quarters ↔ `<partstitch>` (direction 2 = split along ╱, 1 = along ╲); quarters, petites and knots are
  `<object>`s with Stitchwork-specific types. **Unverified against real files** — `core/formats/oxs/`.
- Knots: half-grid points, optional symbol, wraps 1–3; thread = `knotAllowance` (1.5 stitch-strand units) ×
  strands — `core/calculator/classicSkeins.ts`.

**Small departures from the single-file app**
- Key-entry edits and deletions, resize and transforms are undoable (SPEC quirk §14.4).
- No 240 000-character limit on library saves; a full browser storage shows a toast instead (quirk §14.6).
- New shortcuts: `M` cycles mirror drawing, `Q` cycles the partial-stitch kind.
- File names keep non-Latin letters (e.g. Ukrainian pattern names).
- The header's file actions live in one **Menu ▾** (formerly File ▾).

**Code-level notes**
- v1 → v4 migration lives in `core/formats/json/parse.ts` (only v1 needs real migration) instead of a separate
  `migrations.ts`.
- Mirror drawing and Mirror from centre reuse the same key entry (half crosses keep their direction, no new
  entries); only Flip and Rotate re-point half crosses to opposite-direction entries.
- Backstitch symbols are line styles (SPEC §2.5): the ids live in `core/symbols/lineStyles.ts` and are stored in
  `KeyEntry.sym` as `line:<name>`; `nextSymbol`/`symbolsFor` pick by entry kind and `fixEntrySymbols` repairs
  older files. Drawing is `render/primitives/lineStyles.ts`; strand thickness is `strandFactor` with
  `theme.backstitch.strandFirst`/`strandStep`. Adding a style = one id in core + one drawing entry in render.
- Chart checks (SPEC §15.4) were removed on 2026-11-14 for a redesign: no `core/checks`, `editor/checks` or panel.
  Nothing is left in the UI. A new design should come back as a
  core module (pure functions over a `Pattern`) + an editor session + a side-panel section, like before.
- The main toolbar is `ui/header/ToolBar.tsx`; the header measures whether everything fits on one row and otherwise
  gives the toolbar its own row (`useStacked`). `ui/side/CurrentTool.tsx` is the "Drawing with" card; it and the
  canvas share `resolveTool` (`editor/tools/registry.ts`), and shortcut labels come from `shortcutLabel` (keymap).
- App name and icon: `app.brand` / `app.title` messages and `src/app/icon.svg` (Next's icon file convention; the header shows it from `/icon.svg`).
- Saving: `editor/autosave.ts` writes the draft after each change and the library once a minute when changed
  (`markSaved` after opening from the library or a manual save).
- Stitch highlighting: `highlight` in the store, `ChartScene.highlight`; `ChartRenderer.draw` paints the other
  entries at `theme.highlight.dimAlpha`, then the highlighted one.
- Pattern file extension: `PATTERN_EXT` (`xbird`) in `editor/actions/importExport.ts`; export format id `"pattern"`.
  Reading tells OXS from our format by content, so `.json` files from earlier versions still open.
- Side panel width: `ui/layout/EditorLayout.tsx` (`--side-w`, drag handle, `localStorage`).
- Shortcut help: `ui/header/ShortcutsInfo.tsx` builds its list from `KEYMAP` via `shortcutLabels`/`formatKeys`, so
  a new binding only needs a row there.
- Tooltips: elements keep plain `title` attributes; `ui/common/Tooltips.tsx` (mounted once) shows them after
  600 ms instead of the browser's own delay.
- Menus: `Dropdown` in `ui/common/widgets.tsx` takes `MenuItem[]` (actions, `"-"` separators, nested `items` for
  submenus, optional `hint` line). The File menu is defined in `ui/header/Header.tsx`.
- Floating stage panels (the underlay alignment pad) use `ui/stage/FloatingPanel.tsx`: draggable
  by a grip, position kept in `localStorage` (a per-browser convenience).
- Underlay stretching keeps the screen centre fixed: `stretchUnderlay` in `core/underlay/`, `ViewportService.centre()`.
- Small dialogs share `ui/dialogs/simpleDialogs.tsx`; the key-entry dialog has its own folder.
- `window.__stitchwork` is the editor instance — a deliberate debugging / end-to-end test hook.
- `cacheComponents` is off: the editor is client-only, so server caching adds nothing yet.
- Golden outputs of the single-file app live in `tests/fixtures/legacy/` (recorded from `index.html` at commit
  `2d15ee4`); `src/core/formats/legacyParity.test.ts` compares against them.
- SPEC §2.2 says 11 bead series; the data has **12** (it lists 12 by name).
- Pictures (SPEC §9.6): `ImageRepository` port (`persistence/local/indexedDbImages.ts`, store `images`, database
  version 4) holds Blobs by content id; `editor/images/ImageService.ts` loads and caches decoded images and converts
  ids ↔ data URLs for .json files (`refsToFile`/`refsFromFile`, `underlayToFile`/`underlayFromFile`); old inline
  data URLs are migrated in the local repositories on read. `persistence/blobs.ts` has the conversions.
- Straightening (SPEC §15.15): `core/geometry/homography.ts` (`homography`, `project`, `warpQuad`),
  `workers/straightenImage.ts` (decode → warp → JPEG, also the main-thread fallback) run via `runStraighten` in
  `editor/heavy.ts`; `UnderlayService.straighten`; the editor UI is `ui/dialogs/StraightenDialog.tsx`.
- Chart underlay (SPEC §15.15): geometry in `core/underlay/`, `UnderlayService` in `editor/underlay/`, its own
  `UnderlayRepository` port and IndexedDB store (database version 3). In edit mode `ToolManager` routes the
  pointer to the service; middle/right-drag and Space still pan. It is reference material, so it is outside the
  layer registry, undo and exports.
