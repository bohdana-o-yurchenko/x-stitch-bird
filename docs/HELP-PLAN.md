# Help pages and Tip of the day — plan

> Drafted 2026-11-24 from `docs/SPEC.md`. **Help pages built the same day** (SPEC §15.59): `/[locale]/help`, the
> texts in `src/ui/help/content.{en,uk}.ts` (those are the source now — this list was the draft), screenshots, "?"
> links. **Tip of the day built the same day** (SPEC §15.60) — the list below was its draft; `core/tips/tips.ts` is the source now.

## How the help is built

- **One page per step of making a pattern**, in the order people go through it (chapters 1–9), plus one about the
  app itself (10). URL: `/[locale]/help/<page>#<question>`, e.g. `/uk/help/draw#replace-in-selection`.
- **Questions, not buttons.** Each one asks the way a stitcher would ("I used the wrong colour in one corner"),
  not the way the menu is named. They're grouped under a few headings on each page.
- **Each answer**: 2–4 short bullets · **Where**: the path to it (Pattern ▾ ▸ Export ▸ …) · **Keys** · a picture
  when the place is hard to describe.
- **Anchors never change** once released (like the reader check's sample ids): tips, the guide and the app's
  dialogs link to them.
- Markers in this plan:
  - ★ **hidden**: no button of its own, or tucked inside another tool. These are why the help exists, and each
    one gets a tip.
  - ⌨ **shortcut tip**: the feature has a key worth learning.
  - 📍 **where tip**: the feature exists, here's where to find it.

---

## 1. Start a pattern — `/help/start`

**Starting**
- How do I start a new pattern? `#new`: Pattern ▾ ▸ New ▸ Blank pattern…; size, fabric, brands. 📍
- I'm copying a paper chart. Where do I begin? `#paper-chart`: the Quick start guide (☰), then chapters 2–4. 📍
- Can I reuse the key of the pattern I have open? `#same-key`: New dialog ▸ Start from ▸ *This pattern's key &
  settings*. ★📍
- How do I turn a photo or drawing into a pattern? `#from-photo`: New ▸ From a photo…; width, colours,
  background, keep the photo as a reference.
- What size and fabric should I pick? Can I change them later? `#size`: Fabric & size ▸ Resize… · Extend
  canvas… · Crop to content; finished size in cm / in.
- My paper chart numbers its rows differently (from 0, from the centre, every 5) `#numbering`: Fabric & size ▸
  Numbering. ★📍
- Which thread and bead brands can this pattern use? `#brands`: New dialog ▸ Threads & beads ▸ Change ▾; later the
  side panel's Threads & beads.
- My kit's floss is just numbers 1, 2, 3, no brand `#organizer`: Threads & beads ▸ Numbered organizer. ★📍
- Where do I write the designer, source and copyright? `#pattern-info`: side panel ▸ Pattern info; what goes into
  the .oxs and what stays only in the .xbird.

**With or without an account**
- Do I need an account? `#account`: signed out you get one pattern in this browser (keep it as .xbird). Signed in
  you get up to 20, on every device.
- Why does starting a new pattern ask "Keep this pattern?" `#keep-pattern`
- Can I install it like an app? `#install`: ☰ ▸ Install the app… (laptops). 📍

## 2. Bring in a chart or a picture — `/help/import`

**A file from another app**
- I have an .oxs file (Хрестики, Ruta Stitch…) `#oxs`: New ▸ From an .oxs or .xsd file…
- I have a Pattern Maker .xsd `#xsd`
- Can I just drag a file in? `#drop`: drop patterns, pictures and PDFs anywhere on the editor. ★📍
- I have a PDF chart from a cross-stitch app `#pdf-chart`: New ▸ From a PDF chart…; what it reads and what it
  can't (scans, photos).
- The PDF reader asks me to set up the key `#pdf-key`: the key step, PDF | Chart, Choose…, leave a symbol out.
- "No pattern could be read" / my PDF is a scan `#pdf-scan`: trace it instead (→ `#underlay`).
- Can I get my pattern back from a PDF I exported here? `#own-pdf`: this app's PDFs carry the pattern inside;
  New ▸ From a PDF chart. ★📍
- The file has colours no brand here has `#unknown-colours`: *My own threads* or *Numbered organizer*.
- I opened a .xbird of a pattern I already have `#xbird-duplicate`: Replace mine · Add as a new pattern.

**Tracing a paper chart**
- How do I put the scan behind the chart and trace over it? `#underlay`: side panel ▸ References ▸ Put behind the chart…
- Scan or photo: which is better? `#scan-vs-photo`
- My photo is crooked or taken at an angle `#straighten`: Straighten (4 corners); the loupe; arrows nudge 1 px. ★
- How do I line it up exactly, block by block? `#line-up`: the edit button in the zoom box; handles, Shift; the
  zoomed-in edit frame; arrows 0.1 cell, Shift+arrows 1 cell. ⌨ U ★
- It's slightly tilted `#rotate`: ↺ ↻ or `[` `]`, 0.2° a step. ⌨ ★
- I moved the image by mistake `#image-undo`: ⌘/Ctrl+Z while editing the image undoes only the image. ⌨ ★
- The image covers my stitches / I can't draw `#edit-vs-behind`: U or Esc puts it behind. ⌨
- My chart is a PDF of several pages `#pdf-pages`: pick the page; ‹ Page 3 of 12 ›; each page keeps its
  placement.
- Can the app fill in the symbols for me? `#autofill`: Autofill (Shift+F); what it needs; Enter accepts, Esc
  declines; *Symbols only*; hold the eye to see under. ⌨📍
- Autofill gets it wrong or finds nothing `#autofill-tips`: line up again (U); stitch more examples; symbols must
  look like the paper's.

**A photo beside the chart**
- How do I keep the paper key or chart in view while I work? `#photo-window`: side panel ▸ References ▸ Open in a
  window…
- Can I tick off what I've copied, on the photo? `#marker`: the window's Marker (colour, size, undo). ★📍
- Can the photo show what I've already stitched? `#shade-stitched`: Shade stitched; Grid overlay follows the
  cell you point at on the chart. ★📍
- Zoom, move, see-through, minimise, rename a window `#window-controls`: double-click the title to rename. ★

## 3. Compose the key — `/help/key`

**Adding entries**
- How do I add a thread? `#add`: + Add to key; type the number, Enter.
- What kinds of entries are there? `#types`: Cross · Back · Knot · Floss+bead · Bead; full or half cross.
- How do I make a blend? `#blend`: 2–3 lines, strands each.
- Floss + bead in one cell `#floss-bead`
- A bead sitting on a grid line, not in a cell `#bead-between`: Bead ▸ Placement ▸ Between cells. ★
- French knots, and how many wraps `#knot`
- Backstitch style and colour on the printed chart `#line-style`
- Stitches of my own `#stamps`: Backstitch ▸ Draw your own… / Placed as (Smyrna crosses hidden for now). ★📍
- Choosing symbols that match my paper chart `#symbols`: the symbol row, All…, draw your own. ★
- My thread isn't in the list `#own-thread`: "+" on the search row; ⧉ duplicates any colour into one of your
  own. ★
- "Same colour already in your key": why, and can I add it anyway? `#duplicate-entry`

**Working with the key**
- I have 40 entries. How do I find one? `#key-search`: from 10 entries on, search, order, group by type. ★
- Switching entries fast `#key-numbers`: 1–9 pick the first nine. ⌨ ★
- Changing an entry after I've drawn with it `#edit-entry`: double-click the row; the chart follows.
- Turning a cross into floss + bead (and back) `#change-type`
- Deleting an entry `#delete-entry`
- Copying an entry `#duplicate-key`

## 4. Draw — `/help/draw`

**Basics**
- How do I draw? `#pencil`: Draw (P). Brush 1–5: Shift+1…5. ⌨ ★
- Lines, rectangles, filling an area `#shapes`: L · R · Shift+R · F. ⌨
- Why won't it draw over stitches that are already there? `#override`: Override (O). ⌨ ★
- Taking a colour from the chart `#picker`: hold Alt/⌥ and click. ⌨ ★
- Moving around and zooming `#navigate`: hold Space; two fingers; pinch; + − 0. ⌨
- Colour / Both / Symbols `#views`
- More room for the chart `#panel`: K hides the side panel; drag its edge to resize it. ⌨ ★

**Kinds of stitches**
- Half crosses `#half`
- Quarter, ¾ and petite stitches `#partial`: the Partial tool; Q switches kind; the nearest corner wins. ⌨ ★
- Backstitch `#backstitch`: click, click; it snaps to half cells; Esc, double-click or right-click ends the line. ⌨ ★
- French knots and beads between cells `#points`
- Beads in a cell `#beads`: a bead takes the whole cell.
- Placing your own stamps `#place-stamp`

**Faster**
- Symmetric design: draw one side, get the others `#mirror`: Mirror (M): left–right, top–bottom, 4-way. ⌨ ★
- I drew one half. Copy it to the other side `#mirror-from-centre`: Transform ▾ ▸ Mirror from centre…
- Copy, paste and move a part `#copy-paste`: S; ⌘/Ctrl C X V; drag; arrows (Shift = 10); Enter places. ⌨
- Select everything of one colour `#select-colour`: Magic wand (W); Shift+click = the whole chart. ⌨ ★
- Turn or flip just a part `#transform-selection`
- **Replace one colour with another, only in an area** `#replace-in-selection`: select ▸ Replace key… ★📍
- Copy from one pattern into another `#paste-other-pattern`: missing key entries come along. ★
- Too many buttons `#toolbar`: ☰ ▸ Toolbar hides line/rectangle/fill and fractional stitches. ★📍

## 5. Check — `/help/check`
- Can the app look for mistakes? `#chart-checks`: side panel ▸ Chart checks; empty cells, lone stitches, near
  symmetry; ‹ › step through; ✕ ignore. ★📍
- Show only one colour `#highlight`: V. ⌨ ★
- Hide beads, backstitch… to see what's under them `#hide-kinds`: the layers button by the zoom. ★📍
- Compare with the paper `#compare`: photo window with Grid overlay; Shade stitched; the image behind, Show and
  opacity.
- Jump to column 47, row 112 `#go-to-cell`: ⌘/Ctrl+G. ⌨ ★
- Mark a cell I'm unsure about and come back later `#ambiguous`: A marks; Shift+A jumps to the next one; ⚑ in the
  status bar. ⌨ ★
- What exactly is in this cell? `#status-bar`: the status bar.
- How many stitches, how much floss to buy? `#totals`: Totals & shopping list.

## 6. Fix problems — `/help/fix`
- Undo, redo `#undo`: ⌘/Ctrl+Z, ⌘⇧Z / Ctrl+Y; what clears the history.
- Go back to how it was an hour ago `#versions`: side panel ▸ Versions ▸ Restore; made by itself before risky
  steps. ★📍
- I used the wrong colour `#wrong-colour`: everywhere → edit the entry; in one area → Replace key…; one patch →
  Magic wand.
- Erase only the backstitch, or only one knot `#eraser-modes`: point the eraser at the line or knot. ★
- Clear a whole area `#clear-area`: select, Delete.
- Everything is one cell off `#shift-all`: ⌘/Ctrl+A, then the arrows. ⌨ ★
- The picture slid out of line after a few blocks `#re-align`: U, the edit frame.
- Too big, too small, needs a margin `#resize`: Resize · Extend canvas · Crop to content · Crop to selection.
- "N new key entries for mirrored half crosses": what happened? `#mirrored-halves`
- **It won't draw!** `#cant-draw`: no entry chosen · override is off · the image is being edited (U) · Autofill
  or the eraser is picked · that kind is hidden · another window is editing.
- "Being edited in another window" `#edit-here`
- "Changed in two places" `#two-places`
- Something else is wrong `#support`: ☰ ▸ Something went wrong?

## 7. Export, print, share — `/help/export`
- Print the chart `#print`: Pattern ▾ ▸ Export ▸ PDF chart to print; preview, paper, cell size.
- Big cells / black & white / just for me `#print-presets`: Full pattern · For me · Black & white · Large print.
  📍
- Several charts in one PDF; key on every page `#print-charts`: + Add chart; Key on every page. ★
- Instructions in the PDF `#print-instructions`: Pattern info ▸ Instructions; `- ` bullets, `# ` headings. ★
- For Pattern Keeper `#pattern-keeper`: what it tracks, what it leaves out.
- To open in Хрестики, Ruta Stitch or another app `#oxs-export`
- Does my app read the file properly? `#reader-check`: ☰ ▸ Does your app read it? 📍
- A picture to post online `#png`: Preview image (stitched) looks like real embroidery. ★📍
- A shopping list `#shopping-list`: CSV
- Everything, photos and versions included `#xbird`: Download work file (.xbird)
- Sending a pattern to someone `#share`: .xbird vs .oxs vs PDF (it carries the pattern too). ★

## 8. Your patterns — `/help/patterns`
- Is my work saved? Where? `#saving`: automatic; the status bar says where; ⌘/Ctrl+S saves at once. ⌨
- All my patterns `#my-patterns`: the logo, or the account menu; gallery or list. 📍
- Rename, duplicate, delete, download `#pattern-actions`: ⋯ on every card. ★
- My account is full `#limits`: 20 patterns, 100 MB of photos; ⋯ ▸ Photos… frees room. ★
- The same pattern on my phone and laptop `#devices`
- Patterns that are only in this browser `#move-to-account`
- How long have I spent on this? `#time-spent`: Versions, Pattern info, Totals. ★
- Backing up `#backup`: .xbird
- Signed out: what happens to my work? `#signed-out`
- Deleting my account `#delete-account`

## 9. Floss and beads — `/help/floss`
- Looking up any colour of any brand `#catalogue`: the Floss and Beads pages (signed in). 📍
- The same colour in another brand `#equivalents`: a colour's panel ▸ In other brands. ★📍
- A shade lighter or darker `#shades`: Lighter & darker; Similar in {brand}. ★
- Which of my patterns use this colour? `#used-in` ★
- Search by colour code (#hex) or colour family `#find-colour` ★
- Adding my own thread, bead or brand `#own-colours`
- Toho, Kreinik and other brands that aren't built in `#missing-brands`
- Floss that's only numbered (kits) → `start#organizer`

## 10. The app — `/help/app`
- Every keyboard shortcut `#shortcuts`: the ⌨ button. 📍
- Shortcuts with a Ukrainian keyboard `#layouts`: they work without switching to English. ★
- Trackpad or mouse `#trackpad`
- Themes, language `#themes`
- The side panel: one section at a time, its height `#side-panel`: the bar at the bottom; drag the handle;
  double-click resets. ★
- The quick start guide again; what's new `#guide`

---

## Tip of the day

**What a tip is**: one sentence plus **Read more** (the help anchor). Two kinds:
- **⌨ shortcut**: "Hold ⌥ and click a stitch to draw with its colour." Keys are shown as this computer shows them
  (`keyNames`, like the ⌨ panel).
- **📍 where**: "Replace one colour with another in just part of the chart: select it (S), then **Replace key…** on
  the bar above the chart." Plus **Show me**: reuse the guide's highlight and `menuReveal`, so the tip opens the
  menu or section and outlines the item. `data-guide` targets already exist for that.

**Data**: `{ id, kind: "shortcut" | "where", help: "draw#replace-in-selection", command?, reveal? }`, with texts in
messages `tips.<id>`. The id is the help anchor, so the link and the tip can't drift apart.

**Making tips personal with data we already have**: feature counts (§15.54) tell *click* from *key* per command.
Keep a small local tally in this browser that never resets, then:
- skip a **where** tip for a feature this person has already used;
- show a **shortcut** tip only to someone who uses the feature by clicking but never by its key;
- otherwise go in list order, most hidden first, and never repeat until the list is through.

**When and where it shows** (to decide): once a day, when the editor opens and nothing else is open, as a small card
in a corner (not a modal). ‹ › to browse, ✕ to close, and "Don't show tips" (also in ☰). It's not shown during the
first-visit guide, or on the first day.

**First tips, most hidden first**

| id | kind | tip |
|---|---|---|
| `replace-in-selection` | 📍 | Select an area (S), then **Replace key…** swaps one colour for another only there |
| `override` | ⌨ | Drawing skips squares that already have stitches. **O** lets you draw over them |
| `picker` | ⌨ | Hold **⌥/Alt** and click a stitch to draw with its colour |
| `ambiguous` | ⌨ | Not sure about a cell? **A** marks it; **Shift+A** takes you back to it later |
| `chart-checks` | 📍 | Side panel ▸ **Chart checks** finds skipped cells and stray stitches |
| `select-colour` | ⌨ | Magic wand (**W**) + **Shift**-click selects every stitch of a colour |
| `key-numbers` | ⌨ | **1–9** pick the first nine key entries |
| `brush` | ⌨ | **Shift+1…5** set the brush size |
| `highlight` | ⌨ | **V** shows only the chosen colour; everything else fades |
| `hide-kinds` | 📍 | The layers button by the zoom hides beads, backstitch or knots for a moment |
| `go-to-cell` | ⌨ | **⌘G / Ctrl+G** jumps to a column and row of your paper chart |
| `mirror` | ⌨ | **M** draws on both sides at once: left–right, top–bottom, 4-way |
| `partial` | ⌨ | **Q** switches between quarter, three-quarter and petite |
| `backstitch` | ⌨ | **Esc**, double-click or right-click ends a backstitch line |
| `line-up` | ⌨ | **U** switches the image behind the chart between editing and tracing |
| `rotate` | ⌨ | **[** and **]** turn a slightly tilted scan by 0.2° |
| `autofill` | ⌨ | **Shift+F**: Autofill reads a 10 × 10 block of symbols off your scan |
| `eraser-modes` | 📍 | Point the eraser at a backstitch line: it erases only the line |
| `versions` | 📍 | Side panel ▸ **Versions**: your pattern as it was an hour or a week ago |
| `drop` | 📍 | Drop a pattern, picture or PDF anywhere on the editor |
| `own-pdf` | 📍 | Lost the work file? New ▸ **From a PDF chart** reads it back from this app's PDF |
| `numbering` | 📍 | Fabric & size ▸ **Numbering**: count from 0 or from the centre, like your paper |
| `paste-other-pattern` | 📍 | Copy in one pattern, paste in another: the key entries come along |
| `stamps` | 📍 | Backstitch ▸ **Draw your own…**: stitches of your own, in one click |
| `shade-stitched` | 📍 | A photo window's **Shade stitched** shows what you've already copied |
| `marker` | 📍 | Tick off lines of the paper key with a photo window's **Marker** |
| `key-search` | 📍 | Long key? Search it by number or name, or group it by type |
| `png` | 📍 | Export ▸ Preview images ▸ **Stitched** looks like real embroidery |
| `print-presets` | 📍 | Print ▸ **Large print** or **Black & white** in one click |
| `equivalents` | 📍 | A colour's panel shows its match in Anchor, Madeira and other brands |
| `toolbar` | 📍 | ☰ ▸ **Toolbar** hides tools you don't use |
| `panel` | ⌨ | **K** hides the side panel for more room |
| `navigate` | ⌨ | Hold **Space** and drag to move around, whatever tool is picked |
| `saving` | ⌨ | Saving is automatic, but **⌘S / Ctrl+S** saves right now |
| `reader-check` | 📍 | ☰ ▸ **Does your app read it?** checks how your app reads .oxs files |

## Decided (2026-11-24)
1. Help inside the app at `/[locale]/help`, uk + en, with **☰ ▸ Help**.
2. "?" links by titles open the matching question (list in SPEC §15.59); none where it would crowd a layout (the
   layers box).
3. Screenshots, cropped to the place with a little around it (`scripts/help-shots.mjs`).
4. The spec was brought up to date first (2026-11-24); answers were written from the code as it is.
