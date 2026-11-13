# Stitchwork — Functional Specification

> Reverse-engineered from `index.html` (single-file vanilla JS app, ~2300 lines) on 2026-11-14.
> Purpose: a reference for future work and a contract for any rewrite (e.g. Next.js). An app built
> from this document should preserve essentially all behaviour of the original. Visual styling is
> **not** part of the contract unless stated; behaviour, data formats, maths and text that ends up
> in exported files **are**.
>
> Source locations are given as `index.html:LINE` for the original implementation.

---

## 1. Overview

Stitchwork is a browser-based designer for **counted cross-stitch and bead embroidery patterns**.
The user builds a **key** (legend) of thread / bead entries, then paints them onto a rectangular
grid of stitches. It supports:

- Full and half cross stitches, backstitch lines, Mill Hill beads, and "floss + bead" combos
- Thread **blends** (2–3 DMC threads twisted in one needle)
- Custom (non-DMC) threads and beads
- Drawing tools: pencil, line, rectangle, filled rectangle, flood fill, eraser, picker, pan; brush
  size, mirror mode, override mode, undo/redo
- Three chart views: colour, colour+symbols, symbols only
- Thread / bead totals and a skein shopping list
- Converting a photo into a pattern (DMC colour quantisation)
- Floating **reference photo windows** with marker annotations, stitch-grid overlay and progress shading
- Persistence in `localStorage` (autosave + named library), optional cloud storage when running
  inside the Claude artifact runtime
- Export: PNG (3 kinds), CSV shopping list, OXS (Open Cross Stitch XML), native JSON
- Import: native JSON, OXS

No build step, no dependencies other than Google Fonts (Fraunces, DM Sans).

---

## 2. Static colour data

### 2.1 DMC stranded cotton — `DMC_RAW` (`index.html:304-791`)

- **488 entries**, one per line: `code|name|HEX` (e.g. `310|Black|000000`).
- Codes are strings and include non-numeric ones: `B5200`, `White`, `Ecru`, `01`…`35`, `150`…`3866`.
- File order is significant: it is the "by number" sort order (`order` = line index).
- Each entry becomes a colour object (see §2.4) with `id = "dmc:" + code`, `kind:'thread'`, `brand:'DMC'`.
- `DMC_BY_CODE`: exact-code lookup map.

### 2.2 Mill Hill beads — `BEAD_RAW` (`index.html:795-1333`)

- **527 beads** in 11 series. Series header lines start with `#`; bead lines are `code,name,dmcEquivalent`.
- Series and counts (in file order): Glass Seed 118, Crayon Seed 9, Petite Glass 39, Antique Glass 73,
  Frosted Glass 36, Magnifica 119, Size 8 25, Size 6 36, Pebble 20, Small Bugle 23, Medium Bugle 17,
  Large Bugle 12.
- Bead screen colour = hex of the DMC thread named in the 3rd column; `#B0B0B0` if not found.
- `id = "bead:" + code` (codes are 5-digit strings, e.g. `00557`, `02011`), `kind:'bead'`,
  `brand:'Mill Hill'`, plus `series` and `dmc` fields.

### 2.3 Bead shapes (`BEAD_SHAPE`, `index.html:1358`)

Used when drawing beads. Unlisted series use the default radius `0.4`.

| Series        | Shape                    |
|---------------|--------------------------|
| Petite Glass  | circle r = 0.30 × cell   |
| Size 8        | circle r = 0.44          |
| Size 6        | circle r = 0.47          |
| Pebble        | circle r = 0.50          |
| Small Bugle   | capsule length 0.62 × cell |
| Medium Bugle  | capsule length 0.80      |
| Large Bugle   | capsule length 0.95      |

### 2.4 Colour object (`mkColor`, `index.html:1346`)

Every library/custom/blend/combo colour is normalised to:

```
{ id, kind:'thread'|'bead'|'combo', brand, code, name, hex:'#RRGGBB' (upper-case),
  rgb:[r,g,b], lin:[linear sRGB 0..1], lab:[L,a,b] (D65),
  hue:number   // sort key for "by colour": greys (HSL S<0.12) get 1000+(1-L), else H + L*0.001
  ink:'#1d1a16'|'#fff' // symbol colour on this background: luma(0.299,0.587,0.114) > 150 → dark
  order, series?, dmc?, isBlend?, parts?, isCombo?, thread?, bead? }
```

Colour maths (must be reproduced exactly; used by blending, image import, blend finder):
- sRGB ↔ linear with the standard 0.04045 / 0.0031308 piecewise curves.
- Linear → XYZ (sRGB matrix, D65 white 0.95047 / 1 / 1.08883) → CIE L\*a\*b\* (ε = 0.008856, κ-linear 7.787·t + 16/116).
- Distance = squared Euclidean ΔE76 (`dE2`); displayed as `sqrt`.

### 2.5 Chart symbols (`SYMS_ALL`, `index.html:1364-1385`)

- An ordered list of ~300 characters: geometric shapes, card suits, arrows, box-drawing,
  stars/asterisks, Latin letters (excluding ambiguous `I O c i j l o p s v w x z`), digits, punctuation, Greek capitals.
- Order matters: the first unused symbol is auto-assigned to new key entries.
- Characters that may render as emoji are suffixed with U+FE0E (text presentation selector).
- **Font probe at start-up** (`usableSymbols`): each symbol is drawn on a 40×40 canvas in
  `600 30px "DM Sans"`; it is dropped if it is a duplicate, has ≤ 4 inked pixels, has coloured
  pixels (emoji), or matches the "tofu" signature of U+10FFFD / U+FFFF / empty string.
- `symNorm(s)`: when loading, a bare single char whose `char+U+FE0E` exists in the list is upgraded.

---

## 3. Data model

### 3.1 Project (`P`, `newProject`, `index.html:1403`)

```
P = {
  id:      'p' + Date.now().toString(36),     // stable identity, used as library key & refs key
  name:    'Untitled pattern',
  w, h:    integers 5..500 (grid size in stitches)
  count:   fabric count: 11 | 14 | 16 | 18 | 14.01 ("28 ct over 2") | 16.01 ("32 ct over 2")
  strands: default strands for new cross entries (2); updated to last strands chosen when adding
  fabric:  '#F7F4EC' (hex)
  stitches: Uint16Array(w*h)   // key index for thread/combo layer, 0 = empty; index = y*w + x
  beads:    Uint16Array(w*h)   // key index for bead layer, 0 = empty
  back:     [[x1,y1,x2,y2,keyIndex], …]   // backstitch segments in grid units, half-unit precision
  pal:      [null, entry, entry|null, …]   // the KEY. Index 0 is always null. Deleted entries become null (indices are stable)
  blends:   { 'blend:<id>': { parts:[{id:'dmc:310', n:1}, …] } }   // 2–3 parts
  combos:   { 'combo:<id>': { thread:'dmc:…'|'custom:…', bead:'bead:…'|'custom:…' } }
  customs:  { 'custom:<id>': colourObject (kind 'thread'|'bead', brand, code, name, hex, series?) }
}
```

`count` values with `.01` are a hack to distinguish evenweave "over 2" from Aida of the same
effective count; everywhere the count is used numerically it is `Math.floor`-ed.

### 3.2 Key entry (`P.pal[i]`, i ≥ 1)

| `t`        | fields                                   | layer     | meaning |
|------------|------------------------------------------|-----------|---------|
| `'thread'` | `src`, `n` (1–6 or `null` for blends), `st`, `sym` | stitches | cross stitch (single DMC/custom thread or blend) |
| `'combo'`  | `src:'combo:…'`, `n`, `st`, `sym`        | stitches  | floss + bead in the same square |
| `'bead'`   | `src:'bead:…'|'custom:…'`, `sym`         | beads     | bead only |
| `'back'`   | `src` (thread or blend), `n` (1–6 or `null`), `sym` | back | backstitch |

- `st` ∈ `'full'` (✕ full cross), `'half'` (╱, bottom-left→top-right), `'halfb'` (╲, top-left→bottom-right).
- `src` resolves via `getEntry(id)`:
  - `dmc:*`, `bead:*` → static library
  - `custom:*` → `P.customs`
  - `blend:*` → computed blend colour (cached in `blendCache`)
  - `combo:*` → computed combo entry (cached)
- **Blend colour** (`makeBlendEntry`): strand-weighted average in *linear* RGB, converted back to sRGB.
  `code` = part codes joined by `+`; `name` = `"1× DMC 310 + 1× DMC 413"`. Unresolvable → `#CCCCCC`.
- **Combo entry**: `hex` = thread hex; `code` = `threadCode+beadCode`; carries `thread` and `bead` objects.
- **Same key** (`sameKey`): same `src` and `t`, and (for non-beads) same `st` and `n`. Duplicate keys
  are *allowed* but trigger a confirmation (§6.3).

### 3.3 Derived palette cache (`pal`, `refreshPal`, `index.html:1432`)

Rebuilt whenever the key changes. Per index: `hex`, `ink`, `sym`, `t`, `st`, `n` (for blends = total
strands of parts), and for bead/combo: `bhex`, `bink`, `shape`. Missing colour → `#FF00FF`.

### 3.4 Display labels (`keyParts`, `brandCode`)

- `brandCode(e)`: `"DMC 310"`, `"MH 00557"`, `"<Brand> <code>"` for customs, `"Blend 3713+Ecru"` for blends.
- Title / subtitle per entry type:
  - bead: `MH 00557` / `Gold · bead (Glass Seed)`
  - combo: `DMC 3371 + MH 00557` / `2 strands · half cross ╱ · with Gold bead`
  - back (single): `DMC 3371` / `Black Brown · 1 strand · backstitch`
  - back (blend): `Blend a+b` / `<blend name> · backstitch`
  - thread (blend): `Blend a+b` / `<blend name> · full cross`
  - thread: `DMC 310` / `Black · 2 strands · full cross`
- `keyLabel(p)` = `title + ' — ' + sub` (used in toasts, status bar, tooltips).

---

## 4. Layout & UI regions

Grid layout: header (top), canvas stage (centre), status bar (bottom), side panel (right, 360 px).

### 4.1 Header
Brand mark · editable **pattern name** input (change → `P.name`, trimmed, default "Untitled pattern", autosave) ·
buttons **New**, **Open**, **Save**, **Save to file**, **Load file**, **Image → pattern**, **+ Reference** ·
view segmented control **Colour / Both / Symbols** (default Both) · **Export ▾** menu.

### 4.2 Stage
- Full-size `<canvas>` with rulers (§5).
- Zoom control (bottom-right): `−`, percentage label (`round(zoom/12*100)%`), `+`, fit `⤢`.
- **Mini toolbar** (only when side panel collapsed): expand button, active-key icon (click = expand),
  pencil, eraser, picker, pan, override, undo, redo.

### 4.3 Status bar
`Column X · Row Y` (1-based) of hovered cell, labels of what's in that cell (stitch and bead
`keyLabel`s joined by `  ·  `), fixed hint text (`Space = move · O = override · Esc ends a backstitch line · 1–9 pick key entries · K hides the panel`),
grid size `W×H`, save status (`Patterns save in this browser` / `…to your account` / `Saved HH:MM`).

### 4.4 Side panel
1. **Tool row**: pencil, line, rect, filled rect, fill, eraser, picker, pan | brush size select (1×1…5×5) | override toggle, mirror toggle | undo, redo | collapse.
2. **Key header**: "Key", count text (`N entries` / `1 entry`), **+ Add to key** button.
3. **Key list** (§7).
4. Collapsible **Fabric & size**: fabric count select (11/14/16/18 ct Aida, 28 ct over 2, 32 ct over 2),
   fabric colour picker, **Resize…** button, size info (§7.3).
5. Collapsible (open by default) **Totals & shopping list** (§7.2).

### 4.5 Shared widgets
- **Modal**: title, body (string HTML or element), footer buttons `{label, primary?, id?, action?}`.
  An action returning `false` keeps the modal open. Clicking the backdrop closes it. Optional `wide` (820 px).
  Only one modal at a time.
- **Toast**: bottom-centre, auto-hides after 2.6 s.
- **Export menu**: dropdown anchored under the Export button; closes on outside pointerdown.

---

## 5. Chart canvas rendering (`draw`, `index.html:1510`)

Coordinates: `RULER = 26` px gutter on top and left. Cell (x,y) top-left in screen px =
`(RULER + offX + x*zoom, RULER + offY + y*zoom)`. Canvas is DPR-scaled. Rendering is batched with
`requestAnimationFrame` (`render()` coalesces).

Order of drawing:
1. Stage background `#E9E2D5`.
2. Fabric rect: `P.fabric`, or white in *Symbols* view.
3. Only cells within the visible range are drawn (culling).
4. **Stitch layer**, per cell with `stitches[i]`:
   - full: fill cell with colour (colour views only).
   - half: diagonal line clipped to cell; colour views → colour, width `max(1.2, 0.34z)`;
     symbols view → `rgba(0,0,0,.38)`, width `max(1.2, 0.07z)`. `half` = ╱, `halfb` = ╲.
   - combo: additionally draw bead shape at 80 % radius (bugles unchanged) on top.
   - Symbol drawn if view ≠ colour, `z ≥ 9`, and **no bead in that cell**:
     full → `ink` colour (or dark in symbols view) at 68 % size; half → dark with white halo, 56 %; combo → bead ink, 50 %.
5. **Bead layer**: bead shape — radial gradient highlight (white → hex → hex darkened 35 %), dark outline
   `max(1, z/14)`, centre hole (for non-bugles, `z ≥ 6`). Symbols view: white fill. Symbol at 50 % if `z ≥ 9`.
6. **Preview** of line/rect shapes at 55 % alpha.
7. **Grid** (if `z ≥ 5`): thin lines (skipping every 10th); then bold 10-line major grid and outer border (always).
8. **Backstitch** segments on top of grid. Colour = entry hex, darkened 45 % if luma > 215 (so white is visible);
   symbols view → `#1d1a16`. Width `max(1.5, z*(0.07 + 0.035*min(4, strands)))`, round caps.
9. Backstitch drawing affordances (active entry is backstitch and tool is a draw tool): rubber-band line
   from chain end to hover point (55 %), hover-point dot, ring at chain end. Accent colour `#B5452F`.
10. **Mirror** guide: dashed vertical line at centre.
11. **Hover cursor**: accent rectangle sized to brush (pencil/eraser) or 1×1; hidden for pan and backstitch drawing.
12. **Rulers**: numbers every 10 (every 20 if z < 4, every 50 if z < 2) and tick marks; red triangles marking
    horizontal & vertical centre.

### 5.1 Viewport
- `fit()`: zoom = clamp(floor(2·min((CW−RULER−30)/w, (CH−RULER−30)/h))/2, 2, 40), centred. Key `0` / ⤢.
- `zoomAt(f, sx, sy)`: zoom clamp 2..60, keeps the point under the cursor fixed. `+`/`=` ×1.25, `-` ×0.8.
- Wheel: **Ctrl/⌘+wheel or a real mouse wheel** (deltaMode≠0, or integer |deltaY|≥50 with no deltaX) → zoom by
  `exp(-clamp(deltaY*(deltaMode?33:1), ±120)*0.0025)`. Otherwise (trackpad) pans; Shift+wheel pans horizontally.
- Pan: middle or right mouse drag, Pan tool, or hold Space.
- Canvas resizes with a `ResizeObserver`.

---

## 6. Editing

### 6.1 Global edit state
`tool` (default pencil), `activeK` (selected key index, 0 = none), `view`, `mirror` (off), `brush` (1),
`override` (off), `chain` (current backstitch polyline), undo/redo stacks.

### 6.2 Tools

All painting requires an active key entry; otherwise toast:
"Add something to your key first — click “+ Add to key”" (empty key) or "Pick an entry in the key first".

| Tool | Key | Behaviour |
|------|-----|-----------|
| Pencil (`pencil`) | P, B | Paint brush-sized square (centred, offset `floor((size-1)/2)`) at each cell; drag interpolates with Bresenham so no gaps. |
| Line (`line`) | L | Drag; preview; on release paint Bresenham line (1-cell wide, brush ignored). |
| Rectangle (`rect`) | R | Drag; outline of the bounding box. |
| Filled rect (`frect`) | Shift+R | Drag; filled box. |
| Fill (`fill`) | F | 4-connected flood fill on the active entry's layer (beads layer for bead entries, else stitches), replacing cells equal to the start value. Not available for backstitch (toast "Fill doesn’t apply to backstitch — use draw or line"). No-op if target already equals the active entry. |
| Eraser (`eraser`) | E | Clears **both** stitch and bead layers within brush; also deletes backstitch segments whose distance to the pointer (grid units) ≤ `0.3 × max(1, brush/2)`. |
| Picker (`picker`) | I | Selects the entry under the pointer: backstitch within 0.25 units (topmost/last) wins, then bead, then stitch. Toast "Picked …" or "Nothing here to pick". |
| Pan (`pan`) | H / hold Space | Drag to pan. |

- Selecting a key entry while on eraser/picker/pan switches to pencil.
- Switching to a tool other than pencil/line/rect/frect ends the backstitch chain.
- Cursors: pan/space → grab, picker → copy, otherwise crosshair.

**Mirror**: every painted cell `(x,y)` also paints `(w-1-x, y)`; backstitch segments are mirrored
around `x = w/2`; eraser also erases mirrored backstitch.

**Override** (`occupied` rules, `index.html:1581`). With override **off**, only "empty" cells take paint:
- bead entry: cell is occupied if it already has a bead **or** its stitch is a combo.
- combo entry: occupied if it has any stitch **or** any bead.
- thread entry: occupied if it has any stitch (beads don't block).
With override **on**, everything is painted. Painting a combo always clears the bead layer in that cell.
Flood fill also respects occupancy. Toggling shows a toast explaining the mode.

### 6.3 Backstitch drawing
When the active entry is a backstitch and the tool is pencil/line/rect/frect:
- Points snap to the nearest **half** grid unit, clamped to `[0,w]×[0,h]`.
- First click starts a chain. Each subsequent click adds a segment from the chain end and moves the end.
- Press-drag-release from the chain end also adds one segment (drag = one segment).
- Chain ends on: Esc, double-click, right-click, tool switch, key entry change, undo.
- Zero-length segments are ignored. Each segment is its own undo step.

### 6.4 Undo / redo
- Snapshots store copies of `stitches`, `beads`, `back` (not the key). Max 60 undo levels; any new action clears redo.
- One stroke = one undo step. A pencil/eraser stroke that changed nothing is dropped from the stack.
- Shape tools snapshot on release only if they paint ≥ 1 cell. Fill snapshots only if something changed.
- Undo/redo history is **cleared** by: loading a project, creating new, resizing, deleting a key entry.
- Shortcuts: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl/⌘+Y redo. Buttons disabled when stacks are empty.

### 6.5 `changed()` pipeline
After any edit: mark dirty, re-render chart, re-render reference windows, and (debounced 300 ms)
re-render key panel and autosave.

### 6.6 Keyboard shortcuts (ignored while focus is in input/select/textarea or a modal is open)
`Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y`, `Ctrl/⌘+S` (save to library) · `Space` (hold to pan) ·
`Esc` (end chain) · `K` (toggle side panel) · `O` (override) · `1`–`9` (select the n-th non-null key entry) ·
`P`/`B` pencil · `L` line · `R` rect · `Shift+R` filled rect · `F` fill · `E` eraser · `I` picker · `H` pan ·
`+`/`=` zoom in · `-` zoom out · `0` fit. Window blur releases Space.

---

## 7. Key panel

### 7.1 Key list (`renderKey`, `index.html:1730`)
One row per non-null `P.pal` entry in index order:
- Key icon (canvas, 30 px) rendered in the current view mode: a stitch/bead/backstitch sample with symbol.
- Title (with shortcut badge `1`…`9` for the first nine rows) and subtitle (§3.4).
- Usage count (`—` if 0) with unit `stitch`/`stitches`, `beads`, or `lines` (backstitch segments).
- Edit ✎ and delete ✕ buttons.
- Click → set active; double-click / ✎ → edit dialog. Active row is highlighted.
- Empty state: "Your key is empty." + explanation + **+ Add to key** button.

**Delete entry**: if used, confirm modal "Delete <title>?" — "It’s used N times on the chart. Deleting the
entry removes those stitches too." Deletion clears all its cells / segments, sets `P.pal[i] = null`,
clears undo history, deselects if active, toast "Entry deleted".

### 7.2 Totals & shopping list (`keyRows`, `index.html:1714`)
- Counts: **full** = cells of thread/combo entries with `st='full'`; **half** = the rest of thread/combo cells;
  **backstitch lines** = number of segments; **beads** = bead cells + combo cells.
- Thread consumption in "stitch-strand units":
  - cross / combo thread: `cells × strands × (0.5 if half else 1)`
  - blend: each part `cells × partStrands × factor`
  - backstitch: `totalSegmentLength × 0.42 × strands` (blend: per part with its strands)
- **Skeins** per thread = `max(1, ceil(units / (3600 × floor(count)/14)))`.
- Threads and beads are aggregated by underlying colour id (blend parts and combo threads count toward
  their base thread) and sorted by library order.
- Display: `To buy · N threads, ≈S skeins`, list `DMC 310 × 2 · …`, bead list `MH 00557 Gold: 12 · …`,
  and the note "Half crosses count as half the thread of a full cross; blend parts count toward each thread."

### 7.3 Fabric & size
- Fabric count change → `P.count`, re-render key, autosave. Fabric colour → `P.fabric`, re-render chart & key.
- Size info: `Grid W × H` · `Finished a″ × b″ (c × d cm)` with `a = w / floor(count)` (1 decimal) ·
  `Cut fabric ≈ (a+6)″ × (b+6)″` (rounded).
- **Resize…** modal: width, height (5..500), anchor "Keep design centred" (offset `floor((new-old)/2)`) or
  "Keep top-left". Cells outside are cropped; backstitch is shifted and segments with any endpoint outside
  are dropped. Clears undo history, then fits view.

### 7.4 Side panel collapse
`K`, the collapse button or mini-strip expand toggles the panel; the canvas and reference windows re-layout.

---

## 8. Add / edit key entry dialog (`keyDialog`, `index.html:1796`)

Wide modal titled **Add to key** / **Edit key entry**.

**Type** segmented control: *Cross stitch*, *Backstitch*, *Bead*, *Floss + bead*.
- When editing an entry that is already used on the chart, the type can only change within the same layer
  (cross ↔ floss+bead); otherwise toast "This entry is already on the chart — only cross stitch ↔ floss + bead can be swapped".
- Switching to Backstitch on a new entry sets strands to 1; switching back resets to `P.strands`.

**Colour area** depends on type:
- Cross / Backstitch: *Single thread* | *Blend* toggle.
  - Single: **thread pick list** (§8.1).
  - Blend editor: 2–3 rows, each a text input with datalist of all DMC + custom threads (`"310 — Black"`;
    parsing uses the part before ` — `, case-insensitive), a strands select (1–3), and remove button (only
    when 3 rows). "+ Third colour" adds a row. **Find a blend for a colour**: colour input + Find → the 6
    best **pairs** of DMC threads whose 50/50 linear-RGB mix is closest (ΔE76) to the target, each shown with
    target swatch, blend swatch, codes and `ΔE x.x`; clicking one sets the two slots (1 strand each).
- Bead: **bead pick list**.
- Floss + bead: thread pick list ("Floss") and bead pick list ("Mill Hill bead") side by side (shorter lists).

**Options**:
- Stitch (cross / combo): *✕ Full cross*, *╱ Half cross*, *╲ Half cross*.
- Strands (not for bead, not for blends): 1–6.
- Symbol: button showing the current symbol; toggles a grid of all usable symbols. Symbols used by other
  entries are dimmed with tooltip "Already used — picking it swaps". Default = first free symbol.

**Preview**: 44 px key icon + title/sub. Shows "Choose a floss and a bead." / "Choose two different threads
for the blend." and disables OK when incomplete (blend needs every slot filled and all distinct).

**Duplicate warning**: if an identical key exists — "Same colour, strands and stitch as <sym title> already in
your key. You can still add it with its own symbol." The OK button becomes "Add anyway"/"Save anyway"; the first
click arms confirmation, second click commits.

**Commit**:
- Blends and combos are deduplicated: an existing `P.blends` entry with the same multiset of `id×n` is reused;
  an existing combo with the same thread+bead is reused; else a new `blend:`/`combo:` id (`Date.now` base36) is created.
- Symbol swap: if another entry already has the chosen symbol, it receives the edited entry's old symbol
  (edit) or the first free symbol (add).
- Edit: replace entry in place (index unchanged → chart follows); moving a used entry to another layer is
  refused; converting to combo clears beads under its cells. Toast "Entry updated — the chart follows".
- Add: append; for cross/combo with strands, `P.strands` = chosen strands; select it; switch to pencil if the
  current tool isn't a draw tool. Toast "Added — draw with it now".

Defaults for a new entry: Cross stitch, single DMC 310, blend slots DMC 310 + DMC 413 (1 strand each),
bead MH 00557, strands = `P.strands` (2), full cross.

### 8.1 Pick list (`pickList`, `index.html:1774`)
- Search box. Matching (case-insensitive): code **starts with** query, or name **contains** query, or (beads)
  `"dmc " + dmcEquivalent` starts with query, or series contains query.
- Threads: sort toggle **By number** (DMC first in file order, then customs) / **By colour** (`hue` key).
- Beads: series filter: *All series*, each series with count `Glass Seed (118)`, *My beads* (customs only).
- Rows: swatch (beads round with shading; blends diagonal stripes; combos thread + bead dot), code, name,
  `· ≈ DMC xxx` for beads, series or brand tag. Selected row highlighted and scrolled into view (when no query).
- "Nothing matches." empty state.
- **+ Custom thread / + Custom bead** inline form: Brand (default `Anchor` / `Mill Hill`), Code (required —
  toast "Enter a code"), Name (default `Custom`), colour (default `#7A9CC6`). Creates `custom:<base36 time>`
  in `P.customs` and selects it.

---

## 9. Persistence

### 9.1 localStorage keys
| Key | Content |
|-----|---------|
| `stitchwork.current` | Serialized current project (§9.3), written by **autosave** 600 ms after changes. No refs. |
| `stitchwork.library` | `{ [projectId]: { name, updated (ms), w, h, data: JSON string of §9.3 } }` |
| `stitchwork.refs.<projectId>` | Array of serialized reference windows (§11.4). Removed when there are none. |

All storage access is wrapped in try/catch; quota failures are silent except where noted.

### 9.2 Boot
1. Try to load `stitchwork.current`. 
2. Otherwise create a 60×60 project and seed the **demo** (`seedDemo`, `index.html:2290`): a heart of DMC 321
   (2 str) with DMC 498 (3 str) outline, a blend row (3713 + Ecru), a half-cross row (DMC 310, 1 str),
   three combo cells (DMC 3371 + MH 00557, half), four MH 02011 beads, a backstitch box (DMC 3371, 1 str),
   and an unused DMC 3865 entry.
3. Set up canvas observer, fit, select pencil.

### 9.3 Native JSON format (v3) (`serialize`, `index.html:1905`)
```json
{
  "app": "stitchwork", "v": 3,
  "id": "p…", "name": "…", "w": 72, "h": 72,
  "count": 14, "strands": 2, "fabric": "#F7F4EC",
  "pal":   [ {"t":"thread","src":"dmc:310","n":2,"st":"full","sym":"▼"}, … ],
  "blends": { "blend:…": {"parts":[{"id":"dmc:3713","n":1},{"id":"dmc:Ecru","n":1}]} },
  "combos": { "combo:…": {"thread":"dmc:718","bead":"bead:02077"} },
  "customs": { "custom:…": {"id","kind","brand","code","name","hex","series"} },
  "s": "0*73,20,4,20,…",   // RLE of stitches
  "b": "…",                // RLE of beads
  "back": [[x1,y1,x2,y2,k], …],
  "refs": [ … ]            // only in file exports (§11.4)
}
```
- `pal` is **compacted**: null entries are removed and indices remapped (file index = position + 1; index 0 implicit).
- RLE: comma-separated tokens `value` or `value*count`.
- **Load** (`load`): rejects if `app !== 'stitchwork'` or no `w` ("Not a Stitchwork pattern file").
  Defaults: count 14, strands 2, fabric `#F7F4EC`. Normalises symbols (`symNorm`). Drops malformed backstitch.
  **v1 compatibility**: `pal` items `{id, sym}` → bead entry if the id is a bead, else thread full cross with
  `n = d.strands||2` (or `null` for blends).
- After load: refresh palette, clear chain & undo, sync header/fabric inputs, rebuild datalists, render key,
  keep the previously active index if still valid else select the first entry, fit, then switch reference
  windows to this project (from the file's `refs` if present, otherwise from localStorage).

### 9.4 Library: Save / Open / New
- **Save** (button or Ctrl/⌘+S): `P.name` from the input; body `{name, updated, w, h, data}`.
  If `data.length > 240000` → toast "Pattern is too large to save online — use Save to file" and abort.
  Cloud first if available (§9.5) → "Saved “name” to your account" and status `Saved HH:MM`; quota error →
  "Storage is full — delete an old pattern first". Otherwise `stitchwork.library[P.id]` → "Saved “name” in this
  browser"; on failure "Could not save here — use Save to file instead".
- **Open** modal "Open a pattern": lists cloud items (ordered by `updated` desc, limit 200, 10 s timeout →
  "Couldn’t reach your saved patterns right now.") merged with local items (local only if id not in cloud),
  sorted newest first. Each row: name, `W×H · <locale date time>` (+ ` · this browser` for local), delete 🗑
  (no confirmation; toast "Deleted"). Click → load, toast "Opened “name”". Empty: "No saved patterns yet. Use Save to keep your work."
- **New** modal: Name, Fabric (11/14/16/18 ct), Width, Height (80×80 default, 5..500), checkbox
  "Start with the same key (threads, beads, symbols)" (checked) — copies `pal`, `blends`, `combos`, `customs`.
  Warning "Unsaved changes to the current pattern will be lost — save first if you want to keep it."
  New project gets a new id; `strands` carried over.

### 9.5 Optional Claude-runtime capabilities (`index.html:1930`)
If `window.claude.use` exists, the app requests `db`, `user` and `downloads`:
- `cloud = db.collection('data/users/' + userId)`, documents keyed by project id, same body as the local library.
- `downloads.save({filename, data})` is used for all exports (§10).

> **Known issue:** outside the Claude artifact runtime `downloads` is `null`, so every export falls back to a
> modal: "Downloads aren’t available here. Copy this text into a file ending in .ext" with a textarea and Copy
> button (PNG → "right-click the image to save it"). This is why "Save to file" does not download in a normal
> browser. A rewrite should use a standard `Blob` + `<a download>` (or the File System Access API).

---

## 10. Export (`doExport`, `index.html:1976`)

File base name `safeName()` = `P.name` with characters other than `\w`, `-`, space removed, trimmed, spaces → `-`;
fallback `pattern`.

| Menu item | Output |
|-----------|--------|
| Chart image — colour + symbols (PNG) | `<name>-chart.png`, mode `both` |
| Chart image — symbols only, for printing (PNG) | `<name>-chart.png`, mode `sym` |
| Preview image — colour blocks (PNG) | `<name>-preview.png`, mode `color` |
| Shopping list (CSV) | `<name>-shopping-list.csv` |
| OXS — Open Cross Stitch | `<name>.oxs` |
| Stitchwork pattern file (JSON) | `<name>.json` (= §9.3 **plus** `refs`) |
| Load a .json or .oxs file… | opens file picker (§12) |

**Save to file** button opens a chooser modal with the JSON and OXS options and their descriptions.

### 10.1 PNG chart (`chartCanvas`, `index.html:1989`)
- Cell size: colour mode `clamp(floor(2400/max(w,h)), 4, 12)`; chart modes `clamp(floor(4800/max(w,h)), 16, 24)`.
- Margin `M`: 16 (colour) / 40 (charts). White background, fabric (or white) under the grid.
- Stitches, beads drawn as on screen (symbols always, since z ≥ 16). Chart modes add thin grid `rgba(0,0,0,.3)`,
  bold 2 px grid every 10 and border, column/row numbers every 10, red centre triangles.
- Backstitch on top.
- Chart modes append a **key** below: heading `"<name>  —  key"` (Fraunces 20 px), then used entries only in
  columns of 420 px (`keyCols = max(1, floor((w*z + 2M - 40)/420))`), 34 px rows: 26 px icon with border, title,
  and `sub (count)` truncated to 58 chars.
- Canvas width = `max(w*z + 2M, 420 + 2M)` for charts.

### 10.2 CSV
All fields double-quoted (`"` escaped as `""`), `\n` line endings:
```
"Symbol","Item","Details","Count"
"▼","DMC 310","Black · 2 strands · full cross","123"   ← one row per USED key entry
                                                          (blank line)
"To buy"
"","DMC 310","Black","2 skeins"
"","MH 00557","Gold","12 beads"
```

### 10.3 OXS export (`toOXS`, `index.html:2020`)
XML, `UTF-8`. Structure:
```
<chart>
  <format comments01…comments13 (fixed text; "Exported by Stitchwork")/>
  <properties oxsversion="1.0" software="Stitchwork" software_version="1.3"
     chartheight chartwidth charttitle author="" copyright="" instructions=""
     stitchesperinch stitchesperinch_y (= floor(count)) palettecount (= items excl. cloth)/>
  <palette>
    <palette_item index="0" number="cloth" name="cloth" color=fabric … comments="aida" strands="2" symbol="0" …/>
    <palette_item index="n" number name color printcolor blendcolor comments strands symbol="n"
                  dashpattern="" bsstrands bscolor> [<blend number name color strands/>…] </palette_item>
  </palette>
  <fullstitches> <stitch x y palindex/> … </fullstitches>
  <partstitches></partstitches>
  <backstitches> <backstitch x1 y1 x2 y2 palindex objecttype="backstitch" sequence/> … </backstitches>
  <ornaments_inc_knots_and_beads> <object …/> … </ornaments_inc_knots_and_beads>
  <commentboxes></commentboxes>
</chart>
```
Rules:
- Only **used** key entries are exported. Each non-bead key entry = its own palette item (so the same thread at
  2 strands and 1 strand become two items). Bead colours are de-duplicated by bead id.
- Thread: `number`=code, `name`=name + `" (backstitch)"` / `" (half cross)"` suffix, `strands`=n, `comments`="".
- Blend: `number`=codes joined `+`, `name`=`"Blend 1x3713 + 1xEcru"` (+suffix), `color`=mixed hex,
  `blendcolor`=hex of 2nd part, `strands`=sum, `comments`="blend", `<blend>` children per part.
- Combo: `number`=`beadCode+threadCode` (e.g. `00557+310`), `name`=`"00557 + 310"`, `color`=thread,
  `blendcolor`=bead, `strands`=n, `comments`="blend", `<blend>` children: bead (1 strand), thread (n).
- Bead: `number`=code, `name`, `color`, `strands=1`, `comments`=`"bead <series>"`.
- Full crosses → `<stitch>`. Half crosses → `<object objecttype="tent" direction="2">` for ╱, `"1"` for ╲.
  Beads → `<object x1=x+0.5 y1=y+0.5 objecttype=…>` where type is `bead2mm` (Petite Glass), `bead3mm` (Size 8),
  `bead5mm` (Size 6), `bead6mm` (Pebble), else `bead`. Combo beads are **not** emitted as separate objects.
- Attribute values XML-escaped (`& < > "`). Colours upper-case hex without `#`.

---

## 11. Reference photo windows (`index.html:2156-2281`)

Floating, draggable, resizable windows layered over the app (multiple allowed). Opened via **+ Reference**
(file picker) or by image→pattern with "keep as reference".

### 11.1 Window state
`{id, name, src (JPEG data URL, longest side ≤ 1600 px, q=0.86, white background), x, y, w (≥240), h (≥170),
min (minimised), op (opacity 0.3–1), view {s, tx, ty}, tool 'pan'|'marker'|'eraser', color (#16A34A),
size (4|8|14|24|40 px, default 14), grid (bool), showSt (bool), marks (PNG data URL or null)}`.
New windows cascade from the stage's top-right (28 px offset per window).

### 11.2 Window chrome
- Header: drag handle `⠿`, title (double-click → inline rename; Enter commits, Esc cancels), opacity slider,
  minimise `—` (hides toolbar/body), close `✕` (confirm "Close “name”? Its marks will be deleted too." if it has marks).
- Toolbar: Pan, Marker, Eraser, colour, size, Undo mark (≤ 6 levels, image-data snapshots), | Grid overlay,
  Show stitched squares, Fit photo, Clear marks (confirm).
- Resize grip bottom-right. Clicking a window brings it to front. Windows are clamped to the viewport
  (at least 80 px visible horizontally, header inside vertically) on move/resize and on window resize.

### 11.3 Canvas behaviour
- Photo drawn with pan/zoom (`view`); wheel zooms around cursor (scale 0.02–40); right/middle drag or Pan tool pans.
- Marker draws round strokes on a separate full-resolution `marks` canvas (line width = size / scale);
  eraser uses `destination-out`. Marks are displayed at 50 % opacity.
- **Show stitched** shades every cell that has a stitch or bead with `rgba(181,69,47,.38)`, mapping the pattern
  grid onto the whole photo (`cellW = imgW / P.w`, `cellH = imgH / P.h`).
- **Grid overlay**: pattern grid over the photo (minor lines when cells ≥ 4 px on screen, major every 10 and border);
  shows `Column X · Row Y` for the pointer on the photo; and **mirrors the chart hover**: the hovered chart cell is
  outlined in accent with dashed crosshair lines.
- Re-rendered whenever the chart changes or (for grid windows) the hover cell changes.

### 11.4 Persistence
- Any change → debounced 700 ms save to `stitchwork.refs.<P.id>` (+ autosave). On quota failure, warn once:
  "Reference photos are too big to remember in this browser — use Save to file (.json) to keep them".
- Switching project saves the old project's refs, removes all windows, and restores the new project's refs
  (from the loaded file's `refs` if any, else localStorage).
- Included in JSON file exports as `refs`. Not included in the library body or `stitchwork.current`.

---

## 12. Import

### 12.1 Load file (`#fileJson`, accepts `.json,.oxs,.xml`)
Content starting with `<` → OXS import; otherwise JSON `load`. Success toast "Loaded <filename>" (+ OXS report),
failure toast "Couldn’t read that file — it should be a Stitchwork .json or an .oxs". Then autosave.

### 12.2 OXS import (`fromOXS`, `index.html:2061`)
- Requires `<properties>` with positive `chartwidth`/`chartheight`. Title → name (default "Imported pattern").
  `stitchesperinch` → count, coerced to 14 unless one of 11/14/16/18.
- Palette item `index="0"` or `number="cloth"` → fabric colour.
- **Code resolution** (`oxsResolve`): strip prefixes `DMC`, `Mill Hill`, `MH` (with optional `-:#`). Threads: DMC
  lookup case-insensitive, also with leading zeros stripped; aliases `blanc`/`wht` → White. Beads: numeric codes
  zero-padded to 5 digits. Unknown → a new custom colour (brand `Thread`/`Bead`, colour from file or `#999999`).
- Palette item classification:
  - 2 parts (from `<blend>` children or `number` containing `+`) where exactly one is a 5-digit bead code → **combo**.
  - ≥ 2 `<blend>` children → **blend** (strands per part, min 1).
  - otherwise single thread; strands clamped 1–6 (default 2), `bsstrands` for backstitch (default 1).
  - If any `<object objecttype="bead…">` uses this palindex → also resolved as a bead.
- Key entries are created on demand via `keyFor` (re-uses identical entries): per palette item and usage
  (full / half / halfb / back / bead).
- Stitches:
  - `<fullstitches><stitch>` → full cross.
  - `<partstitches><partstitch>` direction 3 → ╱ half, 4 → ╲ half; other directions (quarters) → full cross only
    if cell empty, counted as "simplified".
  - `<object objecttype="bead*">` → bead at `floor(x1), floor(y1)`; `"tent"` → half (direction 1 → ╲, else ╱);
    other objects counted as simplified.
  - `<backstitch>` with objecttype `backstitch` → segment; others/NaN → simplified.
- Report suffix: `"N quarter stitches or ornaments simplified or skipped"`.

### 12.3 Image → pattern (`importDialog` / `convertImage`, `index.html:2120-2154`)
Modal "Turn a picture into a pattern" with live preview canvas (pixelated, scaled ≤ 500×300) and
`W × H stitches · N colours`. Inputs (recompute on change):
- Width (stitches) 10–400, default `min(100, imageWidth)`; height = `round(imgH/imgW × width)`.
- Max colours 2–60, default 20.
- Use: *DMC threads* | *DMC + my blends* (blends already in the current project are candidates).
- Background: *Stitch everything* | *Leave lightest colour unstitched*.
- Checkbox "Keep the photo open as a reference window (with the stitch grid)" (default on).

Algorithm:
1. Draw image scaled to `w×h` (high-quality smoothing).
2. For each pixel with alpha ≥ 128: nearest candidate by ΔE76 in Lab (results cached by 6-bit-per-channel RGB key).
   Transparent pixels stay empty.
3. While distinct colours > K: remove the least-used colour; reassign its pixels to the nearest remaining colour.
4. "Leave lightest": remove the colour with the highest L\*.

On **Create pattern**: a **new project** "Image pattern" (count 14, strands = current `P.strands`, blends copied)
is created; each colour becomes a full-cross thread entry (strands = `P.strands`, `null` for blends).
Toast "Pattern created — N colours". Optionally opens a reference window with the photo and grid enabled.

---

## 13. Messages (user-facing strings)

All toasts/modals listed in the sections above should be kept verbatim; they are part of the UX.

---

## 14. Known quirks / technical debt (do not necessarily preserve)

1. Exports don't download outside the Claude runtime (§9.5).
2. `dirty` flag is tracked but never used (no "unsaved changes" prompt anywhere).
3. Library delete has no confirmation; "New" discards current work without saving.
4. Deleting a key entry or resizing wipes the whole undo history.
5. Reference photos are stored as base64 in localStorage — easily exceeds the ~5 MB quota.
6. Library save limited to 240 000 characters of JSON (designed for the cloud doc limit; applied to local too).
7. `count` uses `14.01`/`16.01` to encode "over 2" fabrics; OXS import cannot restore them.
8. OXS export: combo beads are only represented inside the blend palette item; quarter/three-quarter stitches
   are not supported by the model at all.
9. Unused code: `.tools` CSS, `#beadOptions` datalist, unused locals in `keyPartsFor`.
10. Image import always starts a new project (no "import into current").
11. Symbol availability depends on the device's fonts (probe at start-up) — a file may show symbols another device lacks.
