# B11. Pattern Maker `.xsd` — assessment and plan (built 2026-11-23: SPEC §15.56)

> Written 2026-11-19 for BACKLOG B11. **Verdict:** importing is feasible, about **M** as the backlog says, and the format
> is well understood. Writing `.xsd` stays parked: too much of the file is unknown, and it can't be checked without
> Pattern Maker.

## Who reads it already
- **Embroiderly** (formerly Embroidery Studio), Rust, GPL-3.0-or-later — `crates/embroiderly-parsers/src/pmaker/xsd.rs`
  (about 1,500 lines with the data structures). It reads `.xsd` only; nothing in it writes the format.
- **KXStitch does not** read `.xsd` (it reads PCStitch `.pat` and images). The backlog said it did; corrected.
- Licence: GPL-3.0 may be combined with our AGPL-3.0 (§13 of both licences), so writing it from the format or porting
  closely are both fine. Credit Embroiderly in NOTICE.md and the file header either way, as with KXStitch's colour data.

## The format, as Embroiderly reads it
- **Binary, little-endian, Pattern Maker v4 only.** Files start with the signature `0x0510`; anything else is "not a
  file we can read".
- **Fixed-offset layout**, in order: header → size → palette (up to 240 colours: brand id, code, name, RGB, blends of
  2–4, bead flag, strands per stitch type) → per-colour formats → symbols → settings → fabric → info (title, author,
  company, copyright, notes; UTF-8 or Windows-1251 — the browser's `TextDecoder` has both).
- **The stitch grid is lightly scrambled**: 4 random numbers per file, a key derived from them XOR-ed into each value,
  plus simple run-length packing. About 40 lines.
- **Small stitches** (halves, quarters, petites) sit in a separate table, a bit-mask per cell.
- **Lines and points** on the half grid: backstitch, straight stitch, French knot, bead, curve, "special" stitches.
- **Several ranges are skipped as unknown**: 727 + 65 + 206 bytes, plus about 17 KB of library and machine-export data.
  Harmless for reading; the main reason writing is out.

## Mapping onto our model
| Pattern Maker | пташечка |
|---|---|
| full, petite, quarter | `stitches`, petite / quarter partials (same corners as the OXS half grid) |
| half top / bottom | `half` / `halfb`; a half + a quarter in one colour becomes a ¾ stitch; two halves in different colours are simplified |
| backstitch, straight stitch | `segments` (already on the half grid) |
| French knot | `knots` |
| bead | the `beads` layer at a cell centre, otherwise a point bead; rotation dropped |
| blends, bead colours | `blends`, Mill Hill / own colours, matched as `resolveCode` does for OXS |
| brand id (0 = DMC, 1 = Anchor, …) | our DMC, Anchor or Madeira catalogue; other brands become own brands under Pattern Maker's brand name |
| title, author, company, copyright, notes, count, fabric colour | name, designer, publisher, copyright, instructions, `count`, `fabric` |
| curves, special stitches, symbol font glyphs | skipped and counted in `toasts.loadedReport`; our own symbols assigned, as for other apps' OXS |
| larger than 500 × 500 | refused, as with OXS |

## Plan
1. **`src/core/formats/xsd/readXsd.ts`** — the raw structure with `DataView`, bounds-checked, throwing
   `XsdFormatError`. Guard two spots where Embroiderly would hang or panic: a zero-length stitch run loops forever, and
   an unknown line type crashes.
2. **`importXsd.ts`** — to a `Pattern` by the table above, returning `{ pattern, report: { simplified } }`. Move
   `resolveCode` out of `importOxs.ts` so both share it.
3. **Wiring**
   - `readPatternFile` reads everything as text: sniff the bytes first — signature → `.xsd`, `<` → OXS, else JSON.
   - `xsd` in `isPatternFile` (`src/platform/files.ts`), the pickers (`.oxs,.xsd` in `commands/registry.ts` and
     `ui/home/HomeApp.tsx`), and drag & drop.
   - New ▸ "From another app's file…"; `messages/en.json` and `uk.json`; widen `loadedReport`'s wording if needed.
4. **Tests**
   - Committed unit tests on a tiny `.xsd` built in the test itself (a test-only encoder — the scrambling is
     symmetric), so no one else's design is committed.
   - Real files in `tests/fixtures/private`, their tests skipped when the files aren't there.
   - One e2e: open a file → its stitches show, and the report toast.
5. **Docs** — SPEC (its own §15.x), remove B11 from BACKLOG, NOTICE.md credit, release notes.

**Risk:** Embroiderly calls its reader "rather incomplete", and it relies on fixed skips. Other 4.x builds, or files
from SAGA's converter, may be laid out differently — several real files are needed before release.

## Writing `.xsd`: no
- About 17 KB+ of the file has unknown meaning; a writer would have to fill it with something Pattern Maker accepts,
  and only a paid Windows copy of Pattern Maker can tell.
- No open-source writer exists to learn from.
- Little to gain: Хрестики and Ruta Stitch take OXS, and most apps that read `.xsd` read OXS too.
- Rough cost L or more, with an uncertain result. OXS stays the way out.

## Open questions
- **Real `.xsd` files** — purchased charts? Embroiderly's `testdata/patterns/pmaker/piggies.xsd` and `specials.xsd` can
  go in `tests/fixtures/private`; its demo `.xsd` is "All rights reserved", local use only.

## Sources
- [Embroiderly source](https://github.com/embroidery-space/embroiderly) — read at commit `3e55217` (2026-11-14)
- [Embroiderly on LinuxLinks](https://www.linuxlinks.com/embroiderly-cross-platform-desktop-application-designing-cross-stitch-patterns/)
- [KXStitch Handbook](https://docs.kde.org/trunk_kf6/en/kxstitch/kxstitch/index.html)
- [.XSD file extension (FileInfo)](https://fileinfo.com/extension/xsd)
