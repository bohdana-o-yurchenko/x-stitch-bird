import { MADEIRA } from "../catalog/catalog";
import { encodeCustomSymbol } from "../symbols/customSymbol";
import { KREINIK, TOHO } from "./oxsSuite";
import { crossNumber, layOut, Painter, type SampleDef } from "./painter";
import { words as t, type CheckSuite } from "./types";

/*
 * The Pattern Keeper test chart (SPEC §15.51): what the PDF for Pattern Keeper carries — whole crosses in one floss,
 * or blended from two flosses of one strand each — and, marked "should be missing", what it leaves out on purpose.
 * Numbers are whole crosses (the PDF carries nothing else), 3 × 5 cells a digit, in DMC 3799. Five boxes to a row and
 * 5 empty cells all round make the chart 84 wide: two pages across (60 columns a page), the fourth column of boxes
 * over the page edge.
 */

const MADEIRA_ID = MADEIRA.find((e) => /^\d+$/.test(e.code))!.id;
/** A hand-drawn symbol: a star with a hole (the PDF has no glyph for it, so it gets a standard one). */
export const DRAWN_SYMBOL = encodeCustomSymbol([{ kind: "star", paint: "fill", x1: 1, y1: 1, x2: 11, y2: 11 }, { kind: "circle", paint: "cut", x1: 4, y1: 4, x2: 8, y2: 8 }])!;

export function pkSuite(): CheckSuite {
  const pt = new Painter("Pattern Keeper check");
  const p = pt.p;
  p.count = 14;
  p.meta = { ...p.meta, designer: "ptashechka" };
  p.customs[KREINIK.id] = KREINIK;
  p.customs[TOHO.id] = TOHO;
  p.blends["blend:b11"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] };
  p.blends["blend:bAnc"] = { parts: [{ id: "dmc:321", n: 1 }, { id: "anchor:403", n: 1 }] };
  p.blends["blend:b21"] = { parts: [{ id: "dmc:310", n: 2 }, { id: "dmc:White", n: 1 }] };
  p.blends["blend:b3"] = { parts: [{ id: "dmc:321", n: 1 }, { id: "dmc:3865", n: 1 }, { id: "dmc:798", n: 1 }] };
  p.combos["combo:mh"] = { thread: "dmc:321", bead: "bead:00557" };
  p.brands = ["DMC", "Anchor", "Madeira", "Kreinik"];
  p.beadBrands = ["Mill Hill", "Toho"];
  const { thread, combo, bead, back, knot, cell, beadAt, line, point, block, corners } = pt;
  const square = (src: string, n?: number | null) => (x: number, y: number) => block(x + 1, y + 1, 3, 3, thread(src, n));

  const cross = "crosses", blends = "blends", symbols = "symbols", out = "leftOut", file = "file";
  const missing = t("Should be missing: the PDF leaves it out (its notes page says so).", "Має бути відсутнім: PDF його не містить (про це сказано на сторінці приміток).");
  const defs: SampleDef[] = [
    { id: "dmc310", group: cross, tags: ["dmc"], what: t("DMC 310, 2 strands — a 3 × 3 square", "DMC 310, 2 нитки — квадрат 3 × 3"), put: square("dmc:310") },
    { id: "dmcWhite", group: cross, tags: ["dmcNamed"], what: t("DMC White", "DMC White"), put: square("dmc:White") },
    { id: "dmcEcru", group: cross, tags: ["dmcNamed"], what: t("DMC Ecru", "DMC Ecru"), put: square("dmc:Ecru") },
    { id: "dmcB5200", group: cross, tags: ["dmcNamed"], what: t("DMC B5200", "DMC B5200"), put: square("dmc:B5200") },
    { id: "strands1", group: cross, tags: ["strands"], what: t("DMC 3865, 1 strand", "DMC 3865, 1 нитка"), put: square("dmc:3865", 1) },
    { id: "strands3", group: cross, tags: ["strands"], what: t("DMC 321, 3 strands", "DMC 321, 3 нитки"), put: square("dmc:321", 3) },
    { id: "anchor", group: cross, tags: ["anchor"], what: t("Anchor 403", "Anchor 403"), put: square("anchor:403") },
    { id: "madeira", group: cross, tags: ["madeira"], what: t(`Madeira ${MADEIRA_ID.split(":")[1]}`, `Madeira ${MADEIRA_ID.split(":")[1]}`), put: square(MADEIRA_ID) },
    { id: "ownThread", group: cross, tags: ["ownThread"], what: t("own thread: Kreinik 032", "своя нитка: Kreinik 032"), put: square(KREINIK.id, 1) },
    { id: "single", group: cross, tags: ["dmc"], what: t("a single cross of DMC 798, alone", "один хрестик DMC 798, окремо"), put: (x, y) => cell(x + 2, y + 2, thread("dmc:798")) },
    { id: "blend11", group: blends, tags: ["blend"], what: t("blend 1 DMC 310 + 1 DMC White — tracked", "бленд 1 DMC 310 + 1 DMC White — має бути"), put: square("blend:b11") },
    { id: "blendBrands", group: blends, tags: ["blend", "anchor"], what: t("blend 1 DMC 321 + 1 Anchor 403 — tracked", "бленд 1 DMC 321 + 1 Anchor 403 — має бути"), put: square("blend:bAnc") },
    { id: "blend21", group: blends, tags: ["leftOut"], absent: true, what: t("blend 2 DMC 310 + 1 DMC White — strands differ", "бленд 2 DMC 310 + 1 DMC White — різна кількість ниток"), how: missing, put: square("blend:b21") },
    { id: "blend3", group: blends, tags: ["leftOut"], absent: true, what: t("blend of three: DMC 321 + 3865 + 798", "бленд із трьох: DMC 321 + 3865 + 798"), how: missing, put: square("blend:b3") },
    { id: "drawnSymbol", group: symbols, tags: ["ownSymbol"], what: t("DMC 550 with a hand-drawn symbol — shown with a standard symbol", "DMC 550 зі своїм намальованим символом — у PDF стандартний символ"), put: (x, y) => block(x + 1, y + 1, 3, 3, pt.k({ t: "thread", src: "dmc:550", n: 2, st: "full", sym: DRAWN_SYMBOL })) },
    { id: "confetti", group: symbols, tags: ["symbols"], what: t("single crosses of four colours mixed (310, 321, 3865, 798)", "окремі хрестики чотирьох кольорів упереміш (310, 321, 3865, 798)"), put: (x, y) => {
      const ks = [thread("dmc:310"), thread("dmc:321", 3), thread("dmc:3865", 1), thread("dmc:798")];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) if ((i + j) % 2 === 0) cell(x + i, y + j, ks[(i + Math.floor(j / 2)) % 4]!);
    } },
    { id: "half", group: out, tags: ["leftOut"], absent: true, what: t("half crosses ╱ and ╲", "напівхрестики ╱ і ╲"), how: missing, put: (x, y) => { block(x + 1, y + 1, 2, 3, thread("dmc:310", 2, "half")); block(x + 3, y + 1, 2, 3, thread("dmc:310", 2, "halfb")); } },
    { id: "partials", group: out, tags: ["leftOut"], absent: true, what: t("¾, ¼ and petite stitches", "¾, ¼ і петіти"), how: missing, put: (x, y) => { corners(x + 1, y + 1, "threeQuarter", thread("dmc:310")); corners(x + 1, y + 2, "quarter", thread("dmc:310")); corners(x + 1, y + 3, "petite", thread("dmc:310")); } },
    { id: "beads", group: out, tags: ["leftOut"], absent: true, what: t("beads: Mill Hill 00557 and your own Toho 11-21", "бісер: Mill Hill 00557 і свій Toho 11-21"), how: missing, put: (x, y) => { beadAt(x + 1, y + 2, bead("bead:00557")); beadAt(x + 3, y + 2, bead(TOHO.id)); } },
    { id: "combo", group: out, tags: ["leftOut"], absent: true, what: t("floss + bead: DMC 321 + Mill Hill 00557", "нитка + бісер: DMC 321 + Mill Hill 00557"), how: missing, put: (x, y) => block(x + 1, y + 2, 3, 1, combo("combo:mh")) },
    { id: "backstitch", group: out, tags: ["leftOut"], absent: true, what: t("backstitch DMC 321", "бекстіч DMC 321"), how: missing, put: (x, y) => { line(x + 1, y + 1, x + 5, y + 1, back("dmc:321")); line(x + 1, y + 4, x + 5, y + 2, back("dmc:321")); } },
    { id: "knots", group: out, tags: ["leftOut"], absent: true, what: t("a French knot and a bead between cells", "французький вузлик і бісер між клітинками"), how: missing, put: (x, y) => { point(x + 2, y + 2, knot("dmc:310")); point(x + 4, y + 3, bead("bead:00557", "point")); } },
    { id: "threadList", group: file, tags: ["key"], what: t("the thread list: every colour by brand and number (DMC, Anchor, Madeira, Kreinik), blends as both flosses", "список ниток: кожен колір із брендом і номером (DMC, Anchor, Madeira, Kreinik), бленди — обома нитками"), put: null },
    { id: "counts", group: file, tags: ["key"], what: t("stitch counts per colour as in пташечка's key (the numbers' DMC 3799 too)", "кількість хрестиків кожного кольору — як у ключі пташечки (і DMC 3799 номерів)"), put: null },
    { id: "pages", group: file, tags: ["pages"], what: t("two pages joined into one chart: the fourth column of boxes runs over the page edge (columns 60 | 61)", "дві сторінки — одна схема: четвертий стовпець рамок перетинає край сторінки (стовпці 60 | 61)"), put: null },
    { id: "notes", group: file, tags: ["info"], what: t("the name \"Pattern Keeper check\"; the notes page lists what was left out", "назва «Pattern Keeper check»; сторінка приміток перелічує, що не ввійшло"), put: null },
  ];
  const label = thread("dmc:3799");
  return layOut("pk", pt, defs, { label, margin: 5, perRow: 5, labelW: 8, areaW: 6, areaH: 5, gapX: 1, gapY: 2, number: (n, x, y) => crossNumber(pt, n, x, y, label) });
}
