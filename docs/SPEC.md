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

**Backstitch line styles (new app, 2026-11-14).** A backstitch is a line, so its "symbol" is a **line style**,
not a character. The `sym` of a `back` entry holds `line:<name>`, picked from 20 styles in this order (the first
unused one is auto-assigned; once all 20 are taken they repeat):
solid · dashed · long dash · dotted · dash-dot · dash-dot-dot · long-short · sparse dots · short dash ·
dash-dash-dot · double · thick-thin · ticks · wave · zigzag · scallop · circles · squares · chevrons · crosses.
- The key dialog shows a grid of line samples instead of characters for backstitch ("Line"). Switching the
  entry type between backstitch and anything else swaps the symbol to the other family.
- Files from older versions (and the single-file app) are fixed on load: backstitch entries with a character
  get the next free line style; other entries with a line style get the next free character.
- Places that can only show text (Replace-key list, CSV, check messages) show a short sketch such as `–·–`.
- Patterns repeat per segment and scale with zoom, so a one-cell segment shows at least one repeat.

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

*New app (2026-11-14):* app name **пташечка** with its icon (`src/app/icon.svg`, also the favicon) · pattern
name (`clamp(140px, 13vw, 260px)` wide) · **Menu ▾** (the former File menu) · **main toolbar**, in groups:
undo · redo | override · mirror | draw · eraser · brush size 1–5 | line · rectangle · filled rectangle · fill |
partial · ¼ ¾ ½ | picker · move view | select · magic wand | **Transform ▾** · then, on the right, **i** (hover or
click: every keyboard shortcut, grouped, generated from the keymap) · language (UK/EN) · **side panel** toggle (K).
Brush sizes and partial kinds always stay in place; they are dimmed while the active tool doesn't use them, and
clicking one switches to Draw (sizes) or Partial (kinds). No Save button (saving is automatic, §9.2; ⌘/Ctrl+S and
Menu ▸ Save still save at once) and no Check button (§15.4). The view switch moved to
the zoom control (§4.2). When one row doesn't fit (measured, so it works for every language), the toolbar moves to
its own centred row under the app bar. **Ukrainian is the default language**: `/` opens `/uk`; the browser language
is not used; `/en` is English. The File menu groups everything file-related;
items carry a muted second line saying what they do, and `▸` items open a submenu on hover or click:
- **New ▸** Blank pattern… · From a picture…
- Open saved pattern… · Open file from computer… (.json/.oxs) · **Versions…** (automatic snapshots, §15.7 — no
  longer inside the Open dialog)
- Save (in this browser) · Download pattern file (.json)
- **Export ▸** chart PNG (colour + symbols / symbols only / colour blocks) · Open Cross Stitch (.oxs — opens in
  Хрестики and Ruta Stitch) · shopping list (CSV)
- **Reference pictures ▸** Photo in a floating window… (§11) · Image behind the chart… (§15.15)
- Pattern info…

The separate Export menu and the "Save to file" format dialog are gone (their items are in File ▸ Export).

### 4.2 Stage
- Full-size `<canvas>` with rulers (§5).
- Zoom control (bottom-right): `−`, percentage label (`round(zoom/12*100)%`), `+`, fit `⤢`.
- **Mini toolbar** (only when side panel collapsed): expand button, active-key icon (click = expand),
  pencil, eraser, picker, pan, override, undo, redo. *New app:* removed — the tools are in the header and the
  panel's toggle is a header button.
- *New app:* the zoom control also holds the view switch, stacked: **Colour / Both / Symbols** on top, `−` % `+` `⤢`
  below. Trackpad pinch (Ctrl + small pixel deltas) zooms ~5× faster per delta unit than a mouse wheel notch
  (`exp(-0.012·d)` vs `exp(-0.0025·d)`).
- *New app:* the side panel's width can be dragged at its left edge (280 px … min(720 px, 60 % of the window));
  remembered in this browser; double-click the edge for the default 360 px.

### 4.3 Status bar
`Column X · Row Y` (1-based) of hovered cell, labels of what's in that cell (stitch and bead
`keyLabel`s joined by `  ·  `), fixed hint text (`Space = move · O = override · Esc ends a backstitch line · 1–9 pick key entries · K hides the panel`),
grid size `W×H`, save status (`Patterns save in this browser` / `…to your account` / `Saved HH:MM`).
*New app:* starts with the **active key entry** (icon, code, details) — what the brush paints with, visible even with
the panel hidden. The fixed hint is gone (shortcuts are behind the header's **i**); the underlay edit-mode hint
still appears while editing the image.

### 4.4 Side panel
1. **Tool row**: pencil, line, rect, filled rect, fill, eraser, picker, pan | brush size select (1×1…5×5) | override toggle, mirror toggle | undo, redo | collapse.
   *New app:* the tool row moved to the header (§4.1); brush size is one-click buttons **1 2 3 4 5** (with the
   Partial tool: one-click quarter / three-quarter / petite buttons). The side panel now starts with a
   **Drawing with** card: the tool that will act (icon, name, shortcut key — a held tool such as Alt = picker or
   Space = move shows in accent colour with "while … is held"; drawing tools with a backstitch or knot entry say so),
   its options (brush size, partial kind, override, mirror), and the active key entry (icon, code, details, Edit).
   The entry is dimmed when the tool doesn't use it (picker, eraser, move, select). The panel's collapse button is in
   the card's corner.
2. **Key header**: "Key", count text (`N entries` / `1 entry`), **+ Add to key** button.
3. **Key list** (§7).
4. Collapsible **Fabric & size**: fabric count select (11/14/16/18 ct Aida, 28 ct over 2, 32 ct over 2),
   *new app:* 11/14/16/18 ct Aida and 20/24/31 ct over 1; "28/32 ct over 2" are no longer offered but still shown
   (and kept) for a pattern that already uses them. The same list is in the New dialog and accepted from OXS.
   The side panel scrolls as a whole when its sections don't fit; the key list shrinks first (to 180 px).
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
   - combo: when its symbol is **not** shown (Colour view, or `z < 9`), additionally draw the bead shape at 80 %
     radius (bugles unchanged) on top. When the symbol is shown, no bead is drawn — the symbol appears as-is,
     exactly like a plain cross stitch of the same `st`.
   - Symbol drawn if view ≠ colour, `z ≥ 9`, and **no bead in that cell**:
     full → `ink` colour (or dark in symbols view) at 68 % size; half → dark with white halo, 56 % (combos included).
5. **Bead layer**: bead shape — radial gradient highlight (white → hex → hex darkened 35 %), dark outline
   `max(1, z/14)`, centre hole (for non-bugles, `z ≥ 6`). Symbols view: white fill. Symbol at 50 % if `z ≥ 9`.
6. **Preview** of line/rect shapes at 55 % alpha.
7. **Grid** (if `z ≥ 5`): thin lines (skipping every 10th); then bold 10-line major grid and outer border (always).
8. **Backstitch** segments on top of grid. Colour = entry hex, darkened 45 % if luma > 215 (so white is visible);
   symbols view → `#1d1a16`. Round caps. *(New app, 2026-11-14:)* one-strand width `w1 = max(1.5, 0.105·z)`.
   - **Colour** view: solid line in the entry colour, width `w1 × f(strands)` with
     `f(n) = 1 + 1 + ½ + ¼ + …` (n terms): 1 → 1×, 2 → 2×, 3 → 2.5×, 4 → 2.75×, 5 → 2.875× — the second strand
     doubles the width so 1 vs 2 is obvious; each further strand adds half of what the previous one did.
   - **Symbols** view: the entry's line style (§2.5) in `#1d1a16`, width `w1` (strands are not shown).
   - **Both**: the line style in the entry colour, width by strands.
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
| Eraser (`eraser`) | E | Two modes, chosen by where the press starts. **On a backstitch line** — pointer within `backR = clamp(6 / zoom, 0.2, 0.45)` grid units of a segment (or of its mirror image when Mirror is on): while hovering, those segments are highlighted with a thick translucent accent stroke (`rgba(181,69,47,.5)`, width `max(7, 0.32z)`) and the cell cursor is hidden; press/drag deletes **only backstitch** within `backR` of the pointer — crosses and beads are untouched. **Anywhere else**: clears **both** stitch and bead layers within brush, and also deletes backstitch segments whose distance to the pointer (grid units) ≤ `0.3 × max(1, brush/2)`. Either way one stroke = one undo step. |
| Picker (`picker`) | I, or hold Alt/⌥ | Selects the entry under the pointer: backstitch within 0.25 units (topmost/last) wins, then bead, then stitch. Toast "Picked …" or "Nothing here to pick". |
| Pan (`pan`) | H / hold Space | Drag to pan. |

- Selecting a key entry while on eraser/picker/pan switches to pencil (except during a held-Alt pick).
- **Hold Alt/⌥ = temporary picker**: Alt keydown (not auto-repeat-sensitive) switches to the picker and remembers
  the previous tool; the tool stays picker while Alt is held, so several picks are possible. On Alt keyup or
  window blur the previous tool returns — or pencil, if something was picked while the previous tool was
  eraser or pan. An Alt+left-click on the canvas always picks, even if the keydown was missed.
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
`Esc` (end chain) · hold `Alt/⌥` (temporary picker) · `K` (toggle side panel) · `O` (override) · `1`–`9` (select the n-th non-null key entry) ·
`P`/`B` pencil · `L` line · `R` rect · `Shift+R` filled rect · `F` fill · `E` eraser · `I` picker · `H` pan ·
`+`/`=` zoom in · `-` zoom out · `0` fit. Window blur releases Space.

---

## 7. Key panel

### 7.1 Key list (`renderKey`, `index.html:1730`)
One row per non-null `P.pal` entry in index order:
- Key icon (canvas, 30 px) rendered in the current view mode: a stitch/bead/backstitch sample with symbol.
  *(New app:)* the backstitch icon is a diagonal line drawn exactly like on the chart (§5 step 8): solid and
  strand-sized in Colour view, the line style in Symbols view, no character.
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
| `stitchwork.refs.<projectId>` | **Legacy / fallback only** — see IndexedDB below. |

**IndexedDB** database `stitchwork` (v1), object store `refs`, key = project id, value = array of serialized
reference windows (§11.4). Used because photos + marks quickly exceed localStorage's ~5 MB.

All storage access is wrapped in try/catch; quota failures are silent except where noted.

**Flush on leave**: on `pagehide` and when the page becomes hidden, the current project is written to
`stitchwork.current` immediately and any pending reference-window save is written, so a refresh right after an
edit loses nothing.

### 9.2 Boot
1. Try to load `stitchwork.current`. 
2. Otherwise create a 60×60 project and seed the **demo** (`seedDemo`, `index.html:2290`): a heart of DMC 321
   (2 str) with DMC 498 (3 str) outline, a blend row (3713 + Ecru), a half-cross row (DMC 310, 1 str),
   three combo cells (DMC 3371 + MH 00557, half), four MH 02011 beads, a backstitch box (DMC 3371, 1 str),
   and an unused DMC 3865 entry.
3. Set up canvas observer, fit, select pencil.

*New app — automatic saving (2026-11-14):* the open pattern is written as a draft 0.6 s after each change (as
before), and **into the saved-patterns library at most once a minute** while it has unsaved changes, plus right away
when the page is hidden. A pattern that was just opened from the library, a restored draft and the demo are not
re-saved until they are edited. The status bar shows `Saved HH:MM` after each library save. Manual Save (⌘/Ctrl+S,
File ▸ Save) still saves at once, with a toast.

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

Outside the Claude runtime (`downloads` is `null`) exports use a standard browser download (`downloadFile`):
a `Blob` with the right MIME type (`application/json`, `application/xml`, `text/csv;charset=utf-8` with a UTF-8
BOM so Excel shows symbols correctly, `image/png`) and a temporary `<a download>`; toast "Downloaded <filename>".
Only if that throws does the old fallback modal appear ("Downloads aren’t available here…" with textarea + Copy,
or for PNG "right-click the image to save it").

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
- Any change → debounced 700 ms save to IndexedDB `refs[P.id]` (+ autosave); an empty list deletes the record.
  If IndexedDB fails, falls back to localStorage `stitchwork.refs.<P.id>`; if that fails too, warn once:
  "Reference photos are too big to remember in this browser — use Save to file (.json) to keep them".
  After a successful IndexedDB write the legacy localStorage key is removed (one-time migration).
- Switching project saves pending refs, removes all windows, and restores the new project's refs (from the
  loaded file's `refs` if any, else IndexedDB, else legacy localStorage). Restoring is async; until it finishes
  saving is disabled (`refsReady`) so an empty window list can never overwrite stored refs, and a stale restore
  is discarded if another project was opened meanwhile.
- Saved marks are drawn back in asynchronously; until they are (`marksReady`), serialization re-uses the stored
  marks data URL instead of reading the still-empty canvas (this used to wipe marks on refresh).
- Included in JSON file exports as `refs`. Not included in the library body or `stitchwork.current`.

---

## 12. Import

### 12.1 Load file (`#fileJson`, accepts `.json,.oxs,.xml`) — `loadPatternFile`
A leading UTF-8 BOM is stripped. Content starting with `<` → OXS import; otherwise JSON `load`. Success toast
"Loaded <filename>" (+ OXS report), failure toast "Couldn’t read that file — it should be a Stitchwork .json or
an .oxs". Then autosave.

**Drag & drop** anywhere on the window: while files are dragged over, a full-window dashed overlay reads
"Drop a .json or .oxs pattern, or a picture". On drop:
- a pattern file (`.json/.oxs/.xml` extension or json/xml MIME) → `loadPatternFile` (takes priority if several files);
- else an image → modal "What should this picture be?" with *Cancel*, *Open as reference* (reference window, §11)
  and *Turn into pattern* (image → pattern dialog, §12.3);
- else toast "Drop a .json or .oxs pattern, or a picture".

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

1. ~~Exports don't download outside the Claude runtime~~ — fixed 2026-11-14 (§9.5).
2. `dirty` flag is tracked but never used (no "unsaved changes" prompt anywhere).
3. Library delete has no confirmation; "New" discards current work without saving.
4. Deleting a key entry or resizing wipes the whole undo history.
5. ~~Reference photos stored in localStorage (quota) and marks wiped on refresh~~ — fixed 2026-11-14: IndexedDB +
   marks-overwrite guard (§11.4). Photos are still base64 data URLs; Blobs would be ~25 % smaller.
6. Library save limited to 240 000 characters of JSON (designed for the cloud doc limit; applied to local too).
7. `count` uses `14.01`/`16.01` to encode "over 2" fabrics; OXS import cannot restore them.
8. OXS export: combo beads are only represented inside the blend palette item; quarter/three-quarter stitches
   are not supported by the model at all.
9. Unused code: `.tools` CSS, `#beadOptions` datalist, unused locals in `keyPartsFor`.
10. Image import always starts a new project (no "import into current").
11. Symbol availability depends on the device's fonts (probe at start-up) — a file may show symbols another device lacks.
12. Mirror drawing paints the **same key index** on the mirrored side (`index.html:1582`), so a ╱ half cross is
    mirrored as ╱. **Intended** (decided 2026-11-14): mirroring reuses the existing entry and symbol (see §15.3).

---

## 15. Feature backlog — candidates to pick from

> Brainstormed 2026-11-14 with **e-pattern mappers** in mind: people who turn paper charts into faithful digital
> copies. **Nothing in this section is implemented.** Each feature has a short behaviour sketch, its effect on
> stored data, and what it depends on.
>
> Constraints for everything below: plain JS in the browser, no server, **no AI / ML**.

### 15.0 Ranking

Ranked from easiest, no-persistence and most wanted (top) to hardest and needing persistence (bottom).
Effort is relative: **S** small · **M** medium · **L** large.

| #  | Feature                                              | Effort      | Persistence impact                 | Depends on |
|----|------------------------------------------------------|-------------|------------------------------------|------------|
| 1  | Pattern metadata (§15.1) — **priority one**          | S           | optional fields in JSON v4         | —          |
| 2  | Grid numbering + Go to cell (§15.2)                  | S           | one small field                    | —          |
| 3  | Whole-chart transforms & mirror modes (§15.3)        | S–M         | none                               | —          |
| 4  | Error detectors (§15.4) — **removed, to be redesigned** | M      | none                               | —          |
| 5  | Mark cell as ambiguous (§15.5)                       | S–M         | sparse list in JSON v4             | —          |
| 6  | Selection, copy/paste, move, flip/rotate (§15.6)     | M–L         | none (in-memory clipboard)         | reuses #3's transform code |
| 7  | Automatic snapshots / minimal versioning (§15.7)     | M           | new IndexedDB store                | —          |
| 8  | Multi-brand threads (§15.8)                          | M code, L data | new `src` id namespaces         | —          |
| 9  | Scan calibration in reference windows (§15.9)        | M–L         | `calib` field on reference windows | —          |
| 10 | PDF chart export, Pattern Keeper–compatible (§15.10) | L           | none                               | #1, #2     |
| 11 | Symbol matching — semi-automatic mapping (§15.11)    | L           | templates stored with ref windows  | #9         |
| —  | Chart underlay behind the stitches (§15.15) — **done** | M         | new IndexedDB store, `underlay` in .json | —   |
| —  | 3-point grid alignment for the underlay (§15.15) — **done** | S     | none                               | §15.15     |
| —  | Stitch highlighting (§15.16) — **done**              | S           | none                               | —          |

**High priority — the design must be agreed before implementation** (paper charts use these all the time, and a
faithful copy is impossible without them):

| Feature                                                    | Effort | Persistence impact               | Status |
|------------------------------------------------------------|--------|----------------------------------|--------|
| Fractional stitches: quarter, three-quarter, petite (§15.13) | M–L  | new sparse layer, JSON v4        | open questions |
| French knots (§15.14)                                      | M      | new point list, new key type     | open questions |

**Shared groundwork**
- **Format v4.** #1, #2, #5 and #8 add optional fields or id namespaces. `load` keeps accepting v1–v3, missing
  fields get defaults, and `serialize` always writes v4. Older app versions ignore unknown fields.
- **Transform helpers.** #3, #6 and the near-symmetry check in #4 share the same code to remap cells, swap
  half-cross direction and transform backstitch coordinates.
- **Undo snapshots.** They must store `w`/`h` (and `amb`, §15.5) so that whole-chart operations that change
  the size can be undone instead of wiping history.

### 15.1 Pattern metadata — priority one
- `P.meta` holds optional strings: `designer`, `publisher`, `source` (book / magazine / leaflet title),
  `sourceYear`, `sourceRef` (issue, page, chart number), `copyright`, `notes` (e.g. "mapped with permission"),
  `instructions` (multi-line), `mappedBy`, `mappedDate`.
- UI: a **Pattern info…** button next to the pattern name opens a form modal. Empty fields are fine.
- Where it shows up:
  - JSON (`meta`).
  - OXS: `author` = designer, plus `copyright` and `instructions` (all currently written as `""`, §10.3).
    OXS import reads them back.
  - PNG chart: a second heading line, `Designer · © …`.
  - CSV: a "Pattern info" block **appended at the end**, so the first row stays a clean header.
  - PDF cover page (§15.10).
  - **Open** list: the designer is shown under the name.

### 15.2 Grid numbering + Go to cell
- `P.grid = { x0: 1, y0: 1, label: 10 }` sets the number of the first column and row, and the ruler label
  interval (10 or 5). An option **Number from centre** labels the centre cell `0` and counts outwards, which some
  publishers do.
- Major grid lines stay 10 cells apart and **align with the numbering**.
- Used in the rulers, the status bar, the PNG/PDF exports, and the reference-window grid read-out.
- **Go to cell** (Ctrl/⌘+G): type `col, row` in the paper's numbering. The chart centres on that cell and
  flashes it.

### 15.3 Whole-chart transforms & mirror modes
A **Transform ▾** menu (or a section in Fabric & size) with:
- **Flip horizontal** and **Flip vertical**.
- **Rotate** 90° clockwise, 90° counter-clockwise, 180°. A 90° rotation swaps `w`/`h`.
- **Mirror from centre**: copy left → right half, right → left, top → bottom, bottom → top, or top-left quarter →
  all four. With an odd size, the centre column/row is kept. Confirm first if the target half already has stitches.
- **Crop to content** (bounding box of all layers plus a margin) and **Extend canvas** (add N cells on each side
  separately, which Resize can't do).
- Each operation is **one undo step** and doesn't clear history.

Rules:
- **Half-cross direction — flips and rotations.** Direction is stored on the key entry (`st`), not on the cell. A
  **Flip** or a 90° **Rotate** turns ╱ into ╲, so the cell is re-pointed to a key entry with the same colour and
  strands and the opposite direction (`sameKey`). If none exists, one is created with the next free symbol, and a
  toast reports "N new key entries for mirrored half crosses". 180° keeps the direction.
- **Half-cross direction — mirroring.** **Mirror from centre** and **mirror drawing** do *not* change direction:
  the mirrored cell gets the **same key entry** (same direction, same symbol), and no key entries are created.
  Only positions are mirrored (cells, backstitch and knot points, partial-stitch corners).
- **Backstitch.** Coordinates are transformed (e.g. `x → w − x`). Beads and ambiguous marks (§15.5) move with
  their cells.
- **Mirror drawing mode.** The mirror button cycles: off → ↔ (vertical axis, current behaviour) → ↕ (horizontal
  axis) → 4-way. The guides are drawn for each active axis. Mirrored half crosses keep the same entry and
  direction (rule above; quirk §14.12 is the intended behaviour).

### 15.4 Error detectors

> **Removed 2026-11-14 — to be redesigned from scratch.** The first implementation (below) was taken out of the
> new app, including its header button. The text below is kept as
> history, not as the plan.

A **Check chart…** panel that runs on demand, never continuously. Findings appear in a list. Prev/Next steps
through them; the canvas centres on the finding and draws a ring around it. **Ignore** hides a finding for the
session; ignores are not persisted.

- **Isolated stitches** (typos): a stitch-layer cell whose 8 neighbours contain no cell with the same key
  index. Options:
  - cluster size threshold (default 1, allow ≤ 2)
  - count "same colour, other strands/stitch" as a neighbour (on)
  - include beads (off — beads are often single on purpose)
  - include half crosses (on)
- **Near symmetry**: test vertical and horizontal axes at whole and half-cell positions near the centre (±5 cells).
  For each axis, compare mirrored cell pairs where at least one side has a stitch (a pair matches when both cells
  hold the same entry — half crosses keep their direction when mirrored, §15.3). If the match ratio is ≥ 90 % but
  below 100 %, report the axis and list the mismatched pairs. Show the
  value from the majority-consistent side as the suggested fix. Beads and backstitch are optional. Clearly
  asymmetric designs report nothing.
- **Cheap extras**: unused key entries; entries used ≤ 3 times; duplicate keys (§3.2 `sameKey`).
- Cost: linear in cells × candidate axes, so instant even at 500×500.

### 15.5 Mark cell as ambiguous
Hard requirement: **no footprint when unused**. There is no toolbar button, no panel, no prompt, and no change to
any existing behaviour.
- `A` toggles the mark on the hovered cell. There is no free-text note in v1 — just the flag.
- Display: a small accent corner triangle in the cell's top-right, drawn at `z ≥ 6`. Marks never affect painting,
  fill, the picker, counts or totals, and the mark stays when the cell is painted (the mapper may paint a best
  guess and come back later).
- Status bar: `⚑ N ambiguous` appears **only when N > 0**. Clicking it (or `Shift+A`) jumps to the next mark.
  Hovering a marked cell adds "marked ambiguous" to the cell labels. **Clear all marks** is in a small popover on
  that status item.
- Data: `P.amb` = sorted array of cell indices. It is in JSON v4 and in undo snapshots, and is remapped by resize,
  transforms and selection moves. It is **never** exported to PNG, PDF, OXS or CSV.

### 15.6 Selection, copy/paste, move, flip/rotate
**Making a selection**
- **Select** tool (`S`): drag a marquee; Shift+drag adds to the selection.
- **Magic wand** (`W`): click to select contiguous cells of the same key; Shift+click selects every cell of that
  key.
- Ctrl/⌘+A selects all; Esc or Ctrl/⌘+D deselects.
- The selection is a cell mask drawn with marching ants. It carries stitches, beads, ambiguous marks, and
  backstitch segments whose both endpoints lie inside the selection's outline.

**Operations**
- Delete/Backspace clears the selection.
- Ctrl/⌘+C / X / V copy, cut and paste.
- Drag inside the selection to move it. Arrow keys nudge it 1 cell (Shift = 10).
- Flip H/V and rotate 90° within the selection, using the §15.3 rules.
- **Replace key…** (X → Y) and **Crop to selection**.

**Floating content** (paste or move)
- It follows the pointer or arrow keys. Enter or click commits; Esc cancels.
- It respects **Override** (§6.2): with override off, only empty cells take paint.
- Each commit is one undo step. Mirror drawing mode does not apply.

**Clipboard**
- In memory, and kept across project switches. Pasting into another project maps key entries with `sameKey` and
  appends missing ones, including their blends, combos and customs.
- Optional: also put a JSON copy on the system clipboard for pasting across tabs.

### 15.7 Automatic snapshots — minimal versioning
- Storage: IndexedDB `stitchwork` v2 gets a new store `snaps`, keyed `[projectId, time]`. The value is
  `{time, reason, w, h, data (serialize string, no refs), thumb (small PNG)}`.
- **When**:
  - every 5 minutes while edits are happening (only if something changed since the last snapshot)
  - **before destructive operations**: deleting a key entry, resize, transforms, mirror from centre, key brand
    conversion (§15.8), and anything that replaces the current project (Open, New, file/OXS import, image →
    pattern)
- **Retention**: keep the last 10, then one per hour for 24 h, then one per day for 14 days. Cap at about 50 per
  project. When the quota is hit, drop the oldest.
- **UI**: a **History…** entry in the Open dialog lists `time · reason · W×H` with thumbnails. **Restore** first
  snapshots the current state, then loads the chosen one (same project id).
- This softens quirks §14.3 and §14.4: lost undo history and "New" without saving become recoverable.

### 15.8 Multi-brand threads
- **Brands**: DMC (existing) plus Anchor, Cosmo, Madeira, and vintage lines common on old paper charts (e.g. J&P
  Coats). Also a table of **discontinued / renumbered DMC** codes with their replacements.
- **Data per brand**: a `code|name|HEX` table like `DMC_RAW`, plus a conversion table `code → DMC code` taken from
  published manufacturer charts. **Collecting and checking this data is most of the work.** Conversion charts are
  approximations by nature, and the data's licensing needs checking.
- **Ids**: `anchor:403`, `cosmo:…` and so on, resolved like `dmc:`. Old files are unaffected. Blend parts may mix
  brands.
- **Pick list**: a brand selector. A search for `403` with "All brands" lists hits across brands with a brand tag.
  Discontinued DMC codes are flagged "discontinued — use 3xxx".
- **Key display**: "Show equivalents as: none | DMC | Anchor | …" adds a secondary line such as `≈ DMC 310`. It
  uses the official table first, and falls back to the nearest colour by ΔE76, labelled "≈ by colour".
- **Convert key to brand…** replaces every `src` with its equivalent and keeps symbols and chart. A snapshot is
  taken first (§15.7).
- **Shopping list**: grouped by brand, with skein length from a per-brand table.
- **OXS**: export prefixes the name with the brand for non-DMC threads. Import (`oxsResolve`) learns the prefixes
  `Anchor`, `ANC`, `Cosmo`, `Madeira`.

### 15.9 Scan calibration in reference windows
Decision: calibration lives in the floating **reference windows**. A scan underlay inside the chart canvas is
rejected (§15.12).
- **Calibrate** button in the reference-window toolbar:
  1. Click two printed grid corners on the scan, then type which chart cells they are (defaults: top-left of
     col 1 / row 1 and bottom-right of the last cell). Add a 3rd and 4th corner for rotated or photographed pages.
  2. Optional **snap to grid lines**: refine each click to the nearest grid-line crossing found from
     dark-pixel row/column profiles (classic image processing, no ML).
- **Model**: 2 points give scale + translate; 3 give affine (rotation and skew); 4 give a homography
  (perspective, solved as a small 8×8 linear system). Stored on the window as
  `calib: {pts: [{ix, iy, col, row}…], H: [9 numbers]}`.
- **When a window is calibrated**:
  - Grid overlay, Show stitched and the hover crosshair use this mapping and cover only the calibrated region
    (that page), not the whole photo as today.
  - Hovering the chart highlights the cell in every window that covers it. Hovering the scan highlights the chart
    cell and shows `Column X · Row Y` in the paper's numbering (§15.2).
  - Ctrl/⌘+click on the scan centres the chart on that cell.
  - A **Follow** toggle pans the window so it shows the region the chart is showing.
- **Multi-page paper charts**: one reference window per page, each calibrated to its own region (e.g. page 2 =
  columns 61–120). Overlap rows simply appear in two windows.
- Optional proofing aid: **Overlay my symbols** draws the chart's symbols at 50 % over the calibrated scan, inside
  the reference window only.

### 15.10 PDF chart export — Pattern Keeper–compatible
Target: a multi-page PDF chart like the ones made by desktop charting software (Pattern Maker, WinStitch /
MacStitch), which stitchers import into **Pattern Keeper** or **Markup R-XP**. This is *not* Pattern Maker's
native `.xsd` (§15.12).

**Contents**
- **Cover**: name, metadata (§15.1), colour preview, finished size, fabric.
- **Key page(s)**: symbol, brand + code, name, strands, stitch type, count, skeins.
- **Page map**: an overview with the page rectangles labelled.
- **Chart pages**: symbols (optionally colour + symbols), backstitch as vector lines, grid numbering (§15.2),
  centre arrows, and 0–3 shaded overlap rows/columns shared with neighbouring pages.

**Settings**: A4 / Letter, orientation, cell size (which sets cells per page), colour or black and white, overlap.

**Pattern Keeper rules** (not publicly specified — **verify by importing test files into Pattern Keeper**):
- Chart symbols are real text from an embedded font: one glyph per cell, not images or outlines.
- The key uses the same glyphs.
- Grid lines are vector lines.
- Each page has one chart region.

**Open decisions — this is the hard part**
- Write a minimal PDF generator (objects, content streams, TrueType embedding with subsetting), or vendor a
  library such as jsPDF. A library would be the app's first runtime dependency.
- A single known font must contain every chart symbol. Today's symbols come from DM Sans plus whatever fonts the
  device has (§2.5, quirk §14.11). PDF export probably needs a bundled symbol font, with PDF symbols limited to
  its glyphs.

### 15.11 Symbol matching — semi-automatic mapping (JS only, no AI)
Feasible with classic **template matching**: plain pixel arithmetic in a Web Worker, no models.
Prerequisite: §15.9 calibration.

**Algorithm**
1. Through the calibration mapping, resample each chart cell of the calibrated region from the scan into a fixed
   grayscale patch (e.g. 16×16). Use the inner ~80 % of the cell so grid lines are excluded.
2. Normalise each patch (subtract the mean, divide by the standard deviation). This makes matching robust to
   faded or uneven scans.
3. **Teach**: click a scan cell and choose a key entry ("this ▲ is DMC 310"). 1–3 samples per symbol, plus an
   "empty" class taught from blank cells.
4. Score each patch against every template with normalised cross-correlation, allowing a ±1–2 px shift. Keep the
   best score and its margin over the second best.
5. Classify: **confident** if score ≥ t₁ and margin ≥ t₂; otherwise **needs review**.
6. Cost ≈ cells × templates × shifts × patch pixels. For example, 10 000 × 40 × 9 × 256 ≈ 10⁹ simple operations:
   seconds in a worker.

**UI**
- Proposals appear as a **ghost layer** on the chart; nothing is committed yet.
- **Accept confident (N)** commits them as one undo step and respects Override (by default only empty cells).
- A **review queue** steps through the uncertain cells, showing the zoomed scan patch and the top 3 suggestions.
  Digit keys pick one; `A` marks the cell ambiguous (§15.5).
- Templates are saved with the reference window (`tpl`), so a session can be resumed.

**Limits**
- Works well on printed symbol charts.
- Weak on handwritten, heavily faded or blurred scans, and on cells split by half or quarter stitches.
- Colour-block charts are handled by an easy add-on classifier that uses the mean cell colour instead of the
  symbol shape.

### 15.12 Parked / rejected / not yet discussed
- ~~**Rejected**: a scan underlay inside the chart canvas (tried in another tool, poor UX).~~ **Reversed
  2026-11-14** — specified and implemented as §15.15, with an explicit edit mode to address the UX problems.
  Reference windows (§11, §15.9) stay.
- **Rejected**: AI / ML-based features.
- **Parked**: exporting Pattern Maker `.xsd`. The format is proprietary, binary and undocumented.
- **Not yet discussed** (from the first brainstorm):
  - keyboard data-entry mode (cursor + type a key, run-length entry)
  - long stitches, lazy daisies and other specialty stitches. Quarter / three-quarter / petite stitches and
    French knots have moved to §15.13–15.14.
  - custom drawn or uploaded symbol glyphs to match the paper
  - proofread tracking ("mark region as proofed")
  - two-screen pop-out window

### 15.13 Fractional stitches — quarter, three-quarter, petite (DRAFT — to be discussed)
Goal: several partial stitches can share **one cell**, so a mapper can reproduce exactly what the paper chart
shows. The commonest case is a cell split along its diagonal into two colours, which smooths curves and edges.

**Terminology** (please confirm it matches how you think about them)

| Stitch        | Thread path                                        | Typical chart drawing                  |
|---------------|----------------------------------------------------|----------------------------------------|
| Quarter       | one leg from a corner to the cell centre           | small triangle / corner of the cell    |
| Three-quarter | a half-cross diagonal + a quarter leg from the other corner | large triangle (half the cell) |
| Petite        | a tiny full cross in one quadrant (over 1 thread of evenweave) | small square in a quadrant  |

Combinations that must fit into one cell:
- up to 4 quarters or petites, one per corner, in different colours
- two three-quarters in different colours, split along the same diagonal
- one three-quarter + one quarter in the free corner
- a half cross + a quarter

**Proposed data model (recommendation, open to change).** Store *stitches*, not areas:
- A sparse layer `P.part`: `Map<cellIndex, [{kind:'q'|'t'|'p', c:0..3, k}]>`, where `c` is the corner
  (TL, TR, BR, BL) and `k` is the key index.
- A three-quarter is identified by the corner of its short leg. Its long leg is the diagonal that does not touch
  that corner, so nothing more needs storing.
- Why this model: it maps 1:1 to OXS `<partstitch>` (both directions), to thread usage (quarter ≈ 0.25 of a full
  cross, three-quarter ≈ 0.75, petite ≈ 0.5) and to Pattern Keeper's fractional stitches. A grid of 4 squares or
  4 triangles per cell can't represent both the diagonal split and corner quarters cleanly.
- Sparse because fractional stitches are rare compared with full crosses. JSON v4 field: `part: [[i, kind, c, k], …]`.

**Open questions**

1. **Key entries.** Today, stitch type lives on the key entry (`st`), so a ╱ half cross of DMC 310 is a separate
   entry with its own symbol. Paper charts normally draw a three-quarter or quarter with **the same symbol as the
   colour's full cross**, inside a triangle. Proposal: fractional stitches use the colour's existing cross entry,
   and the kind is stored per cell.
   - Do you agree?
   - Should half crosses then stay as they are (separate entries)?
2. **Which kinds in v1?** Quarter + three-quarter only, or petite too? Petite matters mostly on evenweave or linen.
3. **Placement.** Proposal: a **Partial** tool (or a modifier on the pencil). The pointer's nearest corner chooses
   `c`. A toggle or key cycles Quarter → Three-quarter → Petite, and there is a live preview of the triangle or
   square under the pointer. Drag paints along cells, with no brush size. Is that the feel you want, or should
   the kind belong to the key entry?
4. **Coexistence with full and half crosses.** Proposal: a cell holds **either** a full or half cross **or**
   partials, except that a half cross + quarter is allowed. With override off, partials only go into free corners;
   with override on, they replace what is there. Beads can sit on top as today.
5. **Erase / pick / fill.** Proposal: the eraser removes the partial under the pointer's corner (brush > 1 clears
   whole cells), the picker selects its entry, and fill ignores partials.
6. **Rendering.**
   - Colour view: filled triangle or square.
   - Symbol view: a smaller symbol (~45 %) inside the triangle or corner, with a thin diagonal line showing the
     split.
   - Exports: PNG and PDF as on screen.
   - Does that match the paper charts you map?
7. **Counting.** Proposal: totals show separate quarter, three-quarter and petite counts, and the per-entry usage
   count shows full and partial counts separately (e.g. `120 + 14¾`).
8. **Transforms (§15.3).** Flips and rotations remap corners: a horizontal flip swaps TL ↔ TR and BL ↔ BR.
   Nothing ambiguous here.
9. **OXS.**
   - Export `<partstitch>` with directions for quarters and three-quarters, and `palindex1`/`palindex2` for split
     cells.
   - Import maps them back. Today they are "simplified" (§12.2), which fixes part of quirk §14.8.
   - Petite has no clear OXS form; this needs checking against real files.

### 15.14 French knots (DRAFT — to be discussed)
- **Key type** `'knot'`: `src` (thread or blend), `n` strands, `sym`. An optional `wraps` value (1–3) is shown in
  the subtitle, e.g. `DMC 310 / Black · 2 strands · French knot, 2 wraps`.
- **Position**: points snapped to the **half grid**, exactly like backstitch endpoints. That gives cell corners,
  edge midpoints and cell centres, which covers how charts place knots. Stored as
  `P.knots: [[x, y, k], …]` (JSON v4 `knots`).
- **Tools**:
  - Pencil places a knot; dragging places one per half-unit passed, and the same point is never placed twice.
  - The eraser removes knots within its radius. The picker picks knots first, together with backstitch.
  - Mirror drawing and transforms move knots like backstitch points.
  - Override off: no second knot on the same point.
- **Rendering**: drawn above stitches and backstitch as a filled circle (r ≈ 0.2 cell) with a dark outline and a
  small highlight. In symbol view: a black dot, or the entry's symbol at small size if it has one (see question 1).
- **Totals**: a knot count, and thread usage ≈ a fixed allowance per knot × strands.
- **Exports**:
  - OXS `<object objecttype="knot" x1 y1 palindex>`. Import maps knot objects, which today are "simplified".
  - PNG and PDF draw them; the key lists them.

**Open questions**
1. Charts often show knots as **plain coloured dots without symbols**. Should knot entries have symbols at all,
   or should the key identify them by dot colour plus code?
2. Is half-grid placement enough, or do you need free placement (any position)?
3. Should beads get the same point-based placement option? Charts sometimes place beads on intersections.
4. Should long stitches and lazy daisies be designed together with knots, since they are also point- or
   segment-based "specialty" stitches?

### 15.15 Chart underlay — a reference image behind the stitches (implemented 2026-11-14)
Goal: put a scan or photo of the paper chart **on the chart canvas itself**, line it up with the grid, then stitch
over it. One underlay per pattern.

**Two modes**, switched by the **Behind stitches** toggle (or `U`):
- **Edit mode** (toggle off) — for placing the image. The image is drawn **above** the stitches at its opacity, with
  a dashed outline and 8 handles (corners and edge midpoints). Chart tools are paused: the pointer edits the image.
  The rest of the image outside the chart is still visible, so it can be dragged in from anywhere.
- **Behind mode** (toggle on) — for stitching. The image is drawn **under** the stitches (after the fabric, before
  crosses, partial stitches, beads, grid, backstitch and knots), clipped to the chart. It cannot be touched; every
  tool works as usual.
- A newly added underlay starts in edit mode. `Esc` in edit mode switches to behind mode.

**Editing** (edit mode). Two sub-tools: **Move & resize** (default) and **Crop**.
- Drag inside the image: move it. Arrow keys move by 0.1 cell, Shift+arrows by 1 cell.
- Move & resize, corner handles: resize from the opposite corner, **keeping the aspect ratio**; hold Shift to resize
  freely. Edge handles: stretch one side (free).
- Crop, any handle: trims that side of the image. The visible part keeps its position and scale — only the edge
  moves. A crop can never go past the image's own edges, and nothing gets smaller than 1 cell.
- Precise values in the side panel: X, Y, width, height of the visible part in cells (decimals allowed).
- **Fit to chart**: scale the visible part to fit the chart, keep aspect, centre it.
- **Reset crop**: show the whole image again at the current scale.

**Alignment pad** (always available while the image is shown, in both modes, at any zoom): a small floating panel
on the stage (bottom-left, draggable by its grip, can be folded to its title). Buttons, each one click:
- **Move** ← ↑ ↓ → by the step.
- **Width − +**, **Height − +**: change that side by the step; **Both − +**: change the width by the step and the
  height in proportion (aspect kept).
- **Step**: 0.1 · 0.5 · 2 cells (default 0.5; remembered in this browser).
- Resizing keeps the **middle of the screen** fixed (the grid point at the centre of the visible chart area), so the
  area being aligned stays put while the far parts move. Typical use with a scan that is slightly off: zoom into a
  10×10 block, click Width/Height until it lines up, scroll to the next block — no mode switching or zooming out.
- **Edit / Done** button in the pad's title switches between edit and behind mode (same as `U`).

**3-point grid alignment** (idea from Pattern Maker v4's "Tracing an Existing Chart"). Button **Align to grid
(3 points)…** in the pad and the side panel; works in either mode.
1. The pad switches to three numbered steps; the image is drawn on top of the stitches (at least 85 % opacity, no
   handles) and the pointer is a crosshair. Every chart tool is paused; zoom and pan (wheel, Space, middle/right
   drag) still work.
2. Click the **top-left**, **top-right** and **bottom-right** corners of one square on the scanned chart's grid
   (best: a big square on the bold 10-lines). Each click shows a numbered crosshair, joined by a dashed line.
   **Back** / Backspace removes the last point; **Cancel** / Esc leaves without changes.
3. After the third click the pad asks **Square size (cells)**, prefilled with the size the square has on the chart
   right now (rounded). **Align** places the image so that point 1 sits on the nearest chart grid intersection and
   the square is exactly that many cells wide and tall (width from points 1→2/3, height from 1/2→3 — the two
   clicks on a shared line are averaged). Clicks not going right-then-down are refused with a toast.
- Rotation is not corrected (the image stays axis-aligned); Pattern Maker's version also straightens a slightly
  rotated scan. Fine-tuning afterwards is the pad's job.

**Side panel section "Image behind the chart"** (only when one exists): Behind stitches toggle, Show/hide, opacity slider
(10–100 %, default 50 %), Move & resize / Crop (edit mode only), X / Y / W / H fields, Fit to chart, Reset crop,
Replace image…, Remove.

**Adding**: File ▸ Reference pictures ▸ **Image behind the chart…**, or drop a picture and choose **Put behind the chart**. The image is
downscaled to at most 3000 px on its longest side (JPEG, quality 0.9) and fitted to the chart. Replacing keeps the
placement (rect) and resets the crop to the whole new image.

**Not part of the chart**
- Never exported to PNG, PDF, OXS or CSV; never counted; not part of undo/redo or snapshots.
- Not affected by resize or transforms (it is reference material; re-fit it if needed).
- Shown in all three chart views.

**Data**: `{ src, crop: {x, y, w, h} (image px), rect: {x, y, w, h} (grid units), opacity, behind, visible,
tool }`.
- Saved per pattern in the browser like reference windows (IndexedDB, own store), debounced, flushed on page hide.
- Included in Stitchwork `.json` files as `underlay` (with `src`), next to `refs`.
- Not in the draft (`stitchwork.current`) or the library — they stay small.

---

### 15.16 Stitch highlighting (implemented 2026-11-14)
Idea from Pattern Maker v4 (Professional). Toggle with the eye button in the key panel's header or **V**.
- While on, the **active key entry** is drawn at full strength and everything else (crosses, partial stitches,
  beads, backstitch, knots) at 15 % opacity; fabric, grid, underlay and overlays are unchanged. Picking another
  entry moves the highlight. With no active entry, nothing is faded.
- View-only: not saved, not in exports or undo.

## 16. Future phase — Stash management: floss, beads, fabric (IDEA)

> Added 2026-11-14. **Not to be started until the app has a real database and login** (user accounts with
> server-side storage). This is a whole new layer of the app, not a feature of the chart editor.
> Builds on: multi-brand threads (§15.8) and the totals / shopping list (§7.2).

### 16.1 Why
Today the shopping list (§7.2) lists everything the pattern needs, as if the stitcher owned nothing. Real stitchers
and mappers have large stashes. The useful answer is **"what do I still need to buy?"**, which is pattern needs
minus what is in the stash.

### 16.2 Inventory (per user)
- **Floss**: brand + code (any brand from §15.8, or a custom thread), quantity in whole skeins, plus a
  partial-skein amount (see question 1). Optional storage location (box, bobbin card #) and notes.
- **Beads**: Mill Hill code (or custom), quantity as packets, plus an optional "about N beads left" estimate.
- **Fabric**:
  - type: Aida / evenweave / linen
  - count, including "over 2"
  - colour: name, maker's code if known, and hex for preview
  - size W × H (in or cm) and quantity
  - scraps are just smaller pieces
- **Fast entry**:
  - bulk add by typing a list such as `310 2, 3865, 498 1.5, anchor 403 1`
  - "add all of this pattern's key to my stash"
  - CSV import and export of the whole stash

### 16.3 Using the stash in a pattern
- **Key and shopping list annotations**: every key entry shows one of ✓ *in stash*, *have 1 / need 2*,
  *missing*, or *have equivalent* (e.g. Anchor 403 for DMC 310, using the conversion tables in §15.8).
- **To buy**: the shopping list (§7.2) subtracts the stash. The CSV and PDF exports can output "missing only".
  Blend parts and combo threads count toward their base threads, as the totals already do.
- **Fabric match**: from the finished size and cut size (§7.3), list stash pieces that are big enough in the
  pattern's count. Also show what other counts would give, e.g. "on your 16 ct piece the design is 9.0″ × 7.5″,
  and that fits".
- **Kitting (reservations)**: assign stash items to a project, so two projects don't both count the same skein.
  Shown as *available* vs *reserved*.
- **Project lifecycle** (optional): when a project is marked *finished*, offer to deduct its estimated usage from
  the stash. This is never automatic.

### 16.4 Data model sketch (server side, per user)
- `stash_threads {id, brand, code, skeins, partial, location, notes, updated}`
- `stash_beads {id, brand, code, packets, approxCount, notes, updated}`
- `stash_fabrics {id, type, count, colourName, colourCode, hex, w, h, unit, qty, notes, updated}`
- `allocations {id, projectId, itemType, itemId, amount}` (kitting)
- Items are keyed by brand + code so they link to the colour libraries. Custom items carry their own hex.

### 16.5 Open questions
1. **Partial skeins**: fractions of a skein (½, ¼), metres, or just "opened / almost empty"? Precision helps the
   maths, but nobody measures leftover floss.
2. **Equivalents**: should *have equivalent* count toward "don't buy" by default, or only when the user accepts
   the substitution for that project?
3. **Usage deduction**: deduct automatically on *finished*, only on request, or never (stash edited by hand only)?
4. **Offline / guest mode**: should a local-only stash work without login (synced on first login), or is the
   stash strictly an account feature?
5. **Sharing**: one stash per account, or households / groups sharing a stash?
6. **Other supplies** later: needles, specialty threads (metallics, silk, variegated), hoops and frames?
