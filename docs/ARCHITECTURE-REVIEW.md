# Architecture review — 2026-11-24

> Status: **built 2026-11-24** (see *What was done* below). Written at commit `3a1fe3b` (branch `dev`, v2.3.1).
> Goals: no freezes; new features need new code rather than edits to existing code; more tests;
> an extension point for specialty stitches ([`BACKLOG.md`](./BACKLOG.md) item 7: Smyrna in 1 cell and in 4 cells,
> plus your own stitches).

**In short:** the layered structure (core ← render/editor ← ui ← app) is sound, and the 946 unit tests cover 91% of
lines in core, editor and render. Two things work against the goals:

- **Freezes:** the chart canvas redraws every visible cell on every pointer move. Several other jobs scale with the
  size of the whole pattern and run on the main thread.
- **New features need new code only:** the registries hold descriptions, but the behaviour lives in about 100
  `if (e.t === "back" | "knot" | …)` checks in 20 files (`editor/actions/keyEntries.ts` 14, `KeyEntryForm.tsx` 11,
  `core/pattern/keyEntries.ts` 10, `chartPdf.ts` 10, `occupancy.ts` 7, …). Right now a Smyrna stitch would mean
  editing all of them.

## What was done (2026-11-24)

Measured in a real browser, CPU slowed 4× (`pnpm test:perf`), whole chart in view, time from a pointer move to the
frame that shows it (median):

| | 500×650 before | 500×650 now | 1000×1000 now |
|---|---|---|---|
| drawing with the pencil | 165 ms | **15 ms** | **15 ms** |
| hovering | 297 ms | **20 ms** | **21 ms** |
| panning | — | **19 ms** | **22 ms** |
| long tasks while drawing | 126 | **0** | **0** |

- §1 all five fixes: cached chart image with tile / strip redraws and a flat-colour bitmap; derived values once per
  settled revision; history diffs two cells at a time; autosave serializes once per change, in a worker; PDF chart
  reading and chart checks run as worker jobs.
- §2 the seams a new stitch passes through: layers declare their file field, group and lines; placement rules and
  placement tools are tables; entry kinds carry traits (`marks`, `leans`, `beads`) used across core instead of kind
  names.
- §3 stamps: Smyrna over 1 and 4 cells, your own drawn in the key form (SPEC §15.58) — a backstitch entry with a
  `stamp`; new files plus one line in each table. File format: optional fields only, old files open as before.
- §4 contract suites for every layer and every entry kind / placement; time budgets; tests for the photo window, the
  PNG export, the cached renderer, the change tracker, the job runner. 946 → 1078 unit tests; e2e 97 → 98 (stamps).

Still open:
- Kind names still branch in `core/labels/keyLabel.ts`, `core/formats/oxs/exportOxs.ts` (palette items),
  `core/formats/pdf/chartPdf.ts` (key rows), `core/calculator/classicSkeins.ts` and `KeyEntryForm.tsx` — a new
  *kind* (not a new placement) still needs edits there.
- Zooming draws the whole chart each wheel step (~66 ms at 4× slower CPU).
- The PDF chart export (`chartPdf`) still runs on the main thread (it shows progress and can be cancelled).
- `editor/actions/importExport.ts` and `editor/commands/registry.ts` coverage unchanged (62% / 71%).

---

## 1. Where freezes can come from

Timed with a temporary benchmark (Vitest, Node, not committed). Test pattern: 1000×1000 with 5000 backstitch lines
and 3000 partial stitches. These are JavaScript times only: real canvas drawing costs more and wasn't measured.

| What | When it runs | 300² | 1000² |
|---|---|---|---|
| `ChartRenderer.draw()`: all visible cells, grid, all lines | **every hover move** and every store change | ~3 ms + canvas | same + canvas |
| `History` begin/commit copies and compares **all** layers | every click and every backstitch segment | 1.9 ms | 7–10 ms |
| `groupsIn(doc)` in `ui/stage/Stage.tsx` GroupsToggle | **every docRevision** (each stroke step) | 1 ms | 11 ms |
| `serializePattern`, main thread | draft 0.6 s after edits, library save after 5 s (done again) | 4 ms | 35 ms |
| `computeUsage` (`ui/side/useUsage.ts`) | 300 ms after edits stop | 2 ms | 17 ms |
| `parsePattern` | start-up, opening a pattern | 7 ms | 54 ms |

At 1000² one click costs about 20 ms straight away and about 50 ms shortly after. On a slow laptop that shows up as
stutter.

verified with a small test : on x4 cpu slowdown throttling mode drawing on 500*650 canvas is no longer 'real time'. drawn items apper after a little freeze. it's not usable at all 

### Fixes, by impact

1. **Renderer** (`render/ChartRenderer.ts`, `render/chart.ts`, `ui/stage/ChartCanvas.tsx`):
   - Keep the stitched content on an offscreen canvas, rebuilt only when the document or viewport changes.
   - Draw hover, previews, marching ants and so on, on a separate layer on top. A hover move then costs one image
     copy instead of a full redraw (today every store change calls `renderer.request()` → full `draw()`).
   - While painting, redraw only the cells that changed (the history already knows which ones).
   - Skip backstitch lines and knots that are off screen; `drawLines` currently draws all of them.
   - Avoid the `{ ...style }` object made per cell in `drawCells`.
2. **Derived data cache:** add something like `ed.derived` that works out groups, usage and similar values once per
   revision and only after edits settle. Today `Stage` (GroupsToggle), `StatusBar`, `FabricPanel`, `MaterialsPanel`,
   `ColourPicker`, `ReferenceWindow` all subscribe to `docRevision` and re-render on every stroke step.
3. **History** (`editor/history/history.ts`): copy a layer only when an edit first touches it. Dense layers can
   record just the changed cells. This also removes the `JSON.stringify` key comparison on every commit.
4. **Autosave** (`editor/autosave.ts`): serialize once per revision and reuse that result for the draft, the library
   and live sync. Move the serializing (and parsing at start-up) to a worker.
5. **Other main-thread jobs:**
   - Reading a PDF chart (`readChart` in `editor/actions/importExport.ts`, also inside a `useMemo` in
     `ui/dialogs/PdfChartDialog.tsx`).
   - Chart checks (`runChecks` in `editor/checks/checks.ts`).
   - `matchBlock` (`editor/matching/matching.ts`).
   - The `chartPdf` export.

   `editor/heavy.ts` already has the `inWorker` helper; it can become a general typed job runner.

---

## 2. Making new features "new code only"

- **Behaviour in the registries.** Each entry kind (`core/entryKinds/registry.ts`) becomes an object that carries its
  own label, icon, usage and thread maths, overlap rules, OXS/PDF/PNG export and key-form fields. Each
  `LayerHandler` (`core/layers/types.ts`) gets `draw(...)` and `exportLines(...)`. Then the renderer, exporters and
  `editor/actions/paint.ts` loop over the registries instead of naming layers (`paint.ts` names layers 26 times).
- **Do it file by file.** Each step changes no behaviour and is checked by contract tests (§4).
- **Placement tools.** Make `PLACEMENT_TOOLS` (`editor/tools/registry.ts`) and `ToolManager.showsHoverSquare` read
  the placement from the registry instead of listing tool ids.

---

## 3. Extension point: Smyrna and custom stitches

The idea: each special stitch is a **fixed-size stamp of backstitch lines** placed on an n×m block of cells.

```ts
// core/stamps/types.ts
interface StampDef { id: string; name: string; w: number; h: number;      // size fixed, never changed
                     lines: { x1: number; y1: number; x2: number; y2: number }[] } // half-grid, inside w×h
// built in: smyrna1 (1×1), smyrna2 (2×2); custom ones live in Pattern.stamps
// new layer "stamps": { x, y, def, k, turn?: 0|1|2|3, flip?: boolean }[]
// new entry kind "stamp": colour + strands + def id, placement "block"
```

- **New files only:**
  - the stamp layer handler (resize, transform, select, erase, pick, count, save);
  - the entry kind;
  - `stampTool` (hover preview of the lines, the brush locked to w×h);
  - a dialog for drawing a stamp.
- **Drawing your own stamps:** the dialog can reuse `ChartRenderer` and the backstitch tool on a small w×h chart,
  the same way floating selections already use a small preview pattern.
- **Exports:** OXS, PDF and PNG turn each stamp into plain backstitch lines through one function, so reader apps
  (Хрестики, Ruta Stitch) show them correctly.
- **Why a layer and not plain lines:**
  - totals can say "12 Smyrna crosses";
  - the eraser and picker take a whole stamp;
  - mirroring is handled by the `turn`/`flip` fields.

⚠️ **This changes the file format — decision needed before building.** `stamps` would be a new optional field in
`.xbird` files. Older app versions would open such a file and silently drop the stamps. Under the `XBIRD_VERSION`
rule (`core/formats/json/serialize.ts`, `docs/RELEASING.md`) that probably means bumping the version and adding a
migration step.

note: the app is not being installed now. it's a pure web. so old version won't be opening any new files. but the new version must open old files
---

## 4. Tests

- **Contract tests that loop over the registries.** `core/layers/layerContract.test.ts` already does this for
  layers; extend it to entry kinds. Every kind must draw, label, count, export to OXS and survive a `.xbird` round
  trip. A new stitch kind is then tested automatically.
- **Performance budget tests,** like the benchmark in §1, so regressions fail CI. For example: one click on 1000²
  under 15 ms.
- **Weakest files:**

  | File | Line coverage |
  |---|---|
  | `render/referenceRenderer.ts` | 0% |
  | `render/exportChart.ts` | 26% |
  | `render/primitives/cells.ts` | 60% |
  | `editor/actions/importExport.ts` | 62% |
  | `editor/commands/registry.ts` | 71% |

  The rendering ones can be tested with a canvas stand-in that records the drawing calls.

---

## Suggested order

1. **Performance**, with no visible change, plus the budget tests.
2. **Moving behaviour into the registries**, plus the contract tests.
3. **Stamps:** Smyrna 1×1 and 2×2, then custom stamps (after the file-format decision).
