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
    version: "2.1.1",
    date: "2026-11-19",
    uk: [
      "PDF-схеми з інших програм, крок «Ключ»: PDF лишається там, куди ви його прокрутили, — не стрибає, коли обираєте наступний символ чи повертаєтеся з вкладки «Схема». Вікно більше не змінює висоту, коли рядки розгортаються.",
    ],
    en: [
      "PDF charts from other apps, the key step: the PDF stays where you scrolled it — no jumping when you pick the next symbol or come back from the Chart tab. The window no longer changes height as rows open.",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-11-19",
    uk: [
      "Чи прочитає ваш застосунок? Тестові файли — .oxs, PDF для Pattern Keeper і PDF-схема для друку — з усіма видами стібків, бісеру й ліній, кожен пронумерований. Відкрийте файл у своєму застосунку для вишивання й позначте номер за номером: усе добре чи є проблеми. ☰ ▸ Чи прочитає ваш застосунок?",
      "Наприкінці — підсумок: що саме не працює, напр. «розміри бісеру». Увійшовши, можна зберігати перевірки кількох застосунків.",
      "PDF-схеми з Pattern Maker: бленди зчитуються обома нитками.",
      "Файл .oxs зберігається одразу з меню Експорт — без зайвого запитання.",
      "Файли .oxs з інших програм: бісер Preciosa, зокрема з ниткою, зчитується правильно.",
    ],
    en: [
      "Does your app read it? Test files — the .oxs, the PDF for Pattern Keeper and the PDF chart to print — with every kind of stitch, bead and line, each numbered. Open one in your cross-stitch app and go number by number: all good, or issues. ☰ ▸ Does your app read it?",
      "At the end, a summary of what exactly doesn't work, such as \"bead sizes\". Signed in, you can keep checks of several apps.",
      "PDF charts from Pattern Maker: blends are read with both threads.",
      "The .oxs saves straight from the Export menu — no extra question.",
      ".oxs files from other apps: Preciosa beads, with floss too, are read right.",
    ],
  },
  {
    version: "2.0.1",
    date: "2026-11-19",
    uk: [
      "Схема може мати до 1000 × 1000 стібків. Розмір поза межами виправляється одразу в полі, а не мовчки.",
      "Біля розмірів — Ш і В: видно, де ширина, а де висота.",
    ],
    en: [
      "Patterns can be up to 1000 × 1000 stitches. A size out of range is corrected right in the field, not silently.",
      "W and H next to sizes, so you can tell width from height.",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-11-19",
    uk: [
      "Схеми з інших програм: Нова ▸ З PDF-схеми або З файлу .oxs — застосунок сам зчитає схему й ключ. PDF, збережені в пташечці, відкриваються такими, як були.",
      "PDF як референс: під схемою чи в плаваючому вікні, сторінка за сторінкою.",
      "Обліковий запис: Мої схеми, Мої нитки, Мій бісер і сторінка облікового запису. Фото й PDF зберігаються разом зі схемою.",
      "Одна схема в кількох вікнах чи на кількох пристроях лишається узгодженою: одне редагує, інші бачать зміни.",
      "Більше брендів: Anchor, Madeira, бісер Preciosa — і власні нитки та бісер.",
      "Охайніший редактор: під ключем — по одному інструменту бічної панелі; усе про файл, зокрема експорт, — у меню Схема; клавіатурні скорочення — за кнопкою з клавіатурою.",
      "Без входу — одна робоча схема в браузері; щоб зберегти її, завантажте робочий файл або увійдіть.",
      "На ноутбуці пташечку можна встановити як застосунок — власне вікно й значок: ☰ ▸ Встановити застосунок… Щоб відкритися, їй усе одно потрібен інтернет.",
      "☰ ▸ Щось пішло не так? — напишіть нам.",
      "Багато дрібних покращень і виправлень.",
    ],
    en: [
      "Patterns from other apps: New ▸ From a PDF chart or From an .oxs file — the app reads the chart and its key for you. PDFs saved from пташечка open back as they were.",
      "PDFs as references: behind the chart or in a floating window, page by page.",
      "Your account: My patterns, My threads, My beads and an Account page. Photos and PDFs are kept with the pattern.",
      "The same pattern open in several windows or on several devices stays in step: one edits, the others follow.",
      "More brands: Anchor, Madeira, Preciosa beads — and threads and beads of your own.",
      "A tidier editor: one side-panel tool at a time below the key; everything about the file, export included, in the Pattern menu; keyboard shortcuts behind the keyboard button.",
      "Without signing in, you work on one pattern in this browser; to keep it, download the work file or sign in.",
      "On a laptop, пташечка can be installed as an app — a window and an icon of its own: ☰ ▸ Install the app… It still needs the internet to open.",
      "☰ ▸ Something went wrong? — write to us.",
      "Many smaller improvements and bug fixes.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-11-16",
    uk: [
      "Вхід (за бажанням): через Google або з кодом на пошту. Після входу збережені схеми потрапляють і до вашого облікового запису, тож їх можна відкрити на будь-якому пристрої. Без входу все, як і раніше, лишається у браузері.",
      "У вікні «Відкрити збережену схему» видно, де лежить кожна схема: у цьому браузері, в обліковому записі чи там і там.",
      "Більше місця для схем: збережені схеми й чернетка тепер зберігаються в просторішому сховищі браузера, тож великі схеми більше не впираються в ліміт. Схеми, збережені раніше, переносяться самі.",
      "Політика конфіденційності — внизу головного меню.",
    ],
    en: [
      "Sign in (optional): with Google or a code by email. Once signed in, the patterns you save also go to your account, so you can open them on any device. Without signing in, everything stays in your browser as before.",
      "The Open saved pattern dialog shows where each pattern is: in this browser, in your account, or both.",
      "More room for patterns: saved patterns and the draft now live in the browser’s roomier storage, so big charts no longer hit the limit. Patterns you saved before move over by themselves.",
      "A privacy policy, at the bottom of the main menu.",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-11-16",
    uk: [
      "Підказка про символи, коли вперше додаєте елемент до ключа: виберіть символ або намалюйте свій, точнісінько як на паперовій схемі.",
      "Підказки до автозаповнення нагадують: воно працює найкраще, коли кожен символ ключа такий самий, як на паперовій схемі.",
    ],
    en: [
      "A tip on symbols the first time you add an entry to the key: pick one, or draw your own exactly like the paper chart’s.",
      "Autofill’s guides now remind you: it works best when every key symbol looks exactly like the one on the paper chart.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-11-16",
    uk: [
      "Автозаповнення (Shift+F): позначте вручну кілька клітинок кожного символу, вирівняйте фото на блоці 10 × 10 і клацніть його — застосунок сам прочитає символи з фото. Ставить лише те, у чому певний; ви приймаєте чи відхиляєте, і далі наступний блок. Вчиться на ваших позначках і зберігає вивчене разом зі схемою.",
      "Перевірка схеми: порожні клітинки (до 10), поодинокі стібки й майже-симетрія — вмикаються за бажанням, згруповані, з переходом від однієї знахідки до іншої.",
      "Бісер між клітинками: намистина (з ниткою чи без) може сидіти у вузлі сітки, як французький вузлик.",
      "Mill Hill: Treasures — 269 підвісок і фігурок, кількість у пакетику для кожної серії бісеру та кілька бісерин, яких бракувало.",
      "Бекстіч: свій колір лінії для вигляду «Символи» й схеми для друку; крапкові лінії тепер добре видно.",
      "Експорт «Прев’ю — вишите»: хрестики, як справжні нитки на канві. Кожен PNG підписано «Створено в застосунку пташечка».",
      "Теми названо номерами ниток DMC — 3830, 937, 797, 3350, 550 — і нова справді чорна тема 310.",
      "Свої символи: вирізи тепер білі, а не прозорі, і схема з такими символами рухається плавніше.",
      "Трекпад: два пальці рухають схему плавно й без раптового масштабування, щипок масштабує й фото у вікні, а жест «назад» більше не вмикається.",
      "Виправлено: файл, відкритий з комп’ютера, не губиться, якщо одразу відкрити інший; чернетка не затирається, поки сторінка завантажується; список ключа лишається на тому ж місці після редагування; нова схема починається з порожнього ключа.",
    ],
    en: [
      "Autofill (Shift+F): stitch a few cells of each symbol by hand, line the photo up on a 10 × 10 block and click it — the app reads the symbols off the photo. It fills only what it’s sure about; you accept or decline, then on to the next block. It learns from what you mark and keeps what it learned with the pattern.",
      "Chart checks: empty cells (up to 10), lone stitches and near symmetry — each on when you want it, grouped, with a step from one finding to the next.",
      "Beads between cells: a bead (with or without floss) can sit on a grid point, like a French knot.",
      "Mill Hill: Treasures — 269 charms and shapes, the number of beads per package for every series, and a few beads that were missing.",
      "Backstitch: its own line colour for the Symbols view and the chart to print; dotted lines are easy to see now.",
      "“Preview image — stitched” export: crosses that look like real thread on fabric. Every PNG now says it was made in пташечка.",
      "Themes are named after DMC flosses — 3830, 937, 797, 3350, 550 — plus a new true black theme, 310.",
      "Your own symbols: cut-outs are white instead of see-through, and charts full of them move more smoothly.",
      "Trackpad: two fingers move the chart smoothly with no sudden zoom, pinch zooms photo windows too, and the “back” swipe no longer fires.",
      "Fixed: a file opened from the computer isn’t lost when you open another one straight away; the draft is never overwritten while the page loads; the key list keeps its place after an edit; a new pattern starts with an empty key.",
    ],
  },
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
