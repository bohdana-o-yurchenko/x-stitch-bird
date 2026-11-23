# Import parity — what other apps read of our files

What reader apps make of the files пташечка exports, checked by hand against the test charts — on the
**☰ ▸ Does your app read it?** page (`/check`, SPEC §15.51; its **Copy results** gives the text to paste here), or
from `tests/fixtures/oxs-showcase/showcase.oxs` + `showcase.txt`. Numbers (#26) are the sample numbers on the test
chart, the same on the page. "Ours" = what our exporter writes; "Theirs" = what the app shows.

## OXS

### App 1 (not named yet) — checked 2026-11-19, samples #1–#72

| # | Sample | Theirs | Notes / possible fix |
|---|---|---|---|
| 1–25 | whole crosses, blends, half crosses, floss + bead in a cell | ✅ as ours | |
| 26 | bead Mill Hill 40020 (Petite Glass) — `objecttype="bead2mm"` | ❌ missing from the chart **and** the key | The app ignores bead objects it doesn't know. `bead3mm` (#27, Size 8) works. Fix to try: write every bead as `objecttype="bead"` (or only the types the app knows), keeping the size in `comments` / our own attribute. **Fixed 2026-11-23, to re-check:** Petite Glass, Size 6 and Pebble now go out as `bead` (Size 8 stays `bead3mm`). Seen in a real file too: Petite Glass 42012 + DMC 816 between cells came in as a floss with 0 stitches, Glass Treasure 12190 + 816 fine. |
| 28 | bead Mill Hill 16002 (Size 6) — `bead5mm` | ❌ missing, as #26 | as #26 |
| 29 | bead Mill Hill 05002 (Pebble) — `bead6mm` | ❌ missing, as #26 | as #26 |
| 41 vs 42 | ¼ (`objecttype="quarter" petit="false"`) vs petite (`objecttype="petite"`) | ⚠️ both shown as petites (small squares) | The app follows Ursa: a "quarter" object is a miniature cross; it ignores XSPro's `petit="false"`. OXS has no other way to write a quarter (one leg, corner to centre). |
| 46 vs 47 | four ¼ in one cell vs four petites | ⚠️ both the same small squares | as #41/#42 |
| 64 | French knot, DMC 310, 2 strands | ⚠️ strands not shown | The file says `strands="2"` on the palette item "DMC 310 · Black (French knot)". Probably the app shows no strands for knots. |
| 68 | French knot, 2 strands, 3 wraps | ⚠️ strands and wraps lost | Wraps: expected (only in our `stitchwork` attribute). Strands: as #64. |

Other samples: no issues reported.

## Pattern Keeper PDF

Not checked yet.

## PDF chart to print

Not checked yet.
