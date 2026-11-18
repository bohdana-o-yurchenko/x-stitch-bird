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
- **The new app's catalogue** (`core/catalog/data/millhill.json`, updated 2026-11-16) holds 1064 beads in 15
  series. Each series has `pack` (beads per package); a row is `[code, name, dmc, pack?, hex?]`.
  - **Packages**, from Mill Hill's Glass Bead Inventory (2010):
    - Glass Seed 500, except the codes marked "+" (250) and "≈" (about 450);
    - Crayon, Frosted and Petite 500; Antique 250;
    - Magnifica 400 (the 2 g pack, 10xxx; a 7 g pack of 1400 has the same colours under 11xxx);
    - Size 8 275, Size 6 100, Pebble 30;
    - bugles: small 135, medium 75, large 40.
    - Economy packs of 1000 (codes starting with 2) are not listed separately.
  - **Added** from the inventory and the 2015 DMC conversion chart:
    - 00777, 40777, 70777 and 80777 Potpourri: a mix, so no DMC equivalent;
    - 02062 Crayon Light Crimson;
    - 02101 Purple.
    - 42101 is now DMC 327, as the 2015 chart has it.
  - **Treasures** (Glass 183, Crystal 85, Metal 1; from Wichelt's catalogue):
    - a name with the size, e.g. "Small Heart Siam, 10.3/10mm";
    - pieces per package, 1–6;
    - no DMC equivalent; the screen colour is read off the maker's product photo, an approximation.

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

**Vector symbols (new app, 2026-11-15)** — replaces the ~300 font characters above. Two kinds, in this order:
- **Shapes**, drawn from vector paths (the same paths on the canvas, in the interface and, later, in PDF export), so
  they look the same on every device. Stored as `sym:<name>`. 11 bases (circle, square, triangle, diamond, star,
  heart, hexagon, triangle down, pentagon, triangle right/left), each filled · outline · with a dot · half filled
  left · half filled top, plus 18 marks (⊕ ⊗ ⊞ ⊠, ring, asterisk, 4 arrows, bars, chevrons, slashes, moon, cross).
  Order: filled, outline, dotted, marks, half-filled — most distinct first.
  Added the same day from a hand-drawn sheet (`scripts/symbol-sheet.txt`, 157 non-letter icons minus those
  already present as a shape or a character): 75 more **basic** shapes (dots, bars, corners, chevrons, arrowheads,
  notches, half and quarter fills, …) and 34 **decorative** ones (club, spade, tree, bell, leaves, flower, tulip,
  eye, spiral, sparkles, …). Basic shapes come before decorative ones, so new entries get the plainest free one.
- **Characters** drawn with the bundled DM Sans: digits `1–9`, capitals without `I O`, arithmetic signs
  `+ − × ÷ = < > % #`, some lower case, then `0 Q`. Still probed at start-up; shapes are not.
- Loading: old characters become their closest shape or sign (`●` → filled circle, `✖` → `×`, …); characters
  that are no longer in the list get the next free symbol, so every entry keeps a distinct one. This changes the
  look of old files (allowed, 2026-11-15); the file format stays version 1.
- **Hand-drawn symbols (2026-11-15)** — to match a paper chart's icon exactly without an endless ready-made list.
  The pencil button beside **All…** opens *Draw a symbol*. Two choices, then drag on a 12 × 12 grid:
  - **Shape**: circle, rectangle, triangle (points up / right / down / left), star, line 1 cell thick, line 2 cells
    thick (horizontal, vertical or diagonal, any length — the drag snaps to whichever it is closest to; flat ends),
    arrow (drag from tail to head, any direction).
  - **Paint**: **Filled** (solid ink), **Outline**, or **Cut out** — a negative that removes what lies under it,
    like an eraser. Lines can be filled or cut out, an arrow only filled. (So "filled / outline / negative" for
    every shape, lines included, without twenty buttons.)
  - Shapes are painted in the order drawn; a cut-out removes everything drawn *before* it, and shapes drawn after it
    sit on top again — so a ring with a dot works (ring, then a filled dot) and so does a circle with a star cut out
    (filled circle, then a cut-out star). A cut-out is outlined on the grid with a dashed accent line so it can be
    seen even over empty space; a drawing with only cut-outs is not a symbol yet ("needs something to cut").
  - **A cut-out is white paper** (2026-11-16), not a hole: where it crosses the shapes drawn before it, it shows
    white — never the floss colour under the symbol. When the symbol itself is drawn light (white on dark floss), the
    cut-out shows dark instead, so it never vanishes. Same on the chart, in the key, in the form and in the PDFs; in
    the dark themes the interface's glyphs use the theme's background for it.
  - **Drawing speed** (2026-11-16): a symbol with cut-outs is drawn once per colour, size and screen scale into a
    small picture and stamped on each cell (whole screen pixels, 1:1). Drawing its cut-outs anew on every cell of
    every frame had nearly doubled the cost of panning a chart full of them; now it costs about what letters do.
    Plain drawn symbols are still filled directly (quicker than stamping).
  - **Teaching**: a tip in the dialog spells out the circle-with-a-star recipe, and four examples — ring with a dot,
    circle with a star cut out, square with a round hole, circle with a cross cut out — load a ready drawing to look
    at and change. *Remove last*, *Clear*, and a preview at chart sizes. Opening the dialog on an entry that already
    has a drawn symbol edits that drawing.
  - **Guardrail:** at most **8 shapes**; a box shape is at least one grid cell each way, a line one cell long and
    straight or diagonal, an arrow at least two cells long; the tool can make nothing else.
  - **Storage:** the drawing *is* the symbol string in `KeyEntry.sym` — `draw:` + shapes separated by `;`, each a
    letter (`o O` circle, `s S` rectangle, `p P` star, `t T` triangle — lower case outline, capital filled; `l` line
    1 cell thick, `L` 2 cells; `a` arrow), four grid coordinates in base 13 and, for triangles, the direction
    (`u r d l`); a cut-out has `!` in front of its filled form — e.g. `draw:O00cc;!P22aa` is a circle with a star
    cut out (at most 56 characters). No new field in the file. A string that doesn't parse exactly is not a symbol
    and gets a standard one on load, like any unknown symbol; an older app version does the same with every drawn
    symbol.
    *Changed 2026-11-15:* before the "Cut out" paint existed, an outline drawn over a filled shape cut a hole; now
    only a cut-out does, so such a symbol shows the outline over the filled shape instead.
  - Text lists and CSV show ✎. The Pattern Keeper chart must be text in the symbol font, so there a drawn symbol
    is shown with a spare standard symbol, and the PDF's *About this chart* page says so.
- The key dialog groups the grid: Basic shapes · Decorative · Digits & letters · Signs. CSV and text lists show each shape as its
  nearest Unicode character.

**Backstitch line styles (new app, 2026-11-14).** A backstitch is a line, so its "symbol" is a **line style**,
not a character. The `sym` of a `back` entry holds `line:<name>`, picked from 20 styles in this order (the first
unused one is auto-assigned; once all 20 are taken they repeat):
solid · dashed · long dash · dotted · dash-dot · dash-dot-dot · long-short · sparse dots · short dash ·
dash-dash-dot · double · thick-thin · ticks · wave · zigzag · scallop · circles · squares · chevrons · crosses.
- **Line colour** (2026-11-16, backstitch only): `ink` on the entry, `#RRGGBB`; absent = black. The key form
  offers Black, Red, Green, Blue, Orange, Purple (the PDF's line colours) and the user's own. The Colour and Both
  views draw the line in its floss colour; the Symbols view and the PDF chart to print in its line colour.
- The two lines of dots keep their dots close, and the dots are bigger than the line is wide (2026-11-16): far
  apart, small dots stopped reading as one line. Dotted: dots almost touching; sparse dots: a little looser.
  Same in the editor and the PDFs.
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

*New app (2026-11-14):* app name **пташечка** with its icon (`src/app/icon.svg`, also the favicon) · **Menu ▾**
(the former File menu) · pattern name (`clamp(140px, 13vw, 260px)` wide) · **main toolbar**, in groups:
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
- Open saved pattern… · Open file from computer… (.xbird/.oxs; older .json still opens)
  (deleting a saved pattern in that list asks first: the row turns into "Delete *name* from this browser? This can't
  be undone…" with Cancel / Delete) · **Versions…** (automatic snapshots, §15.7 — no
  longer inside the Open dialog)
- Save (in this browser) · Download pattern file (.xbird, §9.7)
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
- *New app (2026-11-16):* **a two-finger move stays a move.** When the page is busy for a moment, the browser hands
  over several trackpad steps as one big whole-number step — which looks exactly like a mouse wheel notch, and used
  to zoom the chart suddenly in the middle of a move. So once a trackpad's small steps arrive, every step within
  300 ms belongs to the same move; a mouse wheel used on its own still zooms, and a pinch (Ctrl) always zooms.
  The same rule serves the photo windows (§11.3).
- *New app (2026-11-16):* the editor page has `overscroll-behavior: none`, so two fingers sideways never trigger the
  browser's back / forward swipe (which froze the chart mid-move) or the page's rubber-band bounce.
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
- **Collapsible side-panel sections** (image behind the chart, Fabric & size, Totals) remember whether they are open
  across reloads, per browser (`stitchwork.sections`); first visit: Fabric closed, the others open.
- **Long keys (2026-11-15):** from 10 entries on, the key gets a row of tools — a search box (thread or bead
  number, "dmc 310", or part of a colour name; blends and floss + bead match by any of their parts), an order
  (As added · By number · Most used) and **Group by type** (on by default): collapsible groups Cross stitch ·
  Backstitch · French knots · Floss + bead · Beads, each with its count. Only the view changes: key order, the
  chart and the 1–9 shortcuts (their badges stay on the same entries) are untouched. Order and grouping are
  remembered per browser (`stitchwork.keyView`). Shorter keys stay a plain list.
- Key icon (canvas, 30 px) rendered in the current view mode: a stitch/bead/backstitch sample with symbol.
  *New app (2026-11-15):* a stitch icon sits on the fabric colour unless the floss would vanish on it (ΔE < 16,
  e.g. white or ecru on white fabric) — then on a contrasting grey (or light) tile, so full and half crosses stay
  distinguishable everywhere icons are shown (key, key form, status bar, PNG key). Swatches and icons have an
  outline that shows around white and around black in every theme; line-style samples use the theme's text colour.
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

> **New app (2026-11-15):** a form docked in the side panel instead of a modal, so the chart and reference
> windows stay visible and usable. Colours are "lines" — one for a single floss, 2–3 for a blend, floss + bead for
> a combo — each with its own strands; one searchable list fills the highlighted line (type a number, Enter).
> Deleting an entry always asks, used on the chart or not, and names it.
> When the form closes, the key list is back where it was scrolled to (and the side panel too) — invisibly, before
> it is drawn. If the list was at its very bottom and an entry was added, it moves on just enough to show it
> (2026-11-16).

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
  *New app (2026-11-15), compact form:* entry type is one pill switch with short names (Cross · Back · Knot ·
  Floss+bead · Bead; full names on hover); stitch is a row of icon buttons with the chosen name beside it; the colour list is shorter and denser, with "+" for a custom
  colour on the search row. Symbol is one row — the current symbol and the next five free ones (two line styles)
  — plus **All…**, a popover with tabs Basic · Decorative · 123 ABC · + − × (used ones dimmed; picking closes it).

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

**New app (2026-11-16): saved patterns and the draft moved to IndexedDB** (database v5). localStorage holds ~5 MB for
the whole site and one 1000 × 1000 pattern is ~1.75 MB, so the library is now in the stores `patterns` (id → file)
and `patternMeta` (id → name, size, date, designer — what the Open dialog lists without loading every pattern).
- **Moving in**, once, the first time the library is used: every pattern in `stitchwork.library` is copied in (one
  already there and newer is kept); then `stitchwork.libraryMoved` is set. The old key is **kept untouched as a
  backup** and no longer written — only deleting a pattern removes it from there too.
- **Draft**: `{ savedAt, doc }` in the store `drafts` (key `current`) on every autosave, and in `stitchwork.current`
  too while it fits (that write surely finishes when the page closes; a draft too big for it removes the stale small
  copy). On start the newer of the two is used; a bare file in `stitchwork.current` (earlier versions) counts as oldest.

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
  "Start with the same key (threads, beads, symbols)" (unchecked by default) — copies `pal`, `blends`, `combos`, `customs`.
  Warning "Unsaved changes to the current pattern will be lost — save first if you want to keep it."
  New project gets a new id; `strands` carried over.

### 9.8 Quick-start guide (new app, 2026-11-14)
A guided tour for making a **перенабір** (an e-copy of a paper chart). It opens by itself on the **first visit only**
(flag `stitchwork.guideSeen` in localStorage, set as soon as it opens, so a reload never shows it again) and any time
from **Menu ▸ Quick start guide** (uk: "Як зробити перенабір").
- The screen is dimmed except for the elements the step talks about (pulsing outline). When a step is about a menu
  option, the guide **opens the menu (and its submenu) itself** and outlines that option; open menus stay undimmed.
  The card (460 px, roomy) sits beside the highlights — right, left, below or above, never on top of them — with the
  step counter, a title, **2–4 short bullet points**, sometimes a tip, and Skip / Back / Next. Names of buttons and
  options are **highlighted** in the text. Keys: → or Enter next, ← back, Esc closes (and closes the menu).
- Steps: welcome · 1 create a pattern with the chart's size · 2 fill in the key (floss, bead, blends, floss + bead;
  the paper key in a floating photo window, ticking lines off with its marker) · 3 image behind the chart,
  straighten by 4 corners, trace (tip: the quick move & resize panel, block by block) · **4 Autofill** — stitch a
  few cells of each symbol, pick Autofill (Shift+F), click the lined-up block, accept or decline; works best when every
  key symbol looks exactly like the paper chart's (tip: it fills only what it's sure about; check the result) · 5 Colour / Both / Symbols · 6 undo, hold Alt/⌥ to pick, select / copy /
  paste / move, override off by default (tip: the **i** button) · 7 automatic saving in the browser, and download the
  .xbird file to the device · 8 Versions · 9 pattern info and export .oxs for Хрестики and Ruta Stitch · Voilà.
- Highlight targets are `data-guide` attributes (menu, add-key, views, toolbar, shortcuts, saved); a missing target
  (e.g. side panel hidden) just isn't highlighted.

### 9.9 Feature tips, app versions, "What's new", .xbird format version (2026-11-15)
- **Feature tips** — one-step or two-step tours (same look as the guide, labelled "Tip"), each shown **once**, right
  after the feature is first used and only when nothing else is open (key `stitchwork.tipSeen.<tour>`):
  - *Image behind the chart* — after the first one is added and the straighten dialog is closed: highlights the
    edit toggle in the zoom box (frame, ↺ ↻, Ctrl/⌘+Z).
  - *Photo window* — after the first window is opened: what to put there (the key, or the chart scan instead of the
    canvas), then highlights the window's **Marker** and **Shade stitched** buttons.
  - *Key symbols* (2026-11-16) — the first time the form is opened to add an entry (not to edit one): every entry has
    a symbol (the row, All…); draw your own with the pencil when none matches the paper chart; most useful with
    Autofill, which works best when every symbol looks exactly like the paper chart's. Outlines the symbol row and the
    draw button.
  - *Autofill* (2026-11-16) — the first time it is picked, three steps: before you start (a key, the image behind the
    chart, a few cells of each symbol stitched by hand — Autofill only sees the symbols it has learned from them; tip:
    make every symbol look exactly like the paper chart's, drawing your own where needed);
    line the block up first (image editing, U); helpful, not perfect (only what it's sure about, may still be wrong,
    check every block, it gets better as you mark).
  - *Autofill's results* (2026-11-16) — the first time it shows what it found: the bar (faint suggestions, Accept /
    Enter, Decline / Esc, advice on Decline), then **Symbols only** and the hold-to-see-under eye.
- **App version** = `package.json` `version` (semver). **Menu ▸ What's new** lists the user-facing release notes
  (`src/core/release/changelog.ts`, uk + en). It opens by itself once after an update (`stitchwork.seenVersion` older
  than the app's version); brand-new users don't get it (the intro guide instead). Release steps:
  `docs/RELEASING.md`.
- **.xbird format version** — every downloaded file has `"xbird": 1` (`XBIRD_VERSION`); files without it are 1. A file
  with a higher number (from a newer app) is refused with "made by a newer version — reload the page". Breaking
  changes need a version bump plus a migration step — see `docs/RELEASING.md` "Compatibility rules".

### 9.6 Image store (new app, 2026-11-14)
The single-file app kept pictures as base64 data URLs inside its records (reference windows: photo and marks), so
every window move or marker stroke rewrote megabytes, and photos were re-compressed when added. The new app:
- IndexedDB store **`images`** (database version 4): `id → { blob, created }`. The id is a content hash
  (`img:` + the first 16 bytes of SHA-256, hex), so the same picture is stored once.
- Records refer to pictures by id: reference windows `{ image, marks, … }`, the underlay `{ image, straighten.source }`.
  Marks are stored as a PNG when they change (end of a stroke, undo, clear) — not on window moves.
- Pictures nobody refers to any more (closed windows, replaced underlays, old marks) are deleted 10 s after start-up,
  except ones saved within the last hour (their record may not be written yet).
- **Migration:** records written by earlier versions (data URLs in `src` / `marks`, also the old localStorage
  `stitchwork.refs.<id>` copy) are moved into the image store the first time they are read, and rewritten.
- Pattern files (`.xbird`, §9.7) are unchanged inside: pictures still travel inline as data URLs (`refs[].src`, `refs[].marks`,
  `underlay.src`, `underlay.straighten.src`) and are stored as Blobs when the file is opened.

### 9.7 Pattern files: `.xbird` (new app, 2026-11-14)
Our own file is downloaded as **`<pattern name>.xbird`** (`text/plain`). The contents are the same native text format
as before (v4, §9.3, plus `refs` and `underlay`) — only the extension and type changed, so the file reads as "a
пташечка pattern" rather than a generic data file. The interface never says "JSON".
- Opening (file chooser, drag and drop) accepts `.xbird`, `.oxs`, and older `.json` / `.xml`; files are told apart
  by content (XML → OXS), not by extension, so a renamed file still opens.

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
- **Symbols for printing, some in colour** (Export ▸ "Chart image — symbols for printing, some in colour", file `…-chart-print.png`, 1.3.1): the symbols-only chart with exactly the PDF symbol chart's inks (`symbolColours`, §15.10b) — a few entries red, green or blue where many different symbols mix; the key shows the same inks.
- Chart modes append a **key** below: heading `"<name>  —  key"` (Fraunces 20 px), then used entries only in
  columns of 420 px (`keyCols = max(1, floor((w*z + 2M - 40)/420))`), 34 px rows: 26 px icon with border, title,
  and `sub (count)` truncated to 58 chars.
- Canvas width = `max(w*z + 2M, 420 + 2M)` for charts.
- **Stitched preview** (Export ▸ Preview image — stitched): the colour preview with crosses as embroidered thread —
  a full cross covers ~95% of its cell (each leg 0.39 of the cell either side of its diagonal, cut at the cell's
  edges); each leg two twisted strands, shaded round across; the top leg (╲) brighter, casting a soft shadow on
  the bottom one (╱), which sits a little in shade; half crosses one leg, lit like a top leg. A faint hole at every cell corner of the fabric. Beads, partial
  stitches, backstitch and knots as in the colour preview. Cells `clamp(floor(3600/max(w,h)), 10, 28)`, file
  `<name>-stitched.png`.
- Every PNG ends with the footer line of the CSV and PDFs, in the interface language: "Generated by пташечка ·
  https://www.x-stitch-bird.app/en" / "Створено в застосунку пташечка · …/uk" (12 px, 28 px strip below).

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
- Photo drawn with pan/zoom (`view`); right/middle drag or Pan tool pans.
- *New app (2026-11-16):* the wheel works **as on the chart** (§5.1, one shared rule): a trackpad pinch, Ctrl/⌘ +
  wheel or a real mouse wheel zooms around the cursor (scale 0.02–40); two fingers on a trackpad move the photo;
  Shift + wheel moves it sideways. The window takes the gesture itself, so the browser never zooms or scrolls the
  page — also after the window was minimised and opened again.
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

## 15. Features beyond the original app, and the backlog

> Brainstormed 2026-11-14 with **e-pattern mappers** in mind: people who turn paper charts into faithful digital
> copies. Constraints for all of it: plain JS in the browser, no server, **no AI / ML**.
> The sections below keep their numbers (code and ARCHITECTURE refer to them). Sections marked *implemented*
> describe how the app works; what is still open is listed in §15.0. Cleaned up 2026-11-16.

### 15.0 Backlog — what is still open

| Feature | Effort | Persistence impact | Status |
|---|---|---|---|
| Intended fabric: name, type, count (§15.19) | S | optional fields in .xbird | not started |
| Floss usage rework + stitching bases: plastic canvas, wood (§15.20) | L | optional calculator settings | not started |
| Finished size for several counts in the print PDF (§15.21) | S | none | not started |
| Skeins and bead packs in the shopping list (§15.22) | S (pack sizes are in the catalogue) | none | not started |
| Accounts and cloud storage (Neon), sign-in, pattern gallery with previews (§15.23) | XL | new server storage; browser data migrated | not started |
| More chart checks (§15.4): backstitch, knots, beads | S–M | none | ideas |
| More thread brands (§15.8) | M code, L data | new `src` id namespaces | not started |
| Not yet discussed (§15.12): keyboard entry, specialty stitches, proofread tracking, second-screen window | — | — | ideas |
| Stash management (§16) | XL | needs a server | future phase |

Implemented: §15.24 Mill Hill Treasures and bead packages, §15.11 symbol matching in a block, §15.4 chart checks (empty cells, lone stitches, near symmetry), §15.1 metadata, §15.2 numbering and Go to cell, §15.3 transforms and mirror modes, §15.5 ambiguous
marks, §15.6 selection, §15.7 snapshots, §15.10 / §15.10b PDFs, §15.13 fractional stitches, §15.14 French knots,
§15.15 underlay, §15.16 highlighting, §15.17 work time, §15.18 themes, and the drawn symbols of §2.5.

### 15.1 Pattern metadata (implemented)

> *Checked against the OXS spec (2026-11-14):* OXS `<properties>` has only `charttitle`, `author`, `copyright` and
> `instructions` for text info (plus size, stitches per inch, palette count, software). We write the pattern name,
> the designer (as author), copyright and instructions; Хрестики shows the name and author. The **Pattern info**
> dialog therefore shows those four first ("Goes into the .oxs file", with the pattern name editable there too)
> and folds the rest — publisher, source, year, issue/page, digitised by/on, notes — under "More — kept only in your
> .xbird file". The "Designer" field is labelled "Author (designer)".
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

### 15.2 Grid numbering + Go to cell (implemented)
- `P.grid = { x0: 1, y0: 1, label: 10 }` sets the number of the first column and row, and the ruler label
  interval (10 or 5). An option **Number from centre** labels the centre cell `0` and counts outwards, which some
  publishers do.
- Major grid lines stay 10 cells apart and **align with the numbering**.
- Used in the rulers, the status bar, the PNG/PDF exports, and the reference-window grid read-out.
- **Go to cell** (Ctrl/⌘+G): type `col, row` in the paper's numbering. The chart centres on that cell and
  flashes it.

### 15.3 Whole-chart transforms & mirror modes (implemented)
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
  direction (rule above).

### 15.4 Chart checks (implemented 2026-11-16)
A **Chart checks** section in the side panel (collapsible like the others, closed at first) that looks for likely
mistakes in a copied chart. It runs on demand, never by itself, and never changes the chart.

**Choosing checks** — every check is **opt-in** (all off at first); the choice and options are remembered in the
browser (`stitchwork.checks`):
- **Empty cells** — holes in the stitching: a group of **1 to N** empty cells (N = 1, 2, 3 or 10; default 3) that touches no
  other empty cell, and not the chart's edge. "Empty" means no cross, half cross, partial stitch or bead; the
  groups are 8-connected (cells touching at a corner belong together), so a gap in a diagonal line of empty cells
  is not reported. Typical cause: a cell skipped while copying.
- **Lone stitches** — a group of **1 to N** stitches (N = 1–2, default 1) of one colour with no other stitch of that
  colour around it (8 neighbours). Same colour = same thread or blend, whatever the stitch type or strands. Options:
  *also when it stands alone on empty fabric* (off: by default only stitches inside other stitches are reported,
  where a stray cell is most likely a typo). Beads are not checked.
- **Near symmetry** — for designs that are symmetric left–right or top–bottom: the app looks for the mirror axis
  near the middle (within 5 cells, on a grid line or through a cell's middle) where most mirrored pairs of cells
  match. If 90–99.9% match, the pairs that don't are reported (both cells); a half cross matches its mirror image
  (╱ ↔ ╲), as in §15.3. Designs that are clearly not symmetric (below 90%) report nothing.

**Run checks** (disabled until a check is chosen) lists what was found.

**Results**
- **Grouped by check**: "Empty cells · 4", "Lone stitches · 12", "Near symmetry (left–right) · 3"; each group can
  be folded. Each finding is one line in the chart's own numbering ("Column 12, row 40", "2 cells", for symmetry
  "Column 12, row 40 ↔ column 49, row 40").
- **Stepping through**: ‹ and › step through all findings in order, with "3 / 19" between them; clicking a line
  jumps to it. The chart centres on the finding (zooming in if needed, as Go to cell) and draws a ring around it;
  all other findings show a thin outline, so clusters are visible at a glance.
- **Ignore** (✕ on a line) hides a finding for this session.
- After the chart changes, the results stay but a note says "The chart has changed — run again"; nothing is
  re-run behind your back.
- Nothing is stored in the pattern or its file.

**Not checked (yet)**: backstitch, knots, beads; unused or rarely used key entries (the key's counts already show
them).

### 15.5 Mark cell as ambiguous (implemented)
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

### 15.6 Selection, copy/paste, move, flip/rotate (implemented)
**Making a selection**
- **Select** tool (`S`): drag a marquee; Shift+drag adds to the selection.
- **Magic wand** (`W`): click to select contiguous cells of the same key; Shift+click selects every cell of that
  key.
- Ctrl/⌘+A selects all; Esc, Ctrl/⌘+D or the **Deselect** button on the selection bar removes the selection
  without changing anything.
- The selection is a cell mask drawn with marching ants. It carries stitches, beads, ambiguous marks, and
  backstitch segments whose both endpoints lie inside the selection's outline.

**Operations**
- **Clear cells** (Delete/Backspace) erases everything in the selected cells. (The button was called "Delete",
  which read as "delete the selection".)
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

### 15.7 Automatic snapshots — minimal versioning (implemented)
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
- Lost undo history and "New" without saving become recoverable.
- **In .xbird files** (2026-11-15): the pattern's versions travel along as `versions: [{time, reason, doc}]`,
  oldest first (`doc` is the pattern file of that version, without pictures or nested versions; thumbnails are
  redrawn on import). Opening the file adds them to this browser's versions of the pattern — ones already there
  (same time) are kept — and the usual retention applies. `.oxs` exports never carry versions.

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
- **Brands asked for by users (2026-11-16):** Anchor, Dimensions, Palmira, Avrora, Kreinik, Rainbow Gallery, Weeks Dye
  Works. Loading is no concern: a brand's table is ~5–20 KB compressed, loaded only when the brand is first used.
  The work is the data (codes, names, a screen colour, licensing), brand by brand. Hand-dyed lines (Rainbow Gallery,
  Weeks Dye Works) are variegated: one colour only approximates them — they need a variegated look.
- **Kreinik — sources and scope** (not built yet):
  - Every colour, codes and names: Kreinik's stash inventory form,
    https://kreinik.com/PDF/KREINIK_HOME_INVENTORY_2024.pdf (a list, not a colour chart — screen colours still needed).
  - DMC → Kreinik metallics: https://www.kreinik.com/PDF/DMC_FLOSS_TO_KREINIK_METALLICS.pdf
  - Only the most used lines: **Blending Filament**, **Very Fine #4 Braid** and **Fine #8 Braid**. The limited and
    special lines are left out. Metallic: a flat colour is an approximation (perhaps a sheen in the key icon).

### 15.10 PDF chart export — Pattern Keeper–compatible (implemented; works in Pattern Keeper since 2026-11-15)
**Menu ▸ Export ▸ PDF for Pattern Keeper.** A multi-page A4 PDF that the Android app **Pattern Keeper** can import
to track stitching. This is *not* Pattern Maker's native `.xsd` (§15.12).

**What Pattern Keeper needs** (no public spec — its designer page says to test in the app; these come from
third-party guides): chart symbols are real text from an embedded font, one glyph per cell, with ordinary (not
private-use) character codes; the grid is vector lines; the key is text (symbol, brand + number, name); pages are
portrait with about 60 stitches across. It tracks **full crosses only**.

**What counts as trackable** (decided 2026-11-15): a full cross in one floss (any number of strands), or in a blend
of exactly two flosses with one strand each. Everything else is left out of the Pattern Keeper chart: half crosses,
quarter / three-quarter / petite stitches, other blends, floss + bead, beads, backstitch, French knots.

**The file**
1. *Chart for Pattern Keeper* — symbols only (never colour), only trackable stitches; up to 60 columns per page,
   rows in multiples of 10, no overlap, column and row numbers in the margins, thin cell lines and heavy lines
   every 10 following the chart's numbering (§15.2).
2. *Thread list for Pattern Keeper* — laid out like the key of a WinStitch PDF that Pattern Keeper imports with its
   thread numbers (a sample chart, compared 2026-11-15): a **ruled table** (outline, a line under every row, lines
   between columns) with bold headers **Number · Name · Strands · Stitches**; first column a block of the thread's
   colour with the chart symbol on it (white on dark colours); brand and number as two separate words at a fixed
   tab ("DMC", "310"; blends "DMC 310 + DMC 321"); strands and stitch counts right-aligned. All text is in
   **embedded** fonts (a Latin cut of DM Sans, regular and bold), as in the sample — no built-in PDF fonts.
   Two earlier layouts imported without thread numbers: plain rows with headers Symbol · Number · Name · Strands ·
   Stitches in built-in Helvetica, then the same without the Symbol and Stitches headers.
   When something was left out, a page *About this chart* lists it.
3. Nothing else (since 2026-11-16): the chart with everything on it is the separate *PDF chart to print*
   (§15.10b) — the picture pages that used to follow here meant nothing to other apps (Хрестики, Ruta Stitch
   read no symbols from them).

**Before exporting**, when something is left out, a dialog lists it by kind with counts and points to the PDF
chart to print for the full chart. With nothing trackable at all, a toast says so and nothing is exported.

**Text is English** (embedded DM Sans; Cyrillic letters, e.g. in pattern names, from embedded Onest).

**Verified in Pattern Keeper (2026-11-15):** the grid, the symbols and the thread numbers are read; nothing has to
be typed in. **Not yet checked:** how a two-floss blend row is read.

### 15.10b PDF chart to print (implemented 2026-11-16)
**Menu ▸ Export ▸ PDF chart to print** — the chart for people to read and stitch from, separate from the Pattern
Keeper PDF. All vector (symbols from the embedded symbol font, hand-drawn symbols as paths with their cut-outs,
colours, lines), A4 portrait, in the interface language (see Language below).
1. **Cover**: name, designer and copyright, size in stitches and on the pattern's fabric (cm and inches), the
   contents with page numbers, and a **page map** — every chart page as a numbered box, the shared cells grey.
2. **Symbol chart**: crosses, half crosses (a thin diagonal and a smaller symbol), quarter / three-quarter / petite
   stitches (shaded corner and a small symbol), beads (a circle with the bead's symbol; a bead's symbol replaces the
   stitch's under it), floss + bead (the stitch plus a small bead dot), blends. Symbols are black, except where many
   different symbols are mixed: there some are printed **red, green or blue** (at most these three) so neighbours
   look different at a glance — see *Symbol colours* below.
3. **Symbol chart key**, straight after it: the symbol chart's entries with their symbols in the inks the chart
   uses.
4. **Symbols on colour**: the same on the thread colours, over the fabric colour; symbols in each colour's own ink
   (white on dark); a half cross's symbol sits on a small white disc in dark ink so it reads on floss and fabric.
5. **Colour chart with backstitch**: the cells **pale** (74% towards white, still their colour), symbols in grey,
   so the **backstitch stands out**: each backstitch entry in its **line colour** from the key (§2.5: black
   unless the user chose red, green, blue, orange, purple or their own), **thick** (from 0.21 of a cell for 1 strand,
   +0.05 per strand up to 4 — thicker than 2 strands on screen) and in its **line style**, drawn by the same code as
   on screen; the style's pattern grows with the line so dashes and ornaments stay readable. French knots: bright
   dots, one colour each in key order (red, green, blue, orange, purple, teal, magenta, brown, sky, dark red), with
   a dark outline.
6. **Key**: every used entry — thread colours for stitches and beads; backstitch and knots in the bright colour
   (and line style) they have on the colour chart — brand and number, details, count with its unit.

**Symbol colours** (`symbolColours.ts`): every cell shows one symbol (its bead's, else its stitch's, else its first
partial stitch's). For each pair of entries count how often their symbols touch (1 for a side, ½ for a corner).
Choose black / red / green / blue per entry to keep low: *the touching between entries of the same colour* + *0.9 ×
the cells of entries that are not black*. So an entry is coloured only when it touches other black symbols more
than about once per cell — speckled, mixed, detailed areas — while a big area such as a background stays black
(its border is short compared with its size); the most used entry is always black. Solved by local search: entries
in order of how mixed they are each take their cheapest colour, repeated until nothing changes; ties go to the
colour used least.

**Language** (2026-11-16): the interface language — English or Ukrainian (`chartPdf.*` messages; the key's labels
and counts as in the app, with their plural forms; numbers written the language's way). Text is DM Sans with
Onest for Cyrillic letters, switching font letter by letter, both embedded (Latin and Cyrillic cuts); ╱ ╲ print
as / \.
**Footer** on every page of both PDFs: "Generated by **пташечка** · https://www.x-stitch-bird.app/en · Glory to Ukraine" and a drawn Ukrainian flag (blue over yellow; the fonts have no emoji). The CSV ends with the same line and the 🇺🇦 emoji, the PNGs with the line and a drawn flag; the main menu ends with the same words and flag, not clickable.
Before 1.3.1: "Generated by **пташечка** · https://www.x-stitch-bird.app/en"
("Створено в застосунку **пташечка** · https://www.x-stitch-bird.app/uk"), the address a clickable link (the
bare address opens the app in Ukrainian, so English links to /en); the Pattern Keeper PDF's is always English. The
shopping-list CSV ends with the same line. The address per language is `app.url` in the messages.

**Pages**: about **40 stitches across** (cells ≈ 4.6 mm; up to 6.4 mm for small charts), as many rows as fit.
Neighbouring pages **share 2 rows or columns**: on both pages those cells are shaded grey (a grey background on
the symbol chart, a see-through grey over the colours), so the pages can be laid over each other. Each page shows
its column and row ranges, the chart's own numbering every 10, a small page map with this page filled, and
centre marks below and right of the grid.

### 15.11 Autofill: symbol matching in one 10 × 10 block (implemented; a toolbar tool since 2026-11-16)
**Why per block.** Even straightened, a photo of a paper chart is never exact: pages bend, print drifts. Mappers
line the photo up **block by block** (the 10 × 10 squares between the heavy grid lines), with the underlay's edit
frame (§15.15). So matching works the same way: only inside the block you have just lined up, never over the whole
chart. Plain image arithmetic, no AI (§15.12).

**Flow** — **Autofill** is a tool in the toolbar, in a group of its own before the drawing tools (Shift+F). Not "Magic wand": that is the
selection tool. It needs the image behind the chart, shown and loaded; otherwise a toast and the tool stays as it was.
1. Line the photo up on a block, as today. Stitch one cell of each symbol in the block the app hasn't seen yet.
2. Pick **Autofill** (toolbar, Shift+F, or *Autofill* in the image's panel). Instead of single cells, the
   10 × 10 block under the pointer is shown in the look of the image's edit frame: a light accent wash, a white halo,
   a dashed accent outline and the 8 accent handles. A hint bar says to click the block. The chosen block keeps the
   frame with a solid outline.
3. **Click the block** you lined up. Only the **sure** proposals appear, faintly (the entry at half strength), and
   **Accept** / **Decline** show just above the block (below it at the top of the view), with the count
   ("38 symbols found · 4 left empty"). While reviewing, the chart takes no drawing.
4. **Accept** (Enter) writes the proposals into cells still empty, as one undo step. **Decline** (Esc) drops them.
   Either one goes straight on: the next block can be clicked at once. Unsure and blank-looking cells stay empty.
- **Pointing at Decline** (or focusing it) pops a tip in the accent colour, its arrow on Decline, with two pieces of
  advice: line the image up on this block more closely (U), then try again; stitch a few more cells by hand — Autofill
  learns from what you mark. No click.
- The bar stays whole inside the chart area: near the right edge it slides left instead of going under the side panel.
- **Paused while the image is edited**: the pointer edits the image, a block being reviewed is dropped, the hint bar
  says Autofill waits. Back to stitching mode, it carries on.
- Another tool ends it; removing the image switches to Draw; another pattern opens with Autofill still picked.
- **The chosen floss is idle** in Autofill: still marked, but dimmed (with a tooltip) in the key list, the "Drawing
  with" card and the status bar — Autofill reads symbols off the image, it doesn't draw with the floss.
- **Alt** (the held picker) steps Autofill aside: the toolbar shows the picker, the block and the bar hide. Released
  without picking → Autofill again; after picking a colour → Draw, with it. Clicking an entry in the key while in
  Autofill (or the eraser) also goes on to Draw. (Any held tool — Alt, Space — shows in the toolbar while held.)
- **The proposals' own view** (2026-11-16), next to Accept / Decline: **Symbols only** — one click, on or off —
  switches the faint proposals between colour + symbols and symbols only, without touching the main view switch.
  The first time it follows the main view (Symbols → symbols only, otherwise colour + symbols); after that the last
  choice is kept in this browser (`localStorage` `stitchwork.autofillView`). **Hold to see under** (an eye) hides the
  proposals while it is held down, to look at the image under them.
- Toasts: no image under the chart; block not on the image; nothing learned yet; no empty cell in the block.

**Teaching — no separate step.** The examples are the cells already stitched, read off the photo:
- in **the clicked block**, at the current alignment — so it works from the first block;
- plus the **learned library**: every click adds the block's stitched cells (a cross, combo or bead alone in its
  cell), up to 8 per key entry, the newest. It is saved with the pattern (`samples` in the .xbird file, optional:
  `"thread|dmc:310|full": [base64 20 × 20 grey patches]`) and not part of undo. It is keyed by what the entry is,
  not its index, so it survives key edits; entries with no examples can't be proposed.

**How a cell is matched**
1. Through the underlay's placement (crop, rectangle, rotation — `gridToImage`), each cell of the block is cut out
   of the photo as a 20 × 20 grey patch (each pixel averages 2 × 2 points). Cells partly off the photo are skipped.
2. **Centred first** (2026-11-16): the symbol is moved to the middle of its patch — the centre of its ink, leaving
   out the grid lines (rows and columns inked nearly end to end), at most 5 px. Without it a cell more than 2 px out
   of line only matched the entry with the most examples, one of which happened to sit the same way: a T was read as
   a Y. Examples are stored as photographed; centring happens when comparing.
   Then the middle 16 × 16 is compared, normalised (minus its mean, divided by its spread), so faded or uneven
   print still matches.
   **Guarding empty cells** (2026-11-16): a misaligned photo slides grid lines and the edges of the neighbours'
   symbols into an empty cell. So the print is measured without the grid lines (rows and columns inked nearly end to
   end): a cell with less than 30% of a symbol's typical print is blank, and a symbol is proposed only when the cell
   has at least 55% of the print of that symbol's own examples. Before, a few empty cells per block could be given a
   symbol; real symbols are found as before. A cell with less ink than 30% of the examples' typical ink is **blank**.
3. Each patch is compared with every example by normalised cross-correlation, allowing a shift of up to 2 px each
   way. Per entry the best example counts.
4. **Sure** when the best score ≥ 0.6 **and** beats the next entry by ≥ 0.1 (≥ 0.72 when only one entry has
   examples); otherwise unsure → left empty.

**Limits (v1)**: full and half crosses, floss + bead and beads (anything one per cell); not partial stitches,
backstitch or knots. Works on printed symbol charts; weak on handwritten or blurred ones. Colour-block charts (no
symbols) could use the patch's mean colour instead — later.

### 15.12 Parked / rejected / not yet discussed
- **Rejected**: AI / ML-based features.
- **Rejected 2026-11-16**: scan calibration in reference windows (the former §15.9) — not needed; the underlay with
  its edit frame (§15.15) is how scans are lined up.
- **Rejected 2026-11-16**: options for the print PDF (Letter paper, how many rows pages share).
- **Parked**: exporting Pattern Maker `.xsd`. The format is proprietary, binary and undocumented.
- *(A scan underlay inside the chart canvas was rejected at first, then specified and built as §15.15.)*
- **Not yet discussed**:
  - keyboard data-entry mode (cursor + type a key, run-length entry)
  - long stitches, lazy daisies and other specialty stitches
  - uploaded symbol images (drawn symbols exist, §2.5)
  - proofread tracking ("mark region as proofed")
  - two-screen pop-out window

### 15.13 Fractional stitches — quarter, three-quarter, petite (implemented)
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

**Data model.** Store *stitches*, not areas:
- A sparse layer `P.part`: `Map<cellIndex, [{kind:'q'|'t'|'p', c:0..3, k}]>`, where `c` is the corner
  (TL, TR, BR, BL) and `k` is the key index.
- A three-quarter is identified by the corner of its short leg. Its long leg is the diagonal that does not touch
  that corner, so nothing more needs storing.
- Why this model: it maps 1:1 to OXS `<partstitch>` (both directions), to thread usage (quarter ≈ 0.25 of a full
  cross, three-quarter ≈ 0.75, petite ≈ 0.5) and to Pattern Keeper's fractional stitches. A grid of 4 squares or
  4 triangles per cell can't represent both the diagonal split and corner quarters cleanly.
- Sparse because fractional stitches are rare compared with full crosses. JSON v4 field: `part: [[i, kind, c, k], …]`.

**Decisions (as built, 2026-11-14)** — the questions asked in the draft, with the answers the app implements:

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
   - Import maps them back. Today they are "simplified" (§12.2).
   - Petite has no clear OXS form; this needs checking against real files.
   - *Implemented (fixed 2026-11-14 after testing in Хрестики / Ruta Stitch):* three-quarters as `<partstitch>`
     (direction 2 = split along ╱, 1 = along ╲). Quarters and petites as `<object>`s **on the half grid**: x1/y1 is the
     top-left of the quarter of the cell they cover (top-left quarter of cell (x, y) → (x, y), bottom-right →
     (x + 0.5, y + 0.5)); quarters `objecttype="quarter" petit="false"` (Cross Stitch Pro's mark for a diagonal
     quarter), petites `objecttype="petite"`. The first version wrote whole-cell x1/y1 plus a private `corner`
     attribute, so readers drew 4 quarters (or petites) of one cell on top of each other in the top-left corner.
   - Import reads both, plus Ursa's plain `objecttype="quarter"` (a miniature cross → petite) by its half-grid point.

### 15.14 French knots (implemented)
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

**Decisions (as built, 2026-11-14):** knot entries may have a symbol (shown in Symbols view; otherwise a dark dot);
placement is on the half grid. Still open, moved to §15.12: long stitches and lazy daisies.

**Beads between cells (2026-11-16).** A floss + bead entry has a 4th stitch next to the full and half crosses:
**Between cells** (`st: "point"`), for a bead or a Treasure tacked on a grid point instead of sitting in a cell.
A plain bead entry has **Placement**: *In a cell* (the default, no `st`) or *Between cells* (`st: "point"`); on the
chart it is the bead alone (no floss shown), and it counts as a bead.
- Placed exactly like a knot: same half-grid points, same tools, eraser, picker, mirror and transforms, stored
  with the knots (`knots: [[x, y, k]]`, `k` the floss + bead entry). Only floss + bead has it; switching such an
  entry to a cross stitch makes it a full cross. An entry on the chart can't move between cells and points.
- Drawn as the bead centred on the point over a short tacking stitch in the floss, with its symbol.
- Counts as beads (not knots) in the totals; the shopping list adds the bead and half a cross of floss each.
  Pattern Keeper's list of what it can't track counts them as floss + bead.
- PDF chart to print: on every chart, like beads in cells; in both keys as a bead.
- OXS: not as knots (readers showed them as French knots of a blend). A floss + bead between cells is its tacking
  stitch: a short backstitch through the point (one cell's diagonal, kept inside the chart) in the floss + bead's
  blend palette item, named "… (bead between cells)". A plain bead between cells is a bead object at its point.

### 15.15 Chart underlay — a reference image behind the stitches (implemented 2026-11-14)
Goal: put a scan or photo of the paper chart **on the chart canvas itself**, line it up with the grid, then stitch
over it. One underlay per pattern.

**Two modes**, switched by the **Behind stitches** toggle (or `U`):
- **Edit mode** (toggle off) — for placing the image. The image is drawn **above** the stitches at its opacity, with
  a dashed outline and 8 handles (corners and edge midpoints). Chart tools are paused: the pointer edits the image,
  and the toolbar shows it — greyed out, not clickable, its tool shortcuts ignored (2026-11-16).
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

**Edit toggle** (replaced the floating alignment pad, 2026-11-15): a small icon button at the left end of the zoom
box's bottom row — on the far side from "fit to screen", which it was confused with — shown whenever the pattern
has an image behind the chart. Pressed = edit mode; same as `U` and the "Behind stitches"
checkbox. No setting to switch it on.

**Zoomed-in edit frame** — in edit mode, Move & resize sub-tool, when the image covers the middle of the view and at
least 3 of its 4 sides are outside the view (so its own handles can't be reached), a frame is drawn in the middle of
the view: 320 × 220 screen px, dashed accent outline, 8 handles, transparent inside. It is a screen tool: panning
slides the photo under it. Not shown when zoomed out (the image's own handles are visible) or in Crop.
- **Stretch**: drag a side (anywhere along it) or a corner; the frame follows the pointer and the photo under the
  dragged side moves exactly with it. It works like pulling the photo's own side: the **photo's** opposite side (or
  corner) stays where it is, not the frame's (fixed 2026-11-15 — it used to scale around the frame's opposite side,
  so the photo grew both ways). Corners scale both axes, aspect kept; Shift = free. Smallest frame 40 px. Use: drag a
  grid line of the scan onto the chart's grid line.
- The frame keeps its new size and place until edit mode is turned off; turning it on again starts a fresh frame.
- Inside the frame (and anywhere on the image) dragging moves the image, as before.
- **Grabbing a side** (fixed 2026-11-15): everything around the frame is the photo, so a press that misses the
  frame moves the photo. The sides and corners therefore take presses within **14 px** on either side of the line
  (it was 8, corners and midpoints only outside the line's ends); the side or corner under the pointer is drawn
  solid and thick, and the cursor follows every pointer move (it used to update only when the pointer entered
  another chart cell — zoomed in, a stale resize cursor could sit over a spot that would move the photo).
- **Rotation** (2026-11-15) for slightly tilted scans: `rotation` in degrees (clockwise, ±45°) around the middle of
  the image. In edit mode (Move & resize) two round **↺ ↻** buttons sit above the middle of the image's top edge
  (turned with it; shown when on screen) and above the edit frame; each click turns by **0.2°** (fixed). The image
  turns around the image's middle (edge buttons) or the frame's middle (frame buttons), so what you look at stays put.
  Also `[` / `]` in edit mode (around the middle of the view) and the side panel's **Rotation (°)** field with ↺ ↻
  and **0°** reset. Handles, crop and the frame work in the image's own turned axes; after every resize, crop,
  stretch or turn the point that should stay put (opposite side, pinned side, pivot) is put back exactly.
  Straightening resets the rotation to 0. Stored in the underlay (and in .xbird files).
- **Ctrl/⌘+Z in edit mode** undoes the image's last change (drags, frame stretches, nudges, panel values; up to 50
  steps); leaving edit mode clears that history. Chart undo is unaffected.

**Straighten (4 corners)** — for photos and scans that aren't a perfect rectangle (taken at an angle, tilted,
slightly trapezoid), like a phone document scanner. Opens automatically after adding an image, and from
**Straighten (4 corners)…** in the side panel. (Replaced the 3-point alignment of the first version,
which could only move and stretch.)
1. A full-screen editor shows the **original photo** with 4 round corner handles (top-left, top-right,
   bottom-right, bottom-left) joined by an outline; outside the outline is dimmed.
2. Drag each handle onto a corner of the chart's grid on the photo (best: the outer border, or a big block of
   10-lines). Grab radius 24 px. While dragging, a **loupe** (4× magnified, with a crosshair) appears in the corner
   of the view away from the handle. Arrow keys nudge the last-touched corner by 1 photo pixel (Shift: 10).
3. Below the photo: **Marked area** `columns × rows` (default: the previous values, else the pattern's size) and
   **Its top-left corner is at column / row** (1-based, default 1/1). The predicted grid is drawn over the photo
   through the perspective transform — every cell line when cells are over 6 px apart, plus bold 10-lines — so a
   wrong count or corner is visible before applying.
4. **Straighten** (disabled while the outline crosses itself) warps the marked area into a flat picture, off the main
   thread: output size ≈ the photo's own resolution per cell (≥ 4 px per cell), at most 4096 px on the longer side,
   JPEG 0.92, bilinear sampling, white outside the photo. The underlay becomes that picture, uncropped, placed
   exactly on `columns × rows` cells at the given column/row. **Use as it is** closes without changes; **Reset
   corners** puts the handles back near the photo's edges.
- The original photo, the corners, the size and the position are kept, so reopening the editor continues from the
  previous corners, and straightening is always redone from the original (never from an already-warped picture).
- Afterwards the zoomed-in edit frame fine-tunes; a page that is bent (book spine) isn't fixed by 4 corners.

**Side panel section "Image behind the chart"** (only when one exists): Behind stitches toggle, Show/hide, opacity slider
(10–100 %, default 50 %), Move & resize / Crop (edit mode only), X / Y / W / H fields, Fit to chart, Reset crop,
Replace image…, Remove.

**Adding**: File ▸ Reference pictures ▸ **Image behind the chart…**, or drop a picture and choose **Put behind the chart**. The file
is stored **as it is** (no re-compression); only photos over 6000 px on the longer side are scaled down once (JPEG
0.92). It is fitted to the chart and the straighten editor opens. Replacing keeps the placement (rect) and resets the
crop to the whole new image.

**Not part of the chart**
- Never exported to PNG, PDF, OXS or CSV; never counted; not part of undo/redo or snapshots.
- Not affected by resize or transforms (it is reference material; re-fit it if needed).
- Shown in all three chart views.

**Data**: `{ image, imageW, imageH, crop: {x, y, w, h} (image px), rect: {x, y, w, h} (grid units), opacity,
behind, visible, tool, straighten?: { source, sourceW, sourceH, corners: 4×{x, y} (source px), cols, rows,
at: {x, y} } }`. `image` and `straighten.source` are ids in the image store (below).
- Saved per pattern in the browser like reference windows (IndexedDB, own store), debounced, flushed on page hide.
  The record is small; the pictures live in the **image store** (§9.6), so nudging never rewrites a picture.
- Included in pattern files (`.xbird`) as `underlay`, next to `refs`, with the pictures inline as data URLs: `src` (the shown
  picture) and `straighten.src` (the original photo). Files from before straightening (only `src`) still load.
- Not in the draft (`stitchwork.current`) or the library — they stay small.

---

### 15.16 Stitch highlighting (implemented 2026-11-14)
Idea from Pattern Maker v4 (Professional). Toggle with the eye button in the key panel's header or **V**.
- While on, the **active key entry** is drawn at full strength and everything else (crosses, partial stitches,
  beads, backstitch, knots) at 15 % opacity; fabric, grid, underlay and overlays are unchanged. Picking another
  entry moves the highlight. With no active entry, nothing is faded.
- View-only: not saved, not in exports or undo.

### 15.17 Time spent on a pattern (implemented 2026-11-15)
- Counted automatically while the user works on the pattern: any pointer press, drag, wheel or key in the app
  (drawing, adding to the key, setting up references and the underlay, filling in dialogs). Only moving the mouse
  doesn't count.
- The time between two actions counts when they are at most **3 minutes** apart; a longer gap is a pause and
  none of it counts. Switching to another pattern starts afresh.
- Nothing to start, stop or edit. Shown read-only as **Total time spent on this pattern** in Pattern info and in
  Versions, with "counting now" while it runs.
- Saved with the pattern (`spent`, whole seconds; draft, library and .xbird); not part of undo; restoring a
  version keeps the time spent so far. Not in .oxs.

### 15.18 Colour themes (implemented 2026-11-15)

- **Menu ▸ Theme**: a row of five two-tone dots (accent on the theme's shade) — Terracotta (default, warm beige),
  Olive (sage), Royal blue (cool grey-blue), Rose (blush) — all light, each with its own tinted background, panels,
  lines and stage — and Dark (bluish, after the Dracula colour scheme). Picking one applies at once and keeps the
  menu open.
- **Named after DMC floss** (2026-11-16, a small easter egg): each dot's tooltip is just the floss number, the same
  in both languages — stitchers know them: 3830 (Terra Cotta), 937 (Avocado Green Medium), 797 (Royal Blue), 3350
  (Dusty Rose Ultra Dark), 550 (Violet Very Dark, the dark one) — the flosses nearest each theme's colour (Royal
  Blue for its name). The theme ids stay `terracotta`, `olive`, `royal`, `rose`, `dark`, so saved choices keep working.
- **310** (DMC Black; `black`, 2026-11-16): a sixth, true black theme — black background and stage, near-black
  panels, white text and a white accent, monochrome. The chart's own marks (hover square, frames, Autofill) can't be
  white on the fabric, so the theme sets `--canvas-accent` (near-black) for the canvas.
- Remembered per browser (`localStorage` `stitchwork.theme`), applied before the first paint so nothing flashes.
- Only the interface is themed: panels, menus, buttons, the stage around the fabric and the rulers. The chart itself
  — fabric colour, floss and bead colours, symbols, grid — stays exactly the same, so what you see is what you stitch.
- Exported PNGs don't depend on the theme.

### 15.19 Intended fabric: name, type, count (backlog, added 2026-11-16) — effort S
Today the pattern stores only a count (a dropdown) and a colour (a colour picker).
- Add a free-text **fabric name**, e.g. "Zweigart Aida 14 ct Antique White 101" or "Lugana 25 ct 3613". It sits
  next to the count in Fabric & size, and in Pattern info.
- Optionally a **type**: Aida / evenweave / linen / plastic canvas / wood (§15.20 uses it).
- Shown in the print PDF: on the cover with the finished size (§15.21), and in the key's header.
- Stored as optional fields (`fabricName`, `fabricType`), so no version bump; old files open as before.
- OXS: write the name where the format has a field for it, if any — check against the readers.

### 15.20 Floss usage rework, and plastic and wooden bases (backlog, added 2026-11-16) — effort L
**Today** (`classicSkeins`, §7.2): one full cross with one strand = 1 unit; a skein = 3600 units on 14 ct, scaled
by count; rounded up to whole skeins per thread. Blends are split into their threads correctly; backstitch
counts its length × 0.42, a knot 1.5 units. **Missing**: waste (starting and ending tails, travel at the back), so
it tends to undercount on scattered ("confetti") areas; no metres shown; no settings.
**Plan**
1. Thread per stitch from geometry: the two diagonals on the front plus the travel at the back, for the fabric's
   count and the stitch type (full, half, partials), × strands. A skein = 8 m × 6 strands.
2. Waste allowance: a tail at each start and end, estimated from how many separate patches each colour has (a
   confetti area needs many more starts than one big block); plus a % setting.
3. Backstitch by its real length; knots by wraps.
4. **Bases** (the fabric type of §15.19):
   - **Plastic canvas** (7, 10, 14 mesh): larger holes, usually more strands, and longer travel at the back.
   - **Wooden / perforated blanks**: drilled holes, thicker material, so more thread per stitch.
   - Both get their own factors.
5. The totals show metres and skeins per thread. The calculator's settings live in the pattern (optional).
6. Check against published usage tables and a few real stitched pieces; unit tests per rule.
**Open questions**:
- Is "plastic and wood base" meant as plastic canvas and wooden blanks to stitch on? I read it that way.
- Which stitching style is the default (loop start, waste knot)?

### 15.21 Finished size for several counts in the print PDF (backlog, added 2026-11-16) — effort S
The cover shows the size on the pattern's own count only. Add a small table: 11, 14, 16, 18, 20, 22 ct, and 28
and 32 over 2, in cm and inches. Optionally, the fabric to buy, with a margin (e.g. 8 cm / 3 in each side).
Both languages.

### 15.22 Skeins and bead packs in the shopping list (backlog, added 2026-11-16) — effort S code, M data
- **Threads**: the CSV and the totals already give whole skeins, but they show a count with no unit. Write
  "2 skeins" and, after §15.20, the metres too.
- **Beads**: today a count of beads. Add packs: the catalogue now knows each bead's package size (§2.2,
  `ColorEntry.pack`). The list then shows "2 packs (≈ 640 beads)". What's left is code only.

### 15.23 Accounts and cloud storage with Neon; sign-in; pattern gallery (step 1 built 2026-11-16) — effort XL
**Built (step 1):** Neon project `still-rain-82314870` (eu-central-1), branch `production`; `neon.ts` declares Auth and
a private `assets` bucket.
- **Sign-in** (header, "Sign in"): Google, or a code by email (the first sign-in creates the account). Managed Better
  Auth through the app's own `/api/auth/*`. Signed in: an initial in the header, with the email and Sign out.
- **Patterns in the account** (Postgres table `patterns`, `db/migrations/001_patterns.sql`, `node scripts/db/migrate.mjs`):
  while signed in, every save to the library also goes to the account (toast says so), with a small colour preview in
  the bucket (`users/<id>/previews/<pattern>.png`). The Open dialog lists both, marked "this browser", "in your
  account" or both. API: `/api/patterns` (list), `/api/patterns/[id]` (GET, PUT, DELETE), `/api/patterns/[id]/preview`
  (PUT png, GET → short-lived signed link); every route checks the session and touches only that user's rows.
- Signed out, nothing changes: everything stays in the browser.
**Still to do:** the gallery page with previews; offering to upload this browser's patterns on first sign-in; custom
threads in the account; ~~pictures (photos behind the chart, photo windows) in the account~~ (§15.33); production setup (Vercel
env vars, trusted domain, own SMTP, own Google OAuth app — see below).

**Plan as discussed:**
A big turn: patterns are stored on a server under a user account, not only in the browser.
- **Sign-in**: Neon Auth (email code or magic link, Google). Without signing in, the app works as now, in the
  browser.
- **Storage**: Neon Postgres for patterns, versions and settings; pictures (references, underlays, previews) in
  object storage. The `persistence` ports (ARCHITECTURE) already separate storage from the editor, so a server
  adapter fits behind them.
- **Gallery page**: the user's patterns as cards with a preview picture, name, size and last change; open,
  rename, duplicate, delete.
- **Moving in**: on first sign-in, offer to upload what is in this browser. Nothing in the browser is deleted, and
  nothing that touches stored data ships without a warning first.
- **Hard parts**:
  - working offline, and conflicts when two tabs or devices change the same pattern;
  - limits on picture size;
  - deleting an account and all its data;
  - server costs.
- Unlocks the stash (§16).

### 15.24 Mill Hill Treasures in the bead list (implemented 2026-11-16)
In the catalogue (§2.2): 269 Treasures in three series, each with pieces per package and a colour from the photo.
Drawn as a large round bead (radius 0.48) for now. Charm-shaped icons (heart, star, flower, leaf) could come later.

### 15.25 Signed out vs signed in; the header's menus (decided 2026-11-17)
**Signed out** — the whole editor, one working pattern kept in this browser; to keep work elsewhere, the work
file (.xbird). Starting a new pattern asks first: *Download .xbird* · *Sign in to keep it* · *Replace it* (never
discarded silently). People who saved several patterns in this browser before keep them, openable; on their first
sign-in they're offered a move to the account. **Signed in** — any number of patterns, saved to the account, on
any device; My patterns (a page with previews); versions in the account; My threads. Later: photos in the account,
read-only share links.

**Header** (built 2026-11-17): `[🐦 пташечка] [Pattern ▾] [name] …tools… [Transform ▾] [🖨] [☰] [👤] [▥]`.
- **Pattern ▾** — working on it: New ›, Open… (only signed in, or when other patterns are saved in this browser),
  Download work file (.xbird), Open work file…, Versions…, Pattern info…, Image behind the chart…, Photo in a
  floating window…. No "Save": saving is automatic (Ctrl/⌘+S still saves at once).
- **🖨 Print & share** — the finished chart: PDF chart to print, PDF for Pattern Keeper, Chart images (PNG) ›,
  Preview images (PNG) ›, Shopping list (CSV), Open Cross Stitch file (.oxs).
- **☰** — Quick start guide, Keyboard shortcuts (the list that used to sit under the ⓘ button), What's new,
  Language (Українська · English), Theme, Privacy policy, Glory to Ukraine 🇺🇦.
  **Toolbar** (2026-11-17): *Hide line, rectangle and fill tools*, *Hide fractional stitches* — off by default, remembered
  in this browser (`stitchwork.toolbar`); only the buttons go, the tools and their shortcuts still work.
- The guide holds the menu its step talks about open (`menuReveal: { menu, path }`).

**Saving** (built 2026-11-17): the draft in this browser 0.6 s after every change; the saved patterns — and the
account, signed in — 5 s after editing stops, at least every 30 s while it goes on; everything at once when the
page is hidden. Signed in, leaving with changes not yet in the account sends them and the browser asks first. A
save cut off (tab closed) is caught up on the next sign-in: browser copies newer than the account's go up. The
account's preview picture is redrawn at most once a minute. The status bar says where the work is: *Saving…* ·
*✓ Saved to your account* · *✓ Saved in this browser* · *Saved in this browser — your account gets it once you're
back online*.
**One working pattern, signed out** (built 2026-11-17, `editor/keepPattern.ts`): commands that put another pattern
in place of the open one (`replacesPattern`: New, from a picture, open a work file, open a saved one) first ask
*Keep this pattern?* — **Download it, then continue** · **Sign in to keep it** · **Replace it** · Cancel — when the
open pattern has edits since it was opened or made (remembered across visits, `stitchwork.editedPattern`). The
replaced pattern then leaves this browser's saved patterns; an untouched one leaves without the question.
Never asked, never removed: signed in; patterns in this browser on the first start with the rule
(`stitchwork.keptPatterns`, so earlier libraries stay); patterns that reached the account. The question comes after
"Create" or picking a file, so cancelling a dialog never loses anything. Signing in with work open puts it into the
account at once.
**Next:** My patterns (§15.26).

### 15.26 The main page: My patterns (built 2026-11-17, redesigned the same day)
`/[locale]/patterns` (`ui/home`, `editor/library.ts`). The editor's logo and name lead here, and so does **My
patterns** in the account menu; the open pattern is saved first. The editor stays at `/[locale]`, so links in
exported files keep working.
- **Header** like the editor's: logo, the sections as tabs (only *Patterns* now; threads and the stash later),
  languages, account.
- **Continue stitching**: the pattern last worked on (the editor's draft) — big preview, name, size in stitches and
  in cm on its fabric, when it was edited, **Continue →**. Signed out, one line under it invites to sign in.
- **All patterns** (the others) as cards: the preview fills the card (crisp, its size shown while pointing at it),
  name, when it was edited ("3 days ago", in the page's language); ⋯ → Open · Delete… (asks). Signed in, a pattern
  only in this browser says so (⚠); a banner offers **Move to my account**. **+ New ▾**: Blank pattern · From a
  picture… · Open work file… (the file is picked here and handed to the editor, `editor/startRequest.ts`). Search and
  sorting (recent, name) from 9 patterns on. Nothing yet: the bird, and the three ways to start.
- A card opens the pattern in the editor (`/?open=<id>`, after start-up and the session check; the one already open
  isn't reloaded). Previews: the account's picture when it has one, else drawn from the pattern in this browser.
- Downloading a work file stays in the editor (it holds the photos and versions).

**Signed in, the account is home** (2026-11-17): this browser keeps the open pattern and the 10 most recent of the
account's as a cache (`trimCache`, on sign-in); never a copy newer than the account's. **Signing out** first lets
changes reach the account, then takes the account's patterns out of this browser (shared computers) — and the draft
when it's one of them; the editor then shows the demo. Patterns only here stay. Nothing is taken out when the
account can't be reached.

### 15.27 Importing other apps' patterns: Saga, Pattern Maker, PCStitch (backlog, assessed 2026-11-17)
Idea: open other apps' files so пташечка also works as a converter — **import only, never write them**; out goes
.xbird or OXS (open, documented). Already there: **OXS** import (Pattern ▸ Open work file…, and drag & drop).
- **.saga (Cross Stitch Saga, iOS/Android)** — undocumented; no public spec or open-source parser; converters exist
  only as closed services (e.g. crossstitch.diy, SAGA → XSD). Saga itself imports XSD, XSP, PAT, OXS, so its own
  format holds the same things (full/half/quarter/petite/oblong, backstitch, long stitch, knots, beads). Needs real
  sample files to study. **Check first:** designers sell patterns as .saga; if the files are encrypted or otherwise
  protected, we don't break that (circumventing protection is a legal line, whatever the purpose) — only plain
  files. Effort: unknown until a sample is looked at (M if plain and structured, out if protected).
- **.xsd (Pattern Maker)** and **.pat (PCStitch)** — binary, but long since worked out by open-source projects
  (KXStitch reads both); common in older purchased charts and what SAGA converters produce. Effort M each, with
  real sample files for tests. Written from the format, not copied code (KXStitch is GPL).
- Same rule as OXS import: what we can't represent is simplified and reported (`toasts.loadedReport`).

**Assessed again 2026-11-18 (backlog, ranked):** Pattern Maker `.xsd` import first — the most used commercial format,
with an open reader to learn from (KXStitch, GPL-2.0-or-later, compatible); then an SVG chart export (vector, sharp
at any size); then PCStitch `.pat` import (older, more reverse engineering). JPEG export and copying the key as text
are trivial but of little use. First comes a proper `.oxs` round trip (brands kept, see the open design).

### 15.28 Thread brands per pattern; your own threads (decided 2026-11-17)
**Brands** (built): a pattern has thread brands, by name (`Pattern.brands`, optional in the file — absent means DMC;
`core/pattern/brands.ts`). Usually one; some charts mix (Mirabilia: DMC + Kreinik). Chosen in the New dialog (chips;
"Start with the same key" keeps the old brands too) and in the picker: one tab per brand, **+ Brand** adds one (a
known brand or a new name), **×** removes one — only while no key entry uses it, never the last. A brand the key
uses always shows. Built-in catalogues: **DMC**, **Anchor** (445, with the DMC equivalent of 342 shown as "≈ DMC …") and **Madeira**
(369) — Anchor and Madeira from KXStitch's open colour schemes (GPL-2.0-or-later), the equivalents from convertfloss
(MIT); `scripts/catalog/import-kxstitch.py`, credits in NOTICE.md. Built in like DMC (~10 KB compressed for both):
colours are there at once, nothing to wait for. Mill Hill for beads, with their own picker. Other brands only from
openly licensed data — the stitchmate.app colour library may not be reused (its terms forbid copying it); until
then people add the threads they need as their own. OXS: other brands go out with the brand in the name ("Anchor
Black"); an OXS number or name starting with Anchor / ANC / Madeira comes back as that brand's colour.

**Your own threads** (built 2026-11-17: table `threads`, `/api/threads`, `editor/threads/inventory.ts`, the
**Threads** page `/[locale]/threads` next to Patterns): one form — brand (picked from the
pattern's and known brands, or a new one), code, name, colour — in the picker (+, and ✎ to change one; the key
follows) and later on the Threads page. A thread can be your own in a built-in brand (a DMC shade not in the list)
or in a brand of your own (Weeks Dye Works). Every pattern keeps a copy of the ones it uses, so shared files are
whole. **Signed out**: they live in their pattern only. **Signed in**: an inventory in the account, in every
pattern; on sign-in the ones in this browser's patterns join it (matched by brand + code). Deleting — only on the
Threads page; patterns keep their copies. Brands of your own can be renamed or deleted there; built-in ones can't.
The Threads page: brands on the left (with counts; ✎ rename and 🗑 delete for your own brands, while pointing at
one), your threads and beads as swatches on the right; **+ Thread**, **+ Bead**, a click changes one (brand too) or
deletes it (asks). Signed out the page explains and invites to sign in. In the editor, signed in, the picker lists
the inventory's threads in their brand's tab, its brands under **+ Brand**; a picked one is copied into the pattern.

### 15.29 Free software: AGPL-3.0-or-later (2026-11-17)
пташечка is licensed under the GNU Affero General Public License, version 3 or later (`LICENSE`; copyright Bohdana
Yurchenko). Third-party fonts, colour data and libraries with their licences: `NOTICE.md`. As the licence asks of a
program used over a network (§13), the app links to its source: ☰ ▸ **Source code** ("Free software · AGPL-3.0") and
the main pages' footer. A paid subscription for the account (storage, sync) later is compatible: the code stays
free, the hosted service is what's paid for. Outside contributions: decide on a contributor agreement first if the
code might ever be offered under other terms too.

### 15.30 Bead brands: Mill Hill, Preciosa; your own (2026-11-17)
Beads come in brand tabs like threads, but all of them always (no per-pattern choice): **Mill Hill** (series filter),
**Preciosa** Rocailles (finish filter), then bead brands of your own. **Preciosa**: 619 colours / 565 codes in 56
finishes from Preciosa Ornela's own sample cards — codes, finishes and article numbers read from the PDF, each colour
measured off its printed bead strip (`scripts/catalog/import-preciosa.py`; credit in NOTICE.md). A code comes in
several finishes (13600 plain, 13600 matt): the id carries the article number unless it's the plain one
(`preciosa:13600`, `preciosa:13600/33139001`). No package count (sold by weight). **Toho**: no official colour chart
found to build from (retailers' charts are theirs; Toho's site isn't ours to copy) — until one is, Toho beads are
added as your own, in a brand "Toho". Your own beads have a page of their own, **Beads** (`/[locale]/beads`), next to
Patterns and Threads — the same page as Threads (brands, add, change, delete); built-in brand names (DMC, Anchor,
Madeira, Mill Hill, Preciosa) can't be renamed or deleted. In the bead picker **+ Brand ▸ New brand…** shows the
new brand's tab and opens the form for its first bead (a bead brand exists through its beads).

### 15.31 Threads & beads of a pattern (2026-11-17)
The **New dialog** (redesigned 2026-11-17, `ui/dialogs/NewPatternDialog.tsx`) is one calm column: **Start from**
(A blank key · This pattern's key & settings), Name, Size (w × h stitches and the fabric, with the finished size in
cm), and **Threads & beads** as one summary line ("DMC only · beads: Mill Hill") with **Change ▾** that unfolds
them: plain checkboxes in an airy grid per group, "Only …" on its own line below, beads on / off as a switch in the
Beads heading. Chosen as checkboxes (`ui/threads/MaterialsForm.tsx`) there and in the side panel section
**Threads & beads** — not in Pattern info, which is about the design and its author. Stored in the pattern:
`brands`, `onlyBrand`, `beadBrands`, `onlyBeadBrand`, `noBeads` (all optional; `core/pattern/brands.ts` `materials`).
- **Threads**: the brands ticked; with exactly one ticked, **Only <brand>** (on by default for a new pattern: DMC
  only). Only one → the key form shows no brand tabs, and your own threads go into that brand (the form shows the
  brand, not a choice). Several, or "only" off → tabs, + Brand, × (removing only while unused), your own threads in
  any brand, new brands.
- **Beads**: **This pattern has beads** (on by default), then the same: brands (Mill Hill for a new pattern), "only".
  Off → the key form has no Floss + bead at all; Bead stays, greyed out, its hint saying beads are turned on in the
  side panel's Threads & beads (not from the key form). Beads can't be turned off while the key has some.
- Adding a second brand ends "only one" (it applies again only when ticked). A brand the key uses can't be unticked.
  **This pattern's key & settings** (New dialog, Start from) copies the key and fills in the open pattern's threads
  & beads and fabric exactly as they are; anything the key doesn't depend on can still change (its brands and beads
  stay ticked). Unticking puts back what was there before.
- Patterns from before (none of the fields): several thread brands as they were, every built-in bead brand.

### 15.32 One home per thing: menus act once, the side panel shows the pattern's state (2026-11-17)
**Rule:** a menu *does* something once (create, open, save out, turn the chart); the side panel *shows* the open
pattern's state, to look at and tweak while working. Nothing is in two places.
- **Pattern ▾** — the pattern as a file: New ›, Open…, Download work file, Open work file….
- **Transform ▾** — the chart's orientation: flips, rotations, Mirror from centre.
- **Side panel** — "Drawing with" and the key, then **one section**, chosen in the bar along the bottom
  (`ui/side/SidePanel.tsx`; editor state + `editor/panelSections.ts`, remembered per browser) — one at a time, so
  the key keeps plenty of room: an icon puts its section in place of the one there; the shown one's icon takes it
  away. The section folds under its header; unfolded, its height is set with the **handle** above it (double-click:
  default 320 px) and content that doesn't fit scrolls inside; the key list takes the rest and scrolls on its own;
  when room runs out the section gives way first. Every section starts with the same space under its header; its name shows at once on pointing (`data-tip-instant`). The bar has two groups, a thin line between:
  used while stitching (References, Chart checks, Totals) · about the pattern (Fabric & size, Threads & beads,
  Pattern info, Versions); the panel follows the same order. Every section is laid out the same way: groups with a
  small heading, rows of label and control, switches for on / off, rarely used details folded. Sections:
  **References** (photos in floating windows first — listed, shown / hidden, removed, **Add a photo window…** — then
  the image behind the chart: switches for Behind stitches and Show with the opacity, Move / Crop and the hint while
  editing, Adjust — rotation, Straighten, Fit, Reset crop, the exact position folded — then Autofill, Replace,
  Remove; or **Add an image…**), Chart checks, Fabric & size (groups Fabric · Grid size
  — **Resize… · Extend canvas… · Crop to content** — · Numbering), Threads & beads, **Pattern info** (the fields that go into OXS, then the app's own folded unless filled; saved as you leave each; the name is changed
  in the header), **Versions** (the time spent on the pattern, then the copies with Restore), Totals & shopping list (the time
  spent as one small line, the counts as small tags, then what to buy, a line
  each). Adding a picture behind the chart, or asking for a section elsewhere (a guide step, `file.versions`,
  `pattern.editInfo`), brings it in unfolded. Resize and Extend canvas stay dialogs (they ask for numbers).

### 15.33 Pictures in the account: never lost (2026-11-17)
The goal: a photo, a marking or the image behind the chart, once attached, is never lost. For the work the app is
made for, the photos' quality is the point — so they are kept **as they came, never scaled down or re-encoded**.
- **Photos as they came.** A photo window keeps the original file (before: a 1600 px JPEG). The marks layer over it
  is at most 2400 px on its long side (each undo step holds a copy of it) and is stretched over the whole photo;
  marks made over smaller photos keep their exact size. The image behind the chart is kept as it came too (before:
  scaled to 6000 px). A photo over 24 megapixels is used after a word that the app may pause for a few seconds with
  it, longer on a tablet or phone (Cancel / Use it, with "Don't ask again").
- **Into the account, while signed in.** Every change to a pattern's photo windows or underlay also goes up, a couple
  of seconds after it settles: first the pictures (photo, marks, underlay, its straighten source), each once — its
  id is its content hash — then the small records that use them. The browser sends a picture straight to storage
  through a signed form (any size up to 200 MB; the app's own server takes only a few MB), and the account records it
  only once storage really has it. The account refuses records that use a picture it doesn't have, so it never points
  at a missing one. Storage: the `assets` bucket, `users/<id>/pictures/<hash>`; records on the pattern's row (`refs`,
  `underlay`, `pictures_rev`; `db/migrations/003_pictures.sql`); table `pictures` lists what storage has.
- **Nothing waits silently forever, nothing is overwritten unseen.** A change not sent yet (offline, signed out, the
  tab closed) is remembered in this browser and goes up on the next change, on signing in or when the connection is
  back. The account counts revisions: a change made over an older one (another device changed it since) is merged —
  windows from both kept, this browser's version of one both have — never just replaced. Unsent changes here are never
  replaced by the account's.
- **On another device** opening the pattern brings its windows and underlay, with their pictures checked against
  their ids, into that browser; it then works offline like any other.
- **Signing out** takes a pattern's windows out of this browser only when the account surely has them.
- **Clean-up**: pictures no pattern uses any more (old marks, replaced photos, deleted patterns) leave storage a day
  after they were added at the earliest.
- API: `/api/patterns/[id]/pictures` (GET; PUT `{ refs, underlay, base }`, 409 `{ current }` or `{ missing }`),
  `/api/pictures/[id]` (GET → short-lived link, POST → signed upload form, PUT → confirm).

### 15.34 One pattern in several windows or devices (2026-11-18)
Signed in, the same pattern can be open in several windows, browsers or devices. Nothing done in one is lost or
replaced unseen by another.
- **One window edits at a time; the others follow it.** A following window shows the editing window's changes within
  a few seconds (while another window follows, the editing one saves to the account about a second after each change;
  windows check in every 2 s with others around, every 6 s alone, not at all while hidden). It can look around (move,
  zoom, the picker, photo windows, printing), but changing the pattern only makes the bar wave: "Being edited in another
  window. Its changes show here as they're made. [Edit here]". **Edit here** takes over: the window that was editing
  saves its last changes first ("Taking over…"), then follows in turn. A window that's gone (closed, asleep, offline)
  is not waited for; when nobody edits, the first window to check in does.
- **Revisions.** Every save names the account revision it was made over (`patterns.rev`); one made over an older
  revision is refused and comes back with the account's copy. Then: the same content — nothing to do; nothing changed
  here — the account's copy is shown; **changed in both places** (e.g. work done offline while another device went on)
  — "Changed in two places": both versions side by side, *Go on with this one* / *Go on with that one*. The one not
  chosen is kept in Versions ("The other version (not chosen)" / "This window's version (not chosen)"), so nothing is
  lost either way; choosing this window's version makes it the account's (it takes over the editing first).
- **Versions from every device in one history.** Versions are whole snapshots, so two histories join by time: each
  browser's go up to the account (`pattern_versions`, gzip), the account's come down, and every place thins the joined
  history the same way (§15.7). Opening the pattern or the Versions section brings them together.
- **Offline**: changes are kept in this browser and marked; they go up when the connection is back, over the revision
  they were made on — so they either simply go up or lead to the question above.
- Signed out, or a pattern only in this browser: nothing changes.
- API: `/api/patterns/[id]` PUT with `x-base-rev` / `x-window` (409 `{ rev, doc }`), GET answers `x-rev`;
  `/api/patterns/[id]/live` (`checkIn`, `claim`, `release`); `/api/patterns/[id]/versions`. `db/migrations/004_live.sql`.

### 15.35 Limits per account (2026-11-18)
Sized to the Neon free plan (1 GB Postgres for the whole project, production and `dev` together; 5 GB object storage;
5 GB of network transfer a month). Signed out nothing is limited: everything stays in the user's own browser. Over a
limit nothing is lost — the work stays in the browser, and the app says what to remove (`src/server/limits.ts`).
- **20 patterns** in the account. Saving a 21st (a new pattern) is refused: it is saved in this browser, a toast says
  so once ("Your account holds 20 patterns — … Delete a pattern to keep it in your account too"), and the status bar
  reads "Saved in this browser — your account is full". Changes to the 20 always go. My patterns ▸ Move to my account
  stops when the account fills ("…the rest stay in this browser").
- **100 MB of photos**: photos, their marks, images behind the chart (and their straighten source) that the account's
  patterns use, each counted once (the same photo in two patterns: once); pictures uploaded within the hour count too
  (on their way). Old marks and removed photos don't. Signed in, adding a photo that doesn't fit is stopped before
  it's added — "No room for this photo: … use 97 of 100 MB, and this one needs 12 MB. Remove a photo from a pattern …
  or delete a pattern"; one that reaches the account without room anyway (made offline) stays in this browser, with
  a notice. The account checks again on every upload (413 `{ error: "quota", used, max }`).
- **Versions**: at most **30 per pattern** everywhere (was 50; latest 10, hourly for a day, daily for two weeks), and
  at most **25 MB per account**: past it, the oldest versions of the least recently changed patterns go first.
- The account menu shows the use: "Patterns: 3 of 20 · Photos: 42 of 100 MB" (`GET /api/usage`).
- Room at the limits: about 26 accounts all at the maximum, a few hundred in realistic use; past that the Launch plan
  (Postgres $0.35/GB-month, object storage $0.023/GB-month).

### 15.36 The patterns page: Open leads there; gallery and list (2026-11-18)
- **Pattern ▾ ▸ Open…** goes to the patterns page (My patterns) instead of a dialog; the editor's changes are saved
  first. The Open dialog is gone.
- **The footer** of the Patterns, Threads and Beads pages stays at the bottom of the window (the page scrolls above
  it), half as tall as before.
- **Gallery | List**, remembered in this browser:
  - *Gallery* — as before: the picture, the name, when it was changed.
  - *List* — one row per pattern: the picture; the name, designer and where it's kept; **Size** (stitches, and cm on
    its fabric count); **Stitches** (colours, stitches, beads and backstitch lines); **Time spent** (and the last
    change); **Takes up** (the pattern file in KB, its photos — how many, MB with their marks — and versions).
  - A compact list was considered and left out: with at most 20 patterns in an account, gallery and list cover it.
- Signed in, the heading says what the account holds: "2 of 20 patterns · 0.1 of 100 MB of photos in your account".
- The figures: one function for browser and account (`core/pattern/stats.ts`). Patterns in this browser are counted
  here (their photos and versions here); for those only in the account the server keeps the figures, worked out at
  every save (`patterns.stats`, `db/migrations/005_stats.sql`; older rows filled in when first listed), so the list
  never downloads whole patterns.

### 15.37 Opening without a jump; signed out = one pattern; one bar; actions on every pattern (2026-11-18)
- **The editor opens what was asked for first.** What to open is read once, before anything shows — `?open=<id>`,
  `?new=1`, a picture or work file picked on the patterns page, or nothing (the pattern last worked on) — and handed
  to the editor's start-up (`editor/startRequest.ts`, `Editor.init(intent)`). A picked pattern is loaded straight away
  (from this browser, or from the account once the session is known); the pattern last worked on is shown only to
  resume. Until the first pattern is in, the page shows the bar and an empty workspace — never another pattern. A work
  file opens the same way signed in; signed out (and for New / a picture) the pattern last worked on shows first,
  as replacing it may need asking.
- **Signed out there is one pattern** (assumed from now on: no signed-out browser keeps more). So: Pattern ▸ Open…
  only signed in; the patterns page signed out shows that one pattern (Continue), New and the invitation to sign in,
  no list. Gone: reading libraries saved in localStorage by 1.2.1 and earlier, "kept for good" in the one-pattern
  rule (signed out, replacing an edited pattern still asks first), and tracking whether there are other patterns.
- **One bar on every page** (`ui/common/appBar.module.css`, `AppBrand`): the same height, padding, colour and logo in
  the editor, on My patterns, Threads and Beads, and while a page loads — going between them nothing moves.
- **The same actions on the Continue card, the gallery and the list** (⋯): Open · Download .xbird (the pattern with
  its photo windows, image behind the chart and versions — this browser's and the account's — without opening the
  editor) · Rename… · Duplicate ("Tulips (copy)", its photos shared, not its versions; counts toward the 20) ·
  Photos… (each photo window and the image behind the chart with its picture, size and Remove, and Remove all —
  frees its room in the account; the pattern stays) · Keep in my account (one only in this browser) · Delete… (asked
  first: Cancel · Download .xbird, then delete · Delete). Signed out: Download, Rename, Photos.
- **The list, redone**: a 240 px picture (1.2 × a gallery card's); the name as the title, Open and ⋯ beside it; the figures as label / value
  lines — Size (stitches · cm on its count) · Stitches (colours · stitches · beads · backstitch lines) · Time (spent ·
  edited …) · Space (pattern KB · photos MB · versions). The Continue card shows the same lines.

### 15.38 The account page (2026-11-18)
- `/account`, reached from the account menu (Account, under My patterns): like most apps' settings — the sections in
  a navigation on the left (on a phone, a row on top), the chosen one on the right. For now one section, **Account**;
  more to come (preferences, a profile picture, password…).
- **Account**: who is signed in (email, name, member since), and **Delete account** — what it deletes (the
  patterns, their photos and versions, your own threads and beads, on every device), that it can't be undone, to
  download what to keep first, and that patterns kept only in this browser stay. Deleting asks first: the account's
  email typed to confirm (any case) — Delete my account stays off until it matches.
- Deleting (`DELETE /api/account` `{ email }`, checked against the session): the account's files in storage
  (`users/<id>/`: photos, marks, previews), then the user — and with it, by the database's cascades, its sessions,
  patterns, versions, pictures and windows, threads and beads. This browser's copies of the account's patterns go too;
  then the page says it's done and offers My patterns, signed out.
- Signed out, the page invites to sign in. The privacy policy names both ways to delete (here, at once; or by email).

### 15.39 Signed out: the editor only; every brand from the start (2026-11-18)
- **Signed out there is only the editor.** My patterns, Threads, Beads and Account are for signed-in users: signed
  out they give way to the editor (`ui/account/useSignedInOnly.ts`; nothing of them shows meanwhile), and the logo is
  just the logo. The privacy page stays open to all. Your own threads and beads live in their pattern then; seeing
  the pages they get once signed in is part of the reason to sign in.
- **The account menu** (signed in): My patterns · My threads · My beads · Account, then Sign out — the same in the
  editor (which saves first) and on the other pages.
- **Every brand from the start**: a new pattern — and the demo — has every thread brand (DMC, Anchor, Madeira) and
  every bead brand (Mill Hill, Preciosa), so the picker shows how much is there; fewer can be chosen in the New dialog
  or in the side panel (Threads & beads). Patterns made before keep theirs.
- **A tip, signed out, the first time a thread or bead of your own is being made** (`ownColours`): it's kept inside
  this pattern — and in its .xbird file; with an account it's kept for good, in every pattern, on every device, with
  pages of its own (My threads, My beads).

### 15.40 Space bars on the account page; a proven sign-in; the live banner (2026-11-18)
- **Account ▸ Space in your account**: patterns ("3 of 20") and photos ("42 of 100 MB") as bars — teal while there's
  room, amber from 80 %, red when full — and what to do: remove photos from a pattern (My patterns ▸ ⋯ ▸ Photos) or
  delete patterns (⋯ ▸ Delete), downloading them first as .xbird files to keep them. From 80 % the note says
  "Almost full." in an amber box.
- **Sign in**, the way most apps do it (it was too easy to type the code and hit Cancel, right under it): one column,
  the logo and a title; Continue with Google (with its G); "or"; the email and **Continue with email** under it, full
  width. Then "Check your email — we sent a 6-digit code to …": a big code field that signs in by itself once all six
  digits are in (typed or pasted), Sign in under it, Use another email · Send a new code (after 30 s). No buttons at
  the bottom: ✕, Esc or a click outside closes. A wrong code: said under the field, the field cleared for another
  try; nothing ever stays stuck on "Signing in…".
- **My patterns ▸ "Account storage: 35%"**, by the heading (the pattern count beside it is gone — it didn't match
  the account's): one number for how full the account is — its closer-to-full limit, patterns or photos, as that one
  is what stops you — with a small bar, amber from 80 %, red when full; both limits on hover; it opens the Account
  page.
- **"Being edited in another window"** (§15.34) is a banner across the top of the chart, hard to miss: an amber card,
  an icon, a bold title, the line under it and **Edit here**. Taking over shows a spinning wheel: "Taking over… The
  other window is saving its last changes."

### 15.41 PDFs as references, page by page (2026-11-18)
A chart often comes as a PDF of several pages. A PDF can be added wherever a photo can — behind the chart
(References ▸ Add, or dropped on the editor ▸ Put behind) or as a photo window — and its pages are gone through one
at a time.
- **Pages**: "‹ Page 3 of 12 ›" — in References for the image behind the chart, in the window's own bar for a photo
  window. Drawn in the browser by PDF.js (Apache-2.0, NOTICE.md; loaded only when a PDF is opened) at 4600 px on the
  page's long side (about 400 dpi on A4), "Drawing the page…" meanwhile.
- **Each page where it was**: behind the chart, every page keeps its own placement — position, crop, turn and
  straightening; going back to a page puts it exactly where it was left (straightened again the same way). A new page
  starts fitted to the chart. In a window, every page keeps its own marks.
- **Stored**: the PDF itself — as it came, counted toward the photos' 100 MB, synced to the account (its pages'
  marks too). The page shown is drawn from it: kept in this browser only, drawn again wherever it's missing (another
  device, a work file).
- **Work files (.xbird)**: a PDF travels inside (`pdf.src`), with its pages' places and marks; the page shown goes
  along as an ordinary picture, so older versions still show that page.
- Straightening, Autofill and the rest work on the page shown. A PDF can't be turned into a pattern (drop ▸ no such
  choice).

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
