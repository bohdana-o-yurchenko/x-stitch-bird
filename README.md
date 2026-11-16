# пташечка (Stitchwork)

Turn a paper cross-stitch chart into a digital one — https://x-stitch-bird.vercel.app

- **Autofill** — put a photo of the chart behind the stitches, stitch a few cells of each symbol by hand, line the
  photo up on a 10 × 10 block and click it: the app reads the symbols off the photo and fills the cells it is sure
  about, for you to accept or decline. Block by block; it learns from what you mark.
- A full cross-stitch and bead editor: key with floss, blends, beads (Mill Hill, Treasures included) and floss + bead,
  half, quarter and petite stitches, backstitch in line styles, French knots, beads between cells.
- Chart checks, versions, photo windows with progress marks, themes, Ukrainian and English.
- Exports: .xbird pattern file, .oxs (Хрестики, Ruta Stitch), PDF for Pattern Keeper, PDF chart to print, PNG
  (including a stitched preview), shopping list CSV.

A Next.js rewrite of the single-file app in `index.html`.

- Behaviour: [`docs/SPEC.md`](docs/SPEC.md)
- Structure and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Run

Requires Node 20.9+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:3000 (redirects to /en)
```

| Command | What it does |
|---|---|
| `pnpm check` | typecheck + lint (incl. level boundaries) + unit tests |
| `pnpm test:coverage` | unit tests with the per-area coverage minimums |
| `pnpm test:e2e` | Playwright journeys against a production build (uses the installed Chrome) |
| `pnpm build && pnpm start` | production build and server |

## Where things are

```
src/core/         domain: pattern model, layers, formats (JSON v4, OXS, CSV), calculator, checks — pure TS
src/render/       canvas drawing (screen + PNG export), theme
src/editor/       state, undo, tools, commands, shortcuts, services — no React
src/ui/           React components
src/persistence/  storage ports + browser adapters
src/app/          Next.js routes; messages/ holds translations (en, uk)
```

`index.html` stays the working single-file app until the new one replaces it. Data saved by the new app uses the same
`localStorage` keys and IndexedDB database names, but lives under its own origin (e.g. `localhost:3000`).
