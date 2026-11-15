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
    version: "1.1.0",
    date: "2026-11-16",
    uk: [
      "PDF для Pattern Keeper: застосунок сам зчитує схему і номери ниток — нічого не треба вводити вручну.",
      "PDF-схема для друку: обкладинка з картою сторінок, символьна схема з власним ключем, символи на кольорі, кольорова схема з яскравим бекстічем і вузликами, повний ключ. Сусідні сторінки мають спільні сірі рядки, щоб їх легко скласти. Українською чи англійською.",
      "Свій символ: намалюйте його з кіл, прямокутників, трикутників, зірок, ліній і стрілок — суцільних, контурних чи вирізаних, як на паперовій схемі.",
      "Довгий ключ: пошук за номером чи назвою, сортування та групи за типом стібка.",
      "Кнопка «Зняти виділення», а «Видалити» тепер називається «Очистити клітинки».",
      "Рамку фото під схемою легше вхопити за край, а перемикач редагування фото відсунуто від кнопки «вмістити».",
      "Значки дуже світлих і дуже темних ниток добре видно в будь-якій темі, зокрема в темній.",
      "Бічна панель пам’ятає, які розділи згорнуто.",
    ],
    en: [
      "PDF for Pattern Keeper: the app reads the chart and the thread numbers by itself — nothing to type in.",
      "PDF chart to print: a cover with a page map, the symbol chart with its own key, symbols on colour, a colour chart with bright backstitch and knots, and the full key. Neighbouring pages share grey rows so they are easy to join. In Ukrainian or English.",
      "Your own symbol: draw it from circles, rectangles, triangles, stars, lines and arrows — filled, outlined or cut out, to match the paper chart.",
      "Long keys: search by number or name, sort, and group by stitch type.",
      "A “Deselect” button, and “Delete” is now called “Clear cells”.",
      "The frame of the photo behind the chart is easier to grab by its edge, and the photo edit toggle has moved away from “fit”.",
      "Icons of very light and very dark threads stay visible in every theme, including the dark one.",
      "The side panel remembers which sections you folded.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-15",
    uk: [
      "Перша версія пташечки — редактора для перенабору паперових схем.",
      "Ключ: муліне DMC, бісер Mill Hill, суміші ниток і нитка з бісером.",
      "Фото схеми під стібками: вирівнювання за 4 кутами, рамка для точного підганяння при наближенні, легкий поворот.",
      "Фото ключа чи схеми в окремих вікнах з маркером і затіненням уже вишитого.",
      "Хрестики, половинки, чверті, петіт, бекстіч і французькі вузлики; понад 100 символів схеми.",
      "Виділення, копіювання, переміщення й віддзеркалення; підсвічування одного кольору ключа (V).",
      "Автозбереження в браузері, версії схеми та файли .xbird для копії на пристрої.",
      "Експорт .oxs для Хрестиків і Ruta Stitch, зображення схеми й список покупок.",
      "Лічильник часу, витраченого на схему, швидкий посібник, українська й англійська, п’ять кольорових тем.",
    ],
    en: [
      "The first version of пташечка — an editor for e-copies of paper charts.",
      "The key: DMC floss, Mill Hill beads, blends and floss + bead.",
      "The chart photo behind your stitches: straighten by 4 corners, a frame for precise fitting when zoomed in, slight rotation.",
      "Photos of the key or the chart in their own windows, with a marker and shading of what’s already stitched.",
      "Full and half crosses, quarters, petites, backstitch and French knots; over 100 chart symbols.",
      "Select, copy, move and mirror; highlight one key colour at a time (V).",
      "Autosave in the browser, pattern versions and .xbird files to keep a copy on your device.",
      "Export .oxs for Хрестики and Ruta Stitch, chart images and a shopping list.",
      "Time spent on each pattern, a quick-start guide, Ukrainian and English, five colour themes.",
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
