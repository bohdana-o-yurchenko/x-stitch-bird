import { PAGE, type PageBox } from "./pdfLayout";

export type { PageBox };

/*
 * What goes into the PDF chart to print and how it's laid out (SPEC §15.10c): a list of charts, each with its own
 * colouring, cell size, key under every page, shared rows and key after it; then the pages around them (cover,
 * instructions, materials) and the paper. Presets fill the list.
 */

/** Cell size in mm; "auto" is about 40 stitches across, bigger for small charts. */
export type CellSize = "auto" | 2.5 | 3.5 | 4.6 | 6 | 8;
export const CELL_SIZES: readonly CellSize[] = ["auto", 2.5, 3.5, 4.6, 6, 8];
export type Paper = "a4" | "letter";
export const OVERLAPS = [0, 2, 3] as const;

/**
 * How the crosses (and half crosses, partial stitches, beads) look: black symbols on white; symbols black with red /
 * green / blue where crowded; symbols on pale colours (lines stand out); symbols on the thread colours.
 */
export const CROSSES = ["bw", "contrast", "muted", "real"] as const;
export type Crosses = (typeof CROSSES)[number];
/** How backstitch and French knots look: not shown; black in their line styles; bright colours; thread colours. */
export const LINES = ["hidden", "bw", "contrast", "real"] as const;
export type Lines = (typeof LINES)[number];

export interface ChartSpec {
  crosses: Crosses;
  lines: Lines;
  cell: CellSize;
  /** Under each page, the entries it uses. */
  pageKey: boolean;
  /** Rows / columns neighbouring pages repeat. */
  overlap: (typeof OVERLAPS)[number];
  /** This chart's own key, straight after it. */
  key: boolean;
}

export interface PrintOptions {
  charts: ChartSpec[];
  /** The pattern's picture, name, designer and ©. */
  cover: boolean;
  /** What is on which page, and how the chart pages fit together. */
  contents: boolean;
  instructions: boolean;
  /** What to buy: threads, beads, fabric (the shopping list). */
  materials: boolean;
  paper: Paper;
  landscape: boolean;
}

/** At most this many charts in one file. */
export const MAX_CHARTS = 8;

export const chart = (crosses: Crosses, lines: Lines, more: Partial<ChartSpec> = {}): ChartSpec => ({ crosses, lines, cell: "auto", pageKey: true, overlap: 2, key: true, ...more });

const around = { cover: true, contents: true, instructions: true, materials: true, paper: "a4", landscape: false } as const;

/** The PDF as it was before the settings: symbol chart and its key, symbols on colour, colour with backstitch and the key. */
export const PLAIN_PRINT: PrintOptions = {
  ...around,
  cover: false,
  materials: false,
  charts: [chart("contrast", "hidden", { pageKey: false }), chart("real", "hidden", { pageKey: false, key: false }), chart("muted", "contrast", { pageKey: false })],
};

export const PRESETS = {
  full: { ...around, charts: [chart("contrast", "hidden"), chart("real", "hidden", { key: false }), chart("muted", "contrast")] },
  me: { ...around, materials: false, charts: [chart("contrast", "contrast", { cell: 6 })] },
  bw: { ...around, charts: [chart("bw", "hidden"), chart("bw", "bw", { key: false })] },
  large: { ...around, materials: false, charts: [chart("bw", "bw", { cell: 8 })] },
} satisfies Record<string, PrintOptions>;
export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
export const DEFAULT_PRINT: PrintOptions = PRESETS.full;

const sameChart = (a: ChartSpec, b: ChartSpec) => (Object.keys(a) as (keyof ChartSpec)[]).every((k) => a[k] === b[k]);

/** The preset these settings are, or "custom". Paper and orientation don't count: they're the printer's. */
export function presetOf(o: PrintOptions): PresetId | "custom" {
  const same = (a: PrintOptions) =>
    a.cover === o.cover && a.contents === o.contents && a.instructions === o.instructions && a.materials === o.materials && a.charts.length === o.charts.length && a.charts.every((c, i) => sameChart(c, o.charts[i]!));
  return PRESET_IDS.find((id) => same(PRESETS[id])) ?? "custom";
}

/** A preset, keeping the paper and orientation chosen. */
export const applyPreset = (o: Pick<PrintOptions, "paper" | "landscape">, id: PresetId): PrintOptions => ({ ...PRESETS[id], charts: PRESETS[id].charts.map((c) => ({ ...c })), paper: o.paper, landscape: o.landscape });

const oneOf = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Settings read back from storage: anything missing or wrong is the default (settings of the old shape too). */
export function normalizePrint(raw: unknown): PrintOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const paper = { paper: oneOf(["a4", "letter"] as const, r.paper, "a4"), landscape: bool(r.landscape, false) };
  if (!Array.isArray(r.charts)) return applyPreset(paper, "full");
  const charts = r.charts.slice(0, MAX_CHARTS).map((c: unknown) => {
    const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>, d = chart("contrast", "hidden");
    return {
      crosses: oneOf(CROSSES, x.crosses, d.crosses), lines: oneOf(LINES, x.lines, d.lines), cell: oneOf(CELL_SIZES, x.cell, d.cell),
      pageKey: bool(x.pageKey, d.pageKey), overlap: oneOf(OVERLAPS, x.overlap, d.overlap), key: bool(x.key, d.key),
    };
  });
  return { charts, cover: bool(r.cover, true), contents: bool(r.contents, true), instructions: bool(r.instructions, true), materials: bool(r.materials, true), ...paper };
}

/** Something to print besides the cover: a chart, the materials, or instructions there are. */
export const hasContent = (o: PrintOptions, instructions = false) => o.charts.length > 0 || o.materials || (o.instructions && instructions);

const PAPER = { a4: { w: PAGE.w, h: PAGE.h }, letter: { w: 612, h: 792 } };

export function pageBox(o: Pick<PrintOptions, "paper" | "landscape">): PageBox {
  const { w, h } = PAPER[o.paper];
  return { ...PAGE, ...(o.landscape ? { w: h, h: w } : { w, h }) };
}

export const MM = 72 / 25.4;

/** About how many stitches fit across a page with these settings (for the cell size choices). */
export function stitchesAcross(o: Pick<PrintOptions, "paper" | "landscape">, cell: CellSize): number {
  const b = pageBox(o), w = b.w - b.left - b.right;
  return Math.floor(w / (cell === "auto" ? (PAGE.w - PAGE.left - PAGE.right) / 40 : cell * MM) + 1e-6);
}
