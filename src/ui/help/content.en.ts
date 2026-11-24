import type { HelpTexts } from "./help";

/** The help pages in English (ids shared with content.uk.ts — see help.ts). */
export const HELP_EN: HelpTexts = {
  title: "Help",
  intro: "How to do things in пташечка, in the order a pattern is made. Can’t find it? Search all questions.",
  search: "Search the help — e.g. replace, backstitch, print",
  noMatch: "Nothing found. Try another word, or write to us: ☰ ▸ Something went wrong?",
  back: "Back to the editor",
  contents: "All help",
  onThisPage: "On this page",
  next: "Next",
  pages: [
    {
      id: "start",
      title: "Start a pattern",
      intro: "A new pattern, its size and fabric, its brands — and whether you need an account.",
      groups: [
        {
          title: "Starting",
          qs: [
            {
              id: "new",
              q: "How do I start a new pattern?",
              a: [
                "**Pattern ▾ ▸ New ▸ Blank pattern…**",
                "Give it a name, the size in stitches (width × height) and the fabric. The finished size in cm is shown as you type.",
                "**Threads & beads** says which brands the pattern uses — every built-in one at first; **Change ▾** to keep fewer.",
              ],
              shot: true,
            },
            {
              id: "paper-chart",
              q: "I’m copying a paper chart. Where do I begin?",
              a: [
                "**☰ ▸ Quick start guide** walks you through it in 10 short steps.",
                "In short: a new pattern of the chart’s size, the key, the chart’s scan behind the stitches, then trace — or let [Autofill](import#autofill) do it block by block.",
              ],
            },
            {
              id: "same-key",
              q: "Can I start a new pattern with the key of the one I have open?",
              a: [
                "In the New dialog, **Start from ▸ This pattern’s key & settings**.",
                "You get the same entries, symbols, brands and fabric, on an empty chart.",
              ],
            },
            {
              id: "from-photo",
              q: "How do I turn a photo or drawing into a pattern?",
              a: [
                "**Pattern ▾ ▸ New ▸ From a photo…**",
                "Choose the width in stitches and the most colours; the preview updates as you go.",
                "**Leave lightest colour unstitched** leaves the background as bare fabric.",
                "Tick **Keep the photo open as a reference window** to have it beside the chart.",
              ],
            },
            {
              id: "size",
              q: "How do I change the size later?",
              a: [
                "Side panel ▸ **Fabric & size** ▸ **Grid size**:",
                "**Resize…** — a new width and height, the design centred or kept at the top-left.",
                "**Extend canvas…** — add cells on any side. **Crop to content** — cut the empty edges off.",
                "All of them can be undone, and a version is saved first.",
              ],
              shot: true,
            },
            {
              id: "numbering",
              q: "My paper chart numbers its rows and columns differently",
              a: [
                "Side panel ▸ **Fabric & size** ▸ **Numbering**: the first column and row, labels every 5 or 10, or **Number from centre**.",
                "The rulers, the status bar, Go to cell, the checks and the printed PDF all follow it.",
              ],
            },
            {
              id: "brands",
              q: "Which thread and bead brands can this pattern use?",
              a: [
                "Side panel ▸ **Threads & beads** (or **Change ▾** in the New dialog). Built in: DMC, Anchor, Madeira, Dimensions; Mill Hill and Preciosa beads.",
                "With one brand and **Only …** ticked, the key form shows no brand tabs — fewer clicks.",
                "Untick **This pattern has beads** if it has none.",
              ],
              shot: true,
            },
            {
              id: "organizer",
              q: "My kit’s floss has only numbers — 1, 2, 3 — no brand",
              a: [
                "Side panel ▸ **Threads & beads** ▸ **Numbered organizer** (for floss, beads, or both).",
                "Each colour is then a number and a colour, and stays in this pattern only.",
              ],
            },
            {
              id: "pattern-info",
              q: "Where do I write the designer, the source and the copyright?",
              a: [
                "Side panel ▸ **Pattern info**.",
                "The top fields go into the .oxs file (other apps show the name and author); the rest are kept in your .xbird file.",
                "**Instructions** are printed on their own pages of the PDF chart.",
              ],
              shot: true,
            },
          ],
        },
        {
          title: "With or without an account",
          qs: [
            {
              id: "account",
              q: "Do I need an account?",
              a: [
                "No. Without one you have the whole editor and one pattern, kept in this browser — download its work file (.xbird) now and then.",
                "Signed in: up to 20 patterns on every device, your own threads and beads everywhere, versions kept in the account.",
                "**Sign in** is at the top right: Google, or a code sent by email.",
              ],
            },
            {
              id: "keep-pattern",
              q: "Why does a new pattern ask “Keep this pattern?”",
              a: [
                "Signed out there is one pattern, so a new one would take its place.",
                "**Download it, then continue** saves the .xbird first; **Sign in to keep it** keeps both; **Replace it** lets the old one go.",
              ],
            },
            {
              id: "install",
              q: "Can I install it like an app?",
              a: [
                "On a laptop: **☰ ▸ Install the app…** — its own window and icon, the same patterns and account.",
                "It still needs the internet to open.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "import",
      title: "Bring in a chart or a picture",
      intro: "Open other apps’ files, read a PDF chart, or put a scan behind the chart and trace it.",
      groups: [
        {
          title: "A file from another app",
          qs: [
            {
              id: "oxs",
              q: "I have an .oxs file (Хрестики, Ruta Stitch …) or a Pattern Maker .xsd",
              a: [
                "**Pattern ▾ ▸ New ▸ From an .oxs or .xsd file…**, or drop the file on the editor.",
                "It always comes in as a new pattern. Stitches the app can’t show are counted in the message that follows.",
              ],
              shot: true,
            },
            {
              id: "drop",
              q: "Can I just drag a file in?",
              a: [
                "Yes — drop a pattern, a picture or a PDF anywhere on the editor.",
                "A picture asks what it should be: a **Floating photo window**, the **Image behind the chart**, or **Turn into pattern**.",
              ],
            },
            {
              id: "pdf-chart",
              q: "I have a PDF chart made by a cross-stitch app",
              a: [
                "**Pattern ▾ ▸ New ▸ From a PDF chart…** reads the chart and the key, not just a picture of them.",
                "It works with PDFs from cross-stitch apps (Pattern Maker, FlossCross, Pattern Keeper-ready files, this app’s own). Not with scans or photos.",
                "If something doesn’t add up, it asks — see [the key step](import#pdf-key).",
                "The PDF is kept behind the chart, lined up, and in a floating window on its key page.",
              ],
            },
            {
              id: "pdf-key",
              q: "The PDF reader asks me to set up the key",
              a: [
                "Each symbol it couldn’t match is listed with its picture, its key line and its cells.",
                "The PDF is on the left, at that key line. **Choose…** a thread or bead, or leave the symbol out.",
                "**Next** works once every symbol is set or left out.",
              ],
            },
            {
              id: "pdf-scan",
              q: "“No pattern could be read” — my PDF is a scan",
              a: [
                "A scan or a PDF of photos has no chart inside to read. Trace it instead:",
                "make a [blank pattern](start#new), put the PDF [behind the chart](import#underlay), its key page in a [photo window](import#photo-window), then use [Autofill](import#autofill).",
              ],
            },
            {
              id: "own-pdf",
              q: "Can I get my pattern back from a PDF I exported here?",
              a: [
                "Yes: this app’s PDFs carry the pattern inside. **Pattern ▾ ▸ New ▸ From a PDF chart…** reads it back exactly.",
                "Photos aren’t in it — the .xbird work file has those.",
              ],
            },
            {
              id: "unknown-colours",
              q: "The file has colours no brand here has",
              a: [
                "You’re asked once: **My own threads** (each keeps its number and colour, in a brand of its own) or **Numbered organizer**.",
              ],
            },
            {
              id: "xbird-duplicate",
              q: "I opened a .xbird of a pattern I already have",
              a: [
                "Signed in, you’re asked: **Replace mine** (yours goes into Versions first) or **Add as a new pattern**.",
                "If the file is exactly what you have, it just opens.",
              ],
            },
          ],
        },
        {
          title: "Tracing a paper chart",
          qs: [
            {
              id: "underlay",
              q: "How do I put the scan behind the chart and trace over it?",
              a: [
                "Side panel ▸ **References** (the picture icon in the bar at the bottom) ▸ **Put behind the chart…** — a scan, photo or PDF.",
                "The straightening window opens: drag 4 corners onto the chart’s grid.",
                "Then draw over it; **Opacity** and **Show** are in the same section.",
              ],
              shot: true,
            },
            {
              id: "scan-vs-photo",
              q: "Scan or photo — which is better?",
              a: [
                "A scan or PDF: flat and sharp, it lines up exactly and Autofill reads it far better.",
                "A photo works too — straighten it by its corners, then fine-tune block by block.",
              ],
            },
            {
              id: "straighten",
              q: "My photo is crooked or taken at an angle",
              a: [
                "References ▸ **Straighten (4 corners)…**: drag each round handle onto a corner of the grid; a magnifier shows while you drag.",
                "Arrow keys move the last corner by one pixel (`Shift` — ten).",
                "Say how many columns and rows the corners take in — the predicted grid is drawn over the photo before you apply.",
              ],
              shot: true,
            },
            {
              id: "line-up",
              q: "How do I line it up exactly, block by block?",
              a: [
                "Press `U` (or the edit button by the zoom) to edit the image; drag it, or drag its handles.",
                "Zoomed in, a frame appears in the middle: drag its side onto a grid line and the photo follows.",
                "Arrow keys nudge by 0.1 cell, `Shift`+arrows by 1. `U` or `Esc` again to stitch.",
              ],
              shot: true,
            },
            {
              id: "rotate",
              q: "The scan is slightly tilted",
              a: [
                "While editing the image, **↺ ↻** above it (or `[` and `]`) turn it 0.2° a step.",
                "The exact angle is in References ▸ **Adjust**.",
              ],
            },
            {
              id: "image-undo",
              q: "I moved the image by mistake",
              a: ["While editing the image, `Ctrl/⌘+Z` undoes the image’s own changes. Your stitches aren’t touched."],
            },
            {
              id: "edit-vs-behind",
              q: "The image covers my stitches and I can’t draw",
              a: [
                "It’s in editing mode: the toolbar is greyed out. Press `U` or `Esc`, or the edit button by the zoom.",
              ],
            },
            {
              id: "pdf-pages",
              q: "My chart is a PDF of several pages",
              a: [
                "You pick the page to start with. Change it any time: **‹ Page 3 of 12 ›** in References (or in the window’s bar).",
                "Each page keeps its own place and straightening.",
              ],
            },
            {
              id: "autofill",
              q: "Can the app fill in the symbols for me?",
              a: [
                "Yes, one 10 × 10 block at a time: **Autofill** in the toolbar, or `Shift+F`.",
                "First: the key, the image behind the chart, and a few cells of each symbol stitched by hand.",
                "Line the block up, click it, look at the faint suggestions: **Accept** (`Enter`) or **Decline** (`Esc`).",
                "**Symbols only** and the held eye help to compare with the scan.",
              ],
              shot: true,
            },
            {
              id: "autofill-tips",
              q: "Autofill gets it wrong or finds nothing",
              a: [
                "Line the block up more closely (`U`), then try again.",
                "Stitch a few more cells by hand — it learns from what you mark.",
                "Make each key symbol look like the paper’s; [draw your own](key#symbols) where none matches.",
              ],
            },
          ],
        },
        {
          title: "A photo beside the chart",
          qs: [
            {
              id: "photo-window",
              q: "How do I keep the paper key in view while I work?",
              a: [
                "Side panel ▸ **References** ▸ **Open in a window…** — a photo, scan or PDF in a window you can move and resize.",
                "The slider in its bar makes it see-through; **—** folds it away.",
              ],
              shot: true,
            },
            {
              id: "marker",
              q: "Can I tick off what I’ve already copied?",
              a: ["The marker button in the window’s bar: paint over key lines or parts of the chart. Colour, size and undo are beside it."],
            },
            {
              id: "shade-stitched",
              q: "Can the photo show what I’ve already stitched?",
              a: [
                "When the window shows the whole chart, the shading button in its bar shades every cell already on the chart.",
                "The grid button draws the pattern’s grid over the photo and follows the cell you point at on the chart.",
              ],
            },
            {
              id: "window-controls",
              q: "How do I zoom, rename or remove a window?",
              a: [
                "Zoom with the wheel or a pinch; move the photo with the hand or a right-drag.",
                "Double-click the title to rename it.",
                "✕ deletes the picture from the pattern (it asks first). To just hide it: References ▸ **Hide**.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "key",
      title: "Compose the key",
      intro: "Every thread, blend, bead and stitch you draw with is an entry in the key.",
      groups: [
        {
          title: "Adding entries",
          qs: [
            {
              id: "add",
              q: "How do I add a thread?",
              a: [
                "**+ Add to key** — the form opens in the side panel.",
                "Type the number and press `Enter`, or pick it in the list. Choose strands and the symbol, then **Add**.",
              ],
              shot: true,
            },
            {
              id: "types",
              q: "What kinds of entries are there?",
              a: [
                "**Cross** (full or half ╱ ╲) · **Back** (backstitch) · **Knot** (French knot) · **Floss+bead** · **Bead**.",
                "Quarter, three-quarter and petite stitches use a cross entry — see [partial stitches](draw#partial).",
              ],
              shot: true,
            },
            {
              id: "blend",
              q: "How do I make a blend?",
              a: [
                "Add a second (and third) line to the entry: each line is a floss with its own strands.",
                "**Find a blend for a colour** suggests pairs of DMC threads close to a colour you pick.",
              ],
            },
            {
              id: "bead-between",
              q: "A bead sits on a grid line, not in a cell",
              a: [
                "A **Bead** entry ▸ **Placement** ▸ **Between cells**; for floss + bead, the stitch **Between cells**.",
                "It goes on the corners and middles of cells, like a French knot.",
              ],
            },
            {
              id: "knot",
              q: "French knots, and how many wraps",
              a: ["A **Knot** entry, with its strands and wraps (1–3). Knots go on the corners, edges and middles of cells."],
            },
            {
              id: "line-style",
              q: "Backstitch style and colour on the printed chart",
              a: [
                "A backstitch entry has a line style (dashes, dots …) and a line colour for the printed chart.",
                "On screen in **Colour** view the line is the thread’s colour; its width grows with strands.",
              ],
            },
            {
              id: "symbols",
              q: "Choosing symbols that match my paper chart",
              a: [
                "The symbol row shows the current one and the next free ones; **All…** has every symbol in tabs.",
                "Nothing alike? **Draw your own symbol…** — circles, squares, stars, lines, arrows; filled, outlined or cut out.",
                "Picking a symbol another entry uses swaps the two.",
              ],
            },
            {
              id: "own-thread",
              q: "My thread isn’t in the list",
              a: [
                "**+** on the search row adds a thread of your own: brand, number, name, colour.",
                "⧉ on any colour (pointing at it) makes a copy of it to change.",
                "Signed in, your own threads are kept in your account for every pattern.",
              ],
            },
            {
              id: "duplicate-entry",
              q: "“Same colour already in your key” — can I add it anyway?",
              a: ["Yes: the button turns into **Add anyway**. Useful for the same floss with a different symbol."],
            },
          ],
        },
        {
          title: "Working with the key",
          qs: [
            {
              id: "key-search",
              q: "I have 40 entries. How do I find one?",
              a: [
                "From 10 entries the key gets a search box, an order (as added · by number · most used) and **Group by type**.",
                "Only the view changes — the chart and the `1`–`9` keys stay as they were.",
              ],
              shot: true,
            },
            {
              id: "key-numbers",
              q: "Switching entries fast",
              a: [
                "`1`–`9` pick the first nine entries (their numbers are on the rows).",
                "Or hold `Alt/⌥` and click a stitch on the chart — see [the picker](draw#picker).",
              ],
            },
            {
              id: "edit-entry",
              q: "Changing an entry after I’ve drawn with it",
              a: [
                "Double-click the row (or ✎). Change the colour, strands, symbol — the chart follows.",
                "Cross ↔ floss + bead can be swapped on the chart; other types can’t once used.",
              ],
            },
            {
              id: "duplicate-key",
              q: "Copying an entry",
              a: ["⧉ on the row opens the form with a copy — change what differs and add it."],
            },
            {
              id: "delete-entry",
              q: "Deleting an entry",
              a: ["✕ on the row. It asks first and says how many stitches go with it. Undo brings everything back."],
            },
          ],
        },
      ],
    },
    {
      id: "draw",
      title: "Draw",
      intro: "Tools, kinds of stitches, and the ways to draw faster.",
      groups: [
        {
          title: "Basics",
          qs: [
            {
              id: "pencil",
              q: "How do I draw?",
              a: [
                "Pick an entry in the key, then **Draw** (`P`) and click or drag on the chart.",
                "Brush size 1–5: the numbers next to it, or `Shift+1` … `Shift+5`.",
              ],
              shot: true,
            },
            {
              id: "shapes",
              q: "Lines, rectangles and filling an area",
              a: [
                "Line `L` · rectangle outline `R` · filled rectangle `Shift+R` · fill `F`.",
                "Fill takes the area of one colour (or of empty cells) you click in.",
              ],
            },
            {
              id: "override",
              q: "Why won’t it draw over stitches that are already there?",
              a: [
                "By default drawing fills only empty cells, so you can’t spoil what’s done.",
                "**Override** (`O`) lets it replace what’s there. Press `O` again to go back.",
              ],
              shot: true,
            },
            {
              id: "picker",
              q: "Taking a colour from the chart",
              a: [
                "Hold `Alt/⌥` and click a stitch: its entry becomes the one you draw with.",
                "Or the picker tool, `I`.",
              ],
            },
            {
              id: "navigate",
              q: "Moving around and zooming",
              a: [
                "Hold `Space` and drag, whatever the tool. On a trackpad: two fingers move, a pinch zooms.",
                "`+` and `−` zoom, `0` fits the whole chart. A mouse wheel zooms.",
              ],
            },
            {
              id: "views",
              q: "Colour, Both, Symbols",
              a: [
                "The switch above the zoom. **Colour** to check colours, **Symbols** to compare with a paper chart, **Both** for everything.",
              ],
            },
            {
              id: "panel",
              q: "More room for the chart",
              a: [
                "`K` hides and shows the side panel (also the button at the top right).",
                "Drag the panel’s left edge to make it wider or narrower; double-click it for the usual width.",
              ],
            },
          ],
        },
        {
          title: "Kinds of stitches",
          qs: [
            {
              id: "half",
              q: "Half crosses",
              a: ["A cross entry with **Stitch** ╱ or ╲. Each direction is its own entry with its own symbol."],
            },
            {
              id: "partial",
              q: "Quarter, three-quarter and petite stitches",
              a: [
                "The **Partial** tool; the kind is beside it, or press `Q` to switch.",
                "The corner nearest the pointer gets it; several can share a cell.",
                "They use your cross entries — no separate entries needed.",
              ],
              shot: true,
            },
            {
              id: "backstitch",
              q: "Backstitch",
              a: [
                "Pick a backstitch entry and **Draw**: click, click, click — each click adds a line from the last point.",
                "Points snap to cell corners and the middles of cells.",
                "`Esc`, a double-click or a right-click ends the line.",
              ],
            },
            {
              id: "points",
              q: "French knots and beads between cells",
              a: ["Pick the entry and click where it goes — corners, edges and middles of cells. Dragging places one at each point."],
            },
            {
              id: "beads",
              q: "Beads in a cell",
              a: ["A bead takes its whole cell: it doesn’t go on top of a stitch unless [Override](draw#override) is on."],
            },
          ],
        },
        {
          title: "Faster",
          qs: [
            {
              id: "mirror",
              q: "A symmetric design — draw one side, get the others",
              a: ["**Mirror** (`M`) switches: off → left–right → top–bottom → all four. A dashed line shows the axis."],
            },
            {
              id: "mirror-from-centre",
              q: "I drew one half — copy it to the other side",
              a: ["**Transform ▾ ▸ Mirror from centre…** — left to right, top to bottom, or one quarter to all four."],
            },
            {
              id: "copy-paste",
              q: "Copy, paste and move a part",
              a: [
                "**Select** (`S`) and drag a box; `Shift` adds to it.",
                "Drag inside to move it; arrow keys nudge (`Shift` — 10 cells).",
                "`Ctrl/⌘+C`, `X`, `V`. A pasted piece follows the pointer: click or `Enter` places it, `Esc` cancels.",
              ],
            },
            {
              id: "select-colour",
              q: "Selecting everything of one colour",
              a: [
                "**Magic wand** (`W`): click — the connected cells of that entry.",
                "`Shift`+click — every cell of it on the chart.",
              ],
            },
            {
              id: "transform-selection",
              q: "Turning or flipping just a part",
              a: ["Select it; the bar above the chart has flip ↔, flip ↕ and rotate 90°."],
            },
            {
              id: "replace-in-selection",
              q: "Replacing one colour with another — only in an area",
              a: [
                "Select the area (`S`, or the magic wand), then **Replace key…** on the bar above the chart.",
                "Left: the entries in the selection; right: what one becomes. Only the selected cells change.",
                "To change a colour everywhere, [edit the entry](key#edit-entry) instead.",
              ],
              shot: true,
            },
            {
              id: "paste-other-pattern",
              q: "Copying from one pattern into another",
              a: [
                "Copy, then — without leaving the editor — **Pattern ▾ ▸ New** or **Open .xbird work file…**, and paste. Key entries it doesn’t have are added.",
                "Going to My patterns empties the clipboard.",
              ],
            },
            {
              id: "toolbar",
              q: "Too many buttons",
              a: [
                "**☰ ▸ Toolbar** hides the line, rectangle and fill tools and the fractional stitches.",
                "Their keys still work.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "check",
      title: "Check",
      intro: "Find mistakes before you stitch or share.",
      groups: [
        {
          title: "Looking for mistakes",
          qs: [
            {
              id: "chart-checks",
              q: "Can the app look for mistakes?",
              a: [
                "Side panel ▸ **Chart checks**: tick what to look for — **Empty cells**, **Lone stitches**, **Near symmetry** — and **Run checks**.",
                "‹ › step through what’s found; the chart jumps to each. ✕ hides one for now.",
                "Nothing on the chart is changed.",
              ],
              shot: true,
            },
            {
              id: "highlight",
              q: "Showing only one colour",
              a: ["`V`, or the eye in the key’s header: the chosen entry stays, everything else fades."],
            },
            {
              id: "hide-kinds",
              q: "Hiding beads, backstitch or knots to see what’s under them",
              a: [
                "The layers button by the zoom: untick a kind. **Show all** brings everything back.",
                "Hidden kinds are left alone by the eraser and the picker.",
              ],
              shot: true,
            },
            {
              id: "compare",
              q: "Comparing with the paper",
              a: [
                "Switch to **Symbols**, and set the image behind the chart’s **Opacity** in References.",
                "Or a [photo window](import#photo-window) with its grid on — it follows the cell you point at.",
              ],
            },
            {
              id: "go-to-cell",
              q: "Jumping to column 47, row 112",
              a: ["`Ctrl/⌘+G`, then type the column and row as the paper numbers them."],
            },
            {
              id: "ambiguous",
              q: "Marking a cell I’m unsure about",
              a: [
                "Point at the cell and press `A` — a small corner mark. `A` again takes it off.",
                "`Shift+A` (or **⚑ N ambiguous** in the status bar) jumps to the next one.",
                "Marks never print or export; **▾** next to the count clears them all.",
              ],
              shot: true,
            },
            {
              id: "status-bar",
              q: "What exactly is in this cell?",
              a: ["Point at it: the status bar at the bottom shows its column and row and everything in it."],
            },
            {
              id: "totals",
              q: "How many stitches, and how much floss to buy?",
              a: ["Side panel ▸ **Totals & shopping list**: counts by kind of stitch, and the skeins and beads to buy."],
            },
          ],
        },
      ],
    },
    {
      id: "fix",
      title: "Fix problems",
      intro: "Undo, go back in time, and what to do when something doesn’t work.",
      groups: [
        {
          title: "Going back",
          qs: [
            {
              id: "undo",
              q: "Undo and redo",
              a: [
                "`Ctrl/⌘+Z` undoes; `Ctrl/⌘+Shift+Z` (or `Ctrl+Y`) redoes — up to 60 steps.",
                "Opening another pattern starts the history afresh — [Versions](fix#versions) go further back.",
              ],
            },
            {
              id: "versions",
              q: "Going back to how it was an hour ago",
              a: [
                "Side panel ▸ **Versions** (the clock icon): copies saved every few minutes and before every big change.",
                "**Restore** — the current state is saved as a version first, so nothing is lost.",
              ],
              shot: true,
            },
          ],
        },
        {
          title: "Fixing the chart",
          qs: [
            {
              id: "wrong-colour",
              q: "I used the wrong colour",
              a: [
                "Everywhere: [edit the entry](key#edit-entry) — the chart follows.",
                "In one area: [Replace key…](draw#replace-in-selection).",
                "One patch: the [magic wand](draw#select-colour), then draw or replace.",
              ],
            },
            {
              id: "eraser-modes",
              q: "Erasing only the backstitch, or only one knot",
              a: [
                "Point the eraser at a line: it’s highlighted, and only lines are erased.",
                "The same for a knot or a bead between cells. Anywhere else the eraser clears whole cells.",
              ],
            },
            {
              id: "clear-area",
              q: "Clearing a whole area",
              a: ["Select it and press `Delete` (or **Clear cells** on the bar)."],
            },
            {
              id: "shift-all",
              q: "Everything is one cell off",
              a: ["`Ctrl/⌘+A` selects all; arrow keys move it, then click outside or `Esc`."],
            },
            {
              id: "re-align",
              q: "The image behind slid out of line after a few blocks",
              a: ["Line it up again on the block you’re on: `U`, drag the frame’s side onto a grid line — see [lining up](import#line-up)."],
            },
            {
              id: "resize",
              q: "Too big, too small, or I need a margin",
              a: [
                "**Fabric & size** ▸ **Resize…**, **Extend canvas…**, **Crop to content** — or select and **Crop to selection**.",
              ],
            },
            {
              id: "mirrored-halves",
              q: "“New key entries for mirrored half crosses” — what happened?",
              a: [
                "Flipping or turning the chart turns ╱ into ╲. Each direction is its own entry, so the missing ones were made, with new symbols.",
              ],
            },
          ],
        },
        {
          title: "Something doesn’t work",
          qs: [
            {
              id: "cant-draw",
              q: "It won’t draw!",
              a: [
                "No entry is chosen — pick one in the key.",
                "The cell already has a stitch — turn on [Override](draw#override) (`O`).",
                "The image behind the chart is being edited (toolbar greyed out) — press `U`.",
                "Autofill, the picker or the eraser is the tool — press `P`. Or that kind is [hidden](check#hide-kinds).",
              ],
            },
            {
              id: "edit-here",
              q: "“Being edited in another window”",
              a: [
                "The pattern is open somewhere else too; that window edits, this one follows.",
                "**Edit here** takes over — the other window saves its last changes first.",
              ],
            },
            {
              id: "two-places",
              q: "“Changed in two places”",
              a: [
                "It was changed here and elsewhere (offline, for example). Both are shown — pick one.",
                "The other is kept in [Versions](fix#versions), so nothing is lost.",
              ],
            },
            {
              id: "support",
              q: "Something else is wrong",
              a: ["**☰ ▸ Something went wrong?** — write to us. A screenshot and the work file help most."],
            },
          ],
        },
      ],
    },
    {
      id: "export",
      title: "Export, print, share",
      intro: "A PDF to stitch from, files for other apps, pictures and a shopping list.",
      groups: [
        {
          title: "Printing",
          qs: [
            {
              id: "print",
              q: "Printing the chart",
              a: [
                "**Pattern ▾ ▸ Export ▸ PDF chart to print** — settings on the left, the real pages on the right.",
                "Paper (A4 or Letter, portrait or landscape), cell size, rows shared between pages.",
                "**Download PDF**.",
              ],
              shot: true,
            },
            {
              id: "print-presets",
              q: "Big cells, black and white, just for me",
              a: ["The buttons on top: **Full pattern** · **For me** · **Black & white** · **Large print**. Change anything after."],
            },
            {
              id: "print-charts",
              q: "Several charts in one PDF, a key on every page",
              a: [
                "**+ Add chart**: each chart has its own look for crosses and backstitch.",
                "**Key on every page** puts the entries a page uses under it.",
              ],
            },
            {
              id: "print-instructions",
              q: "Instructions in the PDF",
              a: [
                "Write them in **Pattern info** ▸ **Instructions**.",
                "A line starting with `- ` is a bullet, `# ` a heading; an empty line starts a new paragraph.",
              ],
            },
          ],
        },
        {
          title: "Other apps",
          qs: [
            {
              id: "pattern-keeper",
              q: "A PDF for Pattern Keeper",
              a: [
                "**Pattern ▾ ▸ Export ▸ PDF for Pattern Keeper**. It holds full crosses only — that’s what Pattern Keeper tracks.",
                "You’re told what’s left out. For everything, print the PDF chart.",
              ],
            },
            {
              id: "oxs-export",
              q: "Opening my pattern in Хрестики, Ruta Stitch or another app",
              a: ["**Pattern ▾ ▸ Export ▸ Open Cross Stitch file (.oxs)**."],
            },
            {
              id: "reader-check",
              q: "Does my app read the file properly?",
              a: [
                "**☰ ▸ Does your app read it?** — test files with every kind of stitch, numbered.",
                "Open one in your app and mark each **All good** or **Issues**.",
              ],
            },
          ],
        },
        {
          title: "Files and pictures",
          qs: [
            {
              id: "png",
              q: "A picture to show off",
              a: [
                "**Pattern ▾ ▸ Export ▸ Preview images ▸ stitched** looks like real embroidery.",
                "**Chart images** are the chart with its key, as PNG.",
              ],
              shot: true,
            },
            {
              id: "shopping-list",
              q: "A shopping list",
              a: ["**Export ▸ Shopping list (CSV)** — opens in Excel or Google Sheets."],
            },
            {
              id: "xbird",
              q: "Keeping everything — photos and versions included",
              a: [
                "**Pattern ▾ ▸ Download work file (.xbird)…** — the whole pattern with its pictures and versions.",
                "Open it again with **Open .xbird work file…**, on any computer.",
              ],
            },
            {
              id: "share",
              q: "Sending a pattern to someone",
              a: [
                "To print or stitch from: the PDF chart (it also carries the pattern, readable here).",
                "To edit in this app: the .xbird. In another app: the .oxs.",
              ],
            },
          ],
        },
      ],
    },
    {
      id: "patterns",
      title: "Your patterns",
      intro: "Saving, finding your patterns, and your account.",
      groups: [
        {
          title: "Saving",
          qs: [
            {
              id: "saving",
              q: "Is my work saved? Where?",
              a: [
                "Yes, by itself, a few seconds after you stop. The status bar says where: this browser or your account.",
                "`Ctrl/⌘+S` saves right now.",
              ],
            },
            {
              id: "signed-out",
              q: "Without an account — what happens to my work?",
              a: [
                "One pattern is kept in this browser. Browsers can wipe what they keep, so download the [work file](export#xbird) now and then.",
              ],
            },
            {
              id: "time-spent",
              q: "How long have I spent on this pattern?",
              a: ["Counted by itself while you work. Shown in **Versions**, **Pattern info** and **Totals**."],
            },
          ],
        },
        {
          title: "With an account",
          qs: [
            {
              id: "my-patterns",
              q: "Where are all my patterns?",
              a: [
                "Click the logo, or **My patterns** in the account menu (top right).",
                "Gallery or list; the list shows size, stitches, time and space for each.",
              ],
            },
            {
              id: "pattern-actions",
              q: "Rename, duplicate, download or delete a pattern",
              a: ["**⋯** on its card: Open · Download .xbird · Rename… · Duplicate · References… · Delete…"],
            },
            {
              id: "limits",
              q: "My account is full",
              a: [
                "An account holds 20 patterns and 100 MB of photos. Nothing is lost past it — the work stays in this browser.",
                "To make room: **⋯ ▸ References…** removes a pattern’s photos, or delete a pattern (download it first).",
              ],
            },
            {
              id: "devices",
              q: "The same pattern on my laptop and tablet",
              a: [
                "Signed in, it’s on every device. Open in two windows at once, one edits and the other follows.",
              ],
            },
            {
              id: "move-to-account",
              q: "Patterns that are only in this browser",
              a: ["My patterns marks them; **Move to my account** (or **⋯ ▸ Keep in my account**) puts them in."],
            },
            {
              id: "delete-account",
              q: "Deleting my account",
              a: ["Account menu ▸ **Account** ▸ **Delete account…** Download what you want to keep first."],
            },
          ],
        },
      ],
    },
    {
      id: "floss",
      title: "Floss and beads",
      intro: "Every colour of every brand, equivalents, and your own threads and beads.",
      groups: [
        {
          title: "The catalogue",
          qs: [
            {
              id: "catalogue",
              q: "Looking up any colour of any brand",
              a: ["Signed in: **Floss** and **Beads** at the top of My patterns (and in the account menu)."],
            },
            {
              id: "find-colour",
              q: "Finding a colour by number, name, code or family",
              a: [
                "The search takes a number, a name, `dmc 310` or a colour code like `#7A9CC6`.",
                "The dots pick a colour family; sort by colour or light to dark.",
              ],
            },
            {
              id: "equivalents",
              q: "The same colour in another brand",
              a: [
                "Click a colour: its panel shows **In other brands** — from the maker’s chart where there is one, else the nearest by colour.",
              ],
            },
            {
              id: "shades",
              q: "A shade lighter or darker, or something similar",
              a: ["The colour’s panel: **Lighter & darker** and **Similar in** a brand."],
            },
            {
              id: "used-in",
              q: "Which of my patterns use this colour?",
              a: ["The colour’s panel ▸ **In your patterns**. **In my patterns** at the top shows only colours you’ve used."],
            },
          ],
        },
        {
          title: "Your own",
          qs: [
            {
              id: "own-colours",
              q: "Adding my own thread, bead or brand",
              a: [
                "**+ Floss** / **+ Bead** on those pages, or **+** in the key form.",
                "A brand of your own (Kreinik, Toho, Weeks Dye Works …) is made by giving its name.",
              ],
            },
            {
              id: "missing-brands",
              q: "My brand isn’t built in",
              a: ["Add the colours you use as your own — they keep their brand’s name and go into .oxs files with it."],
            },
          ],
        },
      ],
    },
    {
      id: "app",
      title: "The app",
      intro: "Shortcuts, looks, and small comforts.",
      groups: [
        {
          title: "Keys and looks",
          qs: [
            {
              id: "shortcuts",
              q: "Every keyboard shortcut",
              a: [
                "The keyboard button ⌨ at the top right lists them all.",
                "On a Mac `⌘` and `⌥`; elsewhere `Ctrl` and `Alt` — the help writes `Ctrl/⌘`.",
              ],
              shot: true,
            },
            {
              id: "layouts",
              q: "Shortcuts with a Ukrainian keyboard",
              a: ["They work without switching to English: the key is read by where it is, so `P` is also З."],
            },
            {
              id: "themes",
              q: "Colours and language",
              a: ["**☰** ▸ the theme dots (named after DMC floss) and the language. The chart itself never changes colour."],
            },
            {
              id: "side-panel",
              q: "The side panel’s sections",
              a: [
                "The icons along its bottom: References, Chart checks, Totals | Fabric & size, Threads & beads, Pattern info, Versions.",
                "One opens at a time under the key; drag the line above it to give it more room, double-click for the usual height.",
              ],
              shot: true,
            },
            {
              id: "tips",
              q: "Tip of the day",
              a: [
                "Once a day the editor shows a small tip in its corner: a shortcut for something you do, or a feature you haven’t found yet. It picks ones that are new to you.",
                "**Show me** points at the place; **Read more** opens its help; ‹ › show the others.",
                "**☰ ▸ Tip of the day** brings it any time; untick **Show a tip each day** to stop it coming by itself.",
              ],
            },
            {
              id: "guide",
              q: "The quick start guide again, and what’s new",
              a: ["**☰ ▸ Quick start guide** and **☰ ▸ What’s new**."],
            },
          ],
        },
      ],
    },
  ],
};
