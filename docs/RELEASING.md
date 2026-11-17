# Releasing пташечка

Work happens on `dev` (pushed to GitHub as `DEV`: `git push origin dev:DEV`). `main` is production — Vercel deploys
every push to `main`. A release is: a version number, user-facing notes, a tag, and a push to `main`.

## Versions

`package.json` → `version`, in `MAJOR.MINOR.PATCH` form:

| Change | Bump | Example |
|---|---|---|
| Fixes only | PATCH | 1.0.0 → 1.0.1 |
| New features, everything old still works | MINOR | 1.0.1 → 1.1.0 |
| Something old stops working (see Compatibility rules — avoid!) | MAJOR | 1.1.0 → 2.0.0 |

The version is shown in **Menu ▸ What's new** and decides when that dialog opens by itself (once, after an update,
for people who used an older version; brand-new users get the quick-start guide instead).

## Steps

1. On `dev`, finish and check: `pnpm check` (types, lint, unit tests) and `pnpm test:e2e`.
2. Bump `version` in `package.json`.
3. Add the release notes at the **top** of `src/core/release/changelog.ts`: the same version, today's date
   (YYYY-MM-DD), and short user-facing lines in **both** `uk` and `en` (same number of lines). Write for stitchers —
   what they can do now — not how it was built. A unit test fails if the newest entry doesn't match `package.json`.
4. Commit: `git commit -am "Release v1.1.0"`.
   New database migrations (`db/migrations/*.sql`) go to production **before** the push: with the production
   connection string from Vercel in the environment (never in a file),
   `DATABASE_URL_UNPOOLED='…' node scripts/db/migrate.mjs` — it names the host, then rerun with `--target <that host>`.
   Day to day, `.env.local` holds the Neon `dev` branch only (`.env.example`).
5. Publish:
   ```sh
   git push origin dev:DEV
   git checkout main && git merge --ff-only dev
   git tag -a v1.1.0 -m "v1.1.0"
   git push origin main --follow-tags
   git checkout dev
   ```
   Optional GitHub release page: `gh release create v1.1.0 --title "v1.1.0" --notes "…"` (or from the tag on GitHub).
6. Vercel deploys `main`. Open the site: **Menu ▸ What's new** shows the new version.

## Compatibility rules (.xbird files and browser storage)

People keep their work in `.xbird` files and in the browser. Old files must keep opening in every later version.

- Every `.xbird` file says its format version: `"xbird": 1`. Files without it are version 1.
  The current version is `XBIRD_VERSION` in `src/core/formats/json/serialize.ts`.
- **Allowed without a bump:** adding new optional fields that older apps can ignore (they still open the file;
  the new feature is just missing there).
- **A breaking change** is anything an older file or an older app can't handle correctly: renaming or removing a
  field, changing what a field means or its units, changing coordinates, ids or the image encoding, making a new
  field required. It needs:
  1. a deliberate decision (ask first — see below),
  2. `XBIRD_VERSION` + 1,
  3. a step in `XBIRD_MIGRATIONS` (`src/core/formats/json/parse.ts`) that upgrades version N files to N + 1,
  4. a new real fixture `tests/fixtures/xbird-vN.xbird` next to the old ones, and a test that opens it,
  5. a MAJOR version bump and a release note.
- Files from a newer app are refused with a clear message ("made by a newer version — reload the page").
- `tests/fixtures/xbird-v1.xbird` is a real version-1 file. **Never edit or regenerate it**;
  `src/core/formats/xbirdCompat.test.ts` makes sure it always opens.
- The same care applies to what the browser stores (IndexedDB `stitchwork`, `stitchwork.*` localStorage keys):
  read old shapes and upgrade them on load, as the image store already does for old data URLs.

**For the assistant:** before making a change that breaks these rules, stop and tell the user what would break and
what the migration would be — don't make it silently.
