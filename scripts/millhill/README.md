# Mill Hill catalogue (`src/core/catalog/data/millhill.json`)

Built 2026-11-16 from:
- **Glass beads, packages**: Mill Hill's Glass Bead Inventory, http://www.millhillbeads.com/images/bead_inventory.pdf
  (its text is not extractable; the package sizes and the "+" / "≈" marks are typed into `build_millhill.py`).
- **DMC equivalents**: the DMC to Glass Bead Conversion chart (2015), https://www.wichelt.com/freegraphs/bead_to_dmc_conversion.pdf
- **Treasures**: Wichelt's catalogue, https://www.wichelt.com/VHJlYXN1cmVz/menu/parent?page=1 … 6 (270 items), and
  each item's product photo for its colour.

Steps (download the listing pages to `wt-1.html` … `wt-6.html` and the photos to `thumbs/<code>.img` in one folder):
1. `python3 parse_treasures.py <folder> treasures-raw.json` — code, name, type, shape, size, pieces, photo URL.
2. `python treasure_colours.py treasures-raw.json ../../src/core/catalog/data/dmc.json <folder>/thumbs treasure-colours.json`
   (needs Pillow) — the charm's colour from its photo, away from the backdrop.
3. `python3 build_millhill.py ../../src/core/catalog/data/millhill.json treasures-raw.json treasure-colours.json`
   — rewrites the catalogue: package sizes, added codes, Treasures. Then add the final newline.
