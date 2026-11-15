/**
 * User-facing release notes (docs/RELEASING.md). The newest release goes first and its `version` must equal the
 * one in package.json (a unit test checks). Write for stitchers: what they can now do, not how it was built.
 */
export interface Release {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  uk: string[];
  en: string[];
}

export const CHANGELOG: readonly Release[] = [
  {
    version: "1.0.0",
    date: "2026-11-15",
    uk: [
      "Перша версія пташечки — редактора для перенабору паперових схем.",
      "Ключ: муліне DMC, бісер Mill Hill, суміші ниток і нитка з бісером.",
      "Фото схеми під стібками: вирівнювання за 4 кутами, рамка для точного підганяння при наближенні, легкий поворот.",
      "Фото ключа чи схеми в окремих вікнах з маркером і затіненням уже вишитого.",
      "Хрестики, половинки, чверті, петіт, бекстіч і французькі вузлики.",
      "Автозбереження в браузері, версії схеми та файли .xbird для копії на пристрої.",
      "Експорт .oxs для Хрестиків і Ruta Stitch, зображення схеми й список покупок.",
    ],
    en: [
      "The first version of пташечка — an editor for e-copies of paper charts.",
      "The key: DMC floss, Mill Hill beads, blends and floss + bead.",
      "The chart photo behind your stitches: straighten by 4 corners, a frame for precise fitting when zoomed in, slight rotation.",
      "Photos of the key or the chart in their own windows, with a marker and shading of what’s already stitched.",
      "Full and half crosses, quarters, petites, backstitch and French knots.",
      "Autosave in the browser, pattern versions and .xbird files to keep a copy on your device.",
      "Export .oxs for Хрестики and Ruta Stitch, chart images and a shopping list.",
    ],
  },
];

/** -1 / 0 / 1 for semantic versions like "1.2.3" (missing parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Releases newer than `seen`, newest first; all of them when nothing was seen yet. */
export const releasesSince = (seen: string | null): Release[] => CHANGELOG.filter((r) => !seen || compareVersions(r.version, seen) > 0);
