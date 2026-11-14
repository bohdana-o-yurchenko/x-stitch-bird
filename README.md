# Stitchwork

Cross-stitch and bead pattern designer — a Next.js rewrite of the single-file app in `index.html`.

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
