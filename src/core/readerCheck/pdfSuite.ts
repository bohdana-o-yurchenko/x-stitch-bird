import { MADEIRA } from "../catalog/catalog";
import { LINE_INKS } from "../symbols/lineInks";
import { KREINIK, TOHO } from "./oxsSuite";
import { crossNumber, layOut, Painter, type SampleDef } from "./painter";
import { DRAWN_SYMBOL } from "./pkSuite";
import { words as t, type CheckSuite } from "./types";

/*
 * The test chart for the PDF chart to print (SPEC §15.51) — read by people, not apps: every kind of stitch, bead and
 * line on its three chart views, the key and the pages. Numbers are whole crosses of DMC 3799, so they show on every
 * view. 54 × 85 cells with 5 empty all round: two pages across and two down (40 × 56 a page), sharing two rows /
 * columns.
 */

const MADEIRA_ID = MADEIRA.find((e) => /^\d+$/.test(e.code))!.id;

export function pdfSuite(): CheckSuite {
  const pt = new Painter("Перевірка PDF-схеми");
  const p = pt.p;
  p.count = 14;
  p.meta = { ...p.meta, designer: "пташечка", copyright: "2026" };
  p.customs[KREINIK.id] = KREINIK;
  p.customs[TOHO.id] = TOHO;
  p.blends["blend:b11"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] };
  p.blends["blend:b3"] = { parts: [{ id: "dmc:321", n: 1 }, { id: "dmc:3865", n: 1 }, { id: "dmc:798", n: 1 }] };
  p.combos["combo:mh"] = { thread: "dmc:321", bead: "bead:00557" };
  p.brands = ["DMC", "Anchor", "Madeira", "Kreinik"];
  p.beadBrands = ["Mill Hill", "Preciosa", "Toho"];
  const { thread, combo, bead, back, knot, cell, beadAt, part, line, point, block, corners } = pt;
  const square = (src: string, n?: number | null) => (x: number, y: number) => block(x + 1, y + 1, 3, 3, thread(src, n));

  const cross = "crosses", halves = "halves", parts = "partials", beads = "beads", lines = "backstitch", file = "file";
  const defs: SampleDef[] = [
    { id: "dark", group: cross, tags: ["symbols"], what: t("DMC 310 — a symbol on a dark colour", "DMC 310 — символ на темному кольорі"), put: square("dmc:310") },
    { id: "light", group: cross, tags: ["symbols"], what: t("DMC White — a symbol on a light colour", "DMC White — символ на світлому кольорі"), put: square("dmc:White") },
    { id: "strands", group: cross, tags: ["strands", "key"], what: t("DMC 321, 3 strands — the key says 3", "DMC 321, 3 нитки — у ключі 3"), put: square("dmc:321", 3) },
    { id: "brands", group: cross, tags: ["anchor", "madeira"], what: t(`Anchor 403 (left), Madeira ${MADEIRA_ID.split(":")[1]} (right) — brands in the key`, `Anchor 403 (ліворуч), Madeira ${MADEIRA_ID.split(":")[1]} (праворуч) — бренди в ключі`), put: (x, y) => { block(x, y + 1, 3, 3, thread("anchor:403")); block(x + 3, y + 1, 3, 3, thread(MADEIRA_ID)); } },
    { id: "ownThread", group: cross, tags: ["ownThread"], what: t("own thread: Kreinik 032", "своя нитка: Kreinik 032"), put: square(KREINIK.id, 1) },
    { id: "blend", group: cross, tags: ["blend", "key"], what: t("blend 1 DMC 310 + 1 DMC White — the key names both", "бленд 1 DMC 310 + 1 DMC White — у ключі обидві нитки"), put: square("blend:b11") },
    { id: "blend3", group: cross, tags: ["blend"], what: t("blend of three: DMC 321 + 3865 + 798", "бленд із трьох: DMC 321 + 3865 + 798"), put: square("blend:b3") },
    { id: "drawnSymbol", group: cross, tags: ["ownSymbol"], what: t("DMC 550 with a hand-drawn symbol — drawn as drawn", "DMC 550 зі своїм намальованим символом — такий самий у PDF"), put: (x, y) => block(x + 1, y + 1, 3, 3, pt.k({ t: "thread", src: "dmc:550", n: 2, st: "full", sym: DRAWN_SYMBOL })) },
    { id: "mixed", group: cross, tags: ["symbolInks"], what: t("four colours mixed — on the symbol chart some symbols print red, green or blue", "чотири кольори впереміш — на схемі символів частина символів червоні, зелені чи сині"), put: (x, y) => {
      const ks = [thread("dmc:310"), thread("dmc:321", 3), thread("dmc:3865", 1), thread("dmc:798")];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) cell(x + i, y + j, ks[(i * 3 + j * 2 + ((i * j) % 3)) % 4]!);
    } },
    { id: "halves", group: halves, tags: ["half"], what: t("half crosses: ╱ on the left, ╲ on the right", "напівхрестики: ╱ ліворуч, ╲ праворуч"), put: (x, y) => { block(x, y + 1, 3, 3, thread("dmc:798", 2, "half")); block(x + 3, y + 1, 3, 3, thread("dmc:798", 2, "halfb")); } },
    { id: "combo", group: halves, tags: ["combo"], what: t("floss + bead: DMC 321 + Mill Hill 00557, whole crosses", "нитка + бісер: DMC 321 + Mill Hill 00557, хрестики"), put: (x, y) => block(x + 1, y + 1, 3, 3, combo("combo:mh")) },
    { id: "comboHalf", group: halves, tags: ["combo", "half"], what: t("floss + bead as half crosses ╱", "нитка + бісер напівхрестиками ╱"), put: (x, y) => block(x + 1, y + 1, 3, 3, combo("combo:mh", "half")) },
    { id: "threeQuarter", group: parts, tags: ["threeQuarter"], what: t("¾ in each corner: ↖ ↗ ↘ ↙, left to right", "¾ у кожному куті: ↖ ↗ ↘ ↙, зліва направо"), put: (x, y) => corners(x + 1, y + 2, "threeQuarter", thread("dmc:310")) },
    { id: "quarter", group: parts, tags: ["quarter"], what: t("¼ in each corner: ↖ ↗ ↘ ↙", "¼ у кожному куті: ↖ ↗ ↘ ↙"), put: (x, y) => corners(x + 1, y + 2, "quarter", thread("dmc:310")) },
    { id: "petite", group: parts, tags: ["petite"], what: t("petites in each corner: ↖ ↗ ↘ ↙", "петіти в кожному куті: ↖ ↗ ↘ ↙"), put: (x, y) => corners(x + 1, y + 2, "petite", thread("dmc:310")) },
    { id: "shared", group: parts, tags: ["sharedCell", "threeQuarter", "quarter"], what: t("shared cells: two ¾ (left), ¾ + ¼ (middle), half ╱ + ¼ (right)", "спільні клітинки: два ¾ (ліворуч), ¾ + ¼ (посередині), ╱ + ¼ (праворуч)"), put: (x, y) => {
      part(x + 1, y + 2, "threeQuarter", 0, thread("dmc:310"));
      part(x + 1, y + 2, "threeQuarter", 2, thread("dmc:321", 3));
      part(x + 3, y + 2, "threeQuarter", 1, thread("dmc:310"));
      part(x + 3, y + 2, "quarter", 3, thread("dmc:321", 3));
      cell(x + 5, y + 2, thread("dmc:798", 2, "half"));
      part(x + 5, y + 2, "quarter", 0, thread("dmc:321", 3));
    } },
    { id: "fourInCell", group: parts, tags: ["sharedCell", "quarter", "petite"], what: t("four ¼ in one cell (left), four petites in one cell (right)", "чотири ¼ в одній клітинці (ліворуч), чотири петіти (праворуч)"), put: (x, y) => {
      const ks = [thread("dmc:310"), thread("dmc:321", 3), thread("dmc:3865", 1), thread("dmc:798")];
      ([0, 1, 2, 3] as const).forEach((c) => { part(x + 1, y + 2, "quarter", c, ks[c]!); part(x + 4, y + 2, "petite", c, ks[c]!); });
    } },
    { id: "seedBeads", group: beads, tags: ["beadSeed"], what: t("seed beads Mill Hill 00557", "бісер Mill Hill 00557"), put: (x, y) => [1, 3].forEach((i) => beadAt(x + i, y + 2, bead("bead:00557"))) },
    { id: "beadSizes", group: beads, tags: ["beadSize"], what: t("bead sizes: Petite, Size 8, Size 6, Pebble — left to right", "розміри бісеру: Petite, Size 8, Size 6, Pebble — зліва направо"), put: (x, y) => ["bead:40020", "bead:18002", "bead:16002", "bead:05002"].forEach((src, i) => beadAt(x + 1 + i, y + 2, bead(src))) },
    { id: "bugle", group: beads, tags: ["bugle"], what: t("bugle bead Mill Hill 70020", "стеклярус Mill Hill 70020"), put: (x, y) => beadAt(x + 2, y + 2, bead("bead:70020")) },
    { id: "treasure", group: beads, tags: ["treasure"], what: t("charm Mill Hill 12005 (Glass Treasure)", "підвіска Mill Hill 12005 (Glass Treasure)"), put: (x, y) => beadAt(x + 2, y + 2, bead("bead:12005")) },
    { id: "otherBeads", group: beads, tags: ["preciosa", "ownBead"], what: t("Preciosa 00050 (left), your own Toho 11-21 (right)", "Preciosa 00050 (ліворуч), свій Toho 11-21 (праворуч)"), put: (x, y) => { beadAt(x + 1, y + 2, bead("preciosa:00050")); beadAt(x + 4, y + 2, bead(TOHO.id)); } },
    { id: "beadOnCross", group: beads, tags: ["beadOnCross"], what: t("a bead on a whole cross", "бісер на хрестику"), put: (x, y) => { cell(x + 2, y + 2, thread("dmc:3865", 1)); beadAt(x + 2, y + 2, bead("bead:00557")); } },
    { id: "pointBeads", group: beads, tags: ["pointBead", "pointCombo"], what: t("between cells: a bead (left), floss + bead (right)", "між клітинками: бісер (ліворуч), нитка + бісер (праворуч)"), put: (x, y) => { point(x + 2, y + 2, bead("bead:00020", "point")); point(x + 4, y + 3, combo("combo:mh", "point")); } },
    { id: "lineStyles", group: lines, tags: ["lineStyles"], what: t("line styles: solid, dashed, dotted, wave — top to bottom", "стилі ліній: суцільна, штрихи, крапки, хвиля — згори донизу"), put: (x, y) => (["solid", "dashed", "dotted", "wave"] as const).forEach((st, i) => line(x, y + 1 + i, x + 6, y + 1 + i, back(["dmc:310", "dmc:321", "dmc:798", "dmc:3865"][i]!, 1, { sym: `line:${st}` }))) },
    { id: "lineStrands", group: lines, tags: ["backstitch", "strands"], what: t("1 strand (top) and 3 strands (bottom) — thicker", "1 нитка (згори) і 3 нитки (знизу) — товща"), put: (x, y) => { line(x, y + 1, x + 6, y + 1, back("dmc:550", 1)); line(x, y + 3, x + 6, y + 3, back("dmc:550", 3)); } },
    { id: "lineInk", group: lines, tags: ["lineColour"], what: t("a line printed red on the chart (its line colour)", "лінія, надрукована червоним (її колір лінії)"), put: (x, y) => line(x, y + 2, x + 6, y + 2, back("anchor:403", 1, { ink: LINE_INKS[1].hex })) },
    { id: "lineShapes", group: lines, tags: ["backstitch", "halfGrid"], what: t("slanted lines and lines to cells' centres (half grid)", "лінії навскіс і до центрів клітинок (пів сітки)"), put: (x, y) => { line(x, y + 4, x + 3, y + 1, back(KREINIK.id)); line(x + 3, y + 1, x + 4.5, y + 2.5, back(KREINIK.id)); line(x + 4.5, y + 2.5, x + 6, y + 4, back(KREINIK.id)); } },
    { id: "knots", group: lines, tags: ["knot", "knotWraps"], what: t("French knots: DMC 310 (left), a blend (middle), 3 wraps (right)", "французькі вузлики: DMC 310 (ліворуч), бленд (посередині), 3 оберти (праворуч)"), put: (x, y) => { point(x + 1, y + 2, knot("dmc:310")); point(x + 3, y + 2, knot("blend:b11")); point(x + 5, y + 2, knot("dmc:321", 2, 3)); } },
    { id: "views", group: file, tags: ["views"], what: t("three chart views: symbols; symbols on colour; colour with lines and knots", "три схеми: символи; символи на кольорі; колір із лініями й вузликами"), put: null },
    { id: "cover", group: file, tags: ["pages"], what: t("the cover: the name, author, size and a map of the pages", "обкладинка: назва, автор, розмір і карта сторінок"), put: null },
    { id: "overlap", group: file, tags: ["pages"], what: t("pages share two rows / columns, shaded grey on both — the third column of boxes runs over the page edge", "сусідні сторінки повторюють два рядки / стовпці, сірі на обох — третій стовпець рамок перетинає край сторінки"), put: null },
    { id: "rulers", group: file, tags: ["pages"], what: t("numbers every 10 along the edges, the same on every page", "номери кожні 10 по краях, однакові на всіх сторінках"), put: null },
    { id: "key", group: file, tags: ["key"], what: t("the key: every entry with its symbol, brand, number, name, strands and count; beads and lines too", "ключ: кожен рядок із символом, брендом, номером, назвою, нитками й кількістю; бісер і лінії теж"), put: null },
  ];
  const label = thread("dmc:3799");
  return layOut("pdf", pt, defs, { label, margin: 5, perRow: 3, labelW: 8, areaW: 6, areaH: 5, gapX: 1, gapY: 2, number: (n, x, y) => crossNumber(pt, n, x, y, label) });
}
