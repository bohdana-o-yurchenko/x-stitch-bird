/*
 * A minimal PDF writer (SPEC §15.10): objects, compressed streams, pages with text, lines and images, and embedded
 * TrueType fonts addressed by glyph id — the text font (regular and bold) and the chart-symbol font. Just enough
 * for chart export — no library, so the file contains exactly what we put in it.
 */
import { TEXT_FONTS, TEXT_GLYPHS } from "./textFonts";

export type Ref = number;

/** 8-bit RGB pixels, row by row. */
export interface Raster {
  w: number;
  h: number;
  rgb: Uint8Array;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A number as PDF wants it: at most two decimals, no exponent. */
export const num = (n: number): string => String(Math.round(n * 100) / 100);

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ё: "e", ъ: "",
};

/** Text for the PDF's text font: Latin only. Cyrillic is transliterated; other unknown characters become "?" when drawn. */
export function latin(text: string): string {
  let out = "";
  for (const ch of text) {
    const low = ch.toLowerCase(), tr = CYRILLIC[low];
    if (tr !== undefined) out += ch === low ? tr : tr.charAt(0).toUpperCase() + tr.slice(1);
    else out += ch;
  }
  return out;
}

const QUESTION = TEXT_GLYPHS[0x3f]!;
const glyphIds = (text: string): number[] => [...latin(text)].map((ch) => TEXT_GLYPHS[ch.codePointAt(0)!] ?? QUESTION);

/** Width of `text` in points at `size`, in the regular or bold text font. */
export function textWidth(text: string, size: number, font: "regular" | "bold" = "regular"): number {
  const widths = TEXT_FONTS[font].widths;
  return (glyphIds(text).reduce((w, g) => w + (widths[g] ?? 0), 0) * size) / 1000;
}

const hex4 = (n: number) => n.toString(16).padStart(4, "0");

export type FontName = "regular" | "bold" | "symbols";
const FONT_KEY: Record<FontName, string> = { regular: "F1", bold: "F2", symbols: "F3" };

/** "r g b" for a "#RRGGBB" colour, as the rg / RG operators take it. */
export function rgb(hex: string): string {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return [1, 3, 5].map((i) => num(parseInt(h.slice(i, i + 2), 16) / 255)).join(" ");
}

const CAPS = { butt: 0, round: 1, square: 2 } as const;
const JOINS = { miter: 0, round: 1, bevel: 2 } as const;

/** How a path or shape is painted: fill and/or stroke colours ("#RRGGBB"), line width, caps and joins, fill rule. */
export interface Paint {
  fill?: string;
  stroke?: string;
  width?: number;
  cap?: keyof typeof CAPS;
  join?: keyof typeof JOINS;
  evenOdd?: boolean;
}

/** Drawing on one page, in points with the origin at the top-left corner (PDF's own origin is bottom-left). */
export class PdfPage {
  readonly ops: string[] = [];
  readonly images: { name: string; ref: Ref }[] = [];
  /** Fill opacities used on the page, in percent (each becomes an ExtGState). */
  readonly alphas = new Set<number>();
  constructor(readonly width: number, readonly height: number) {}

  private y(v: number) {
    return num(this.height - v);
  }

  /** A point given from the top-left, in PDF coordinates. */
  place = (x: number, y: number): [number, number] => [x, this.height - y];

  /** Paints the current path with `o` (a path built from m / l / c / h operators). */
  private paint(path: string, o: Paint) {
    const set: string[] = [];
    if (o.fill) set.push(`${rgb(o.fill)} rg`);
    if (o.stroke) set.push(`${rgb(o.stroke)} RG ${num(o.width ?? 0.5)} w ${CAPS[o.cap ?? "butt"]} J ${JOINS[o.join ?? "miter"]} j`);
    const op = o.fill && o.stroke ? (o.evenOdd ? "B*" : "B") : o.fill ? (o.evenOdd ? "f*" : "f") : "S";
    this.ops.push(`${set.join(" ")} ${path} ${op}`);
  }

  /** SVG-like path data already turned into PDF operators (see svgPath.ts). */
  path(pdfPath: string, o: Paint) {
    if (pdfPath) this.paint(pdfPath, o);
  }

  polygon(points: readonly (readonly [number, number])[], o: Paint) {
    if (points.length < 2) return;
    this.paint(points.map(([x, y], i) => `${num(x)} ${this.y(y)} ${i ? "l" : "m"}`).join(" ") + " h", o);
  }

  circle(cx: number, cy: number, r: number, o: Paint) {
    // four Bézier quarter arcs
    const k = 0.5523 * r, Y = this.height - cy, p = (x: number, y: number) => `${num(x)} ${num(y)}`;
    this.paint(`${p(cx + r, Y)} m ${p(cx + r, Y + k)} ${p(cx + k, Y + r)} ${p(cx, Y + r)} c ${p(cx - k, Y + r)} ${p(cx - r, Y + k)} ${p(cx - r, Y)} c ${p(cx - r, Y - k)} ${p(cx - k, Y - r)} ${p(cx, Y - r)} c ${p(cx + k, Y - r)} ${p(cx + r, Y - k)} ${p(cx + r, Y)} c h`, o);
  }

  /** Many rectangles of one colour in one go: [x, y, w, h] each, from the top-left. */
  rects(boxes: readonly (readonly [number, number, number, number])[], fill: string) {
    if (!boxes.length) return;
    this.ops.push(`${rgb(fill)} rg ${boxes.map(([x, y, w, h]) => `${num(x)} ${this.y(y + h)} ${num(w)} ${num(h)} re`).join(" ")} f`);
  }

  /** Save / restore the graphics state (clipping, opacity). */
  save() {
    this.ops.push("q");
  }
  restore() {
    this.ops.push("Q");
  }

  /** Clip what follows to a rectangle (from the top-left), until `restore`. */
  clipRect(x: number, y: number, w: number, h: number) {
    this.ops.push(`${num(x)} ${this.y(y + h)} ${num(w)} ${num(h)} re W n`);
  }

  /** Clip what follows to everything outside a path (a hole), until `restore`. */
  clipOutside(pdfPath: string) {
    this.ops.push(`-10000 -10000 30000 30000 re ${pdfPath} W* n`);
  }

  /** Fill opacity (0–1) for what follows, until `restore`. */
  opacity(a: number) {
    const pc = Math.round(a * 100);
    this.alphas.add(pc);
    this.ops.push(`/GA${pc} gs`);
  }

  /** `y` is the baseline. */
  text(font: Exclude<FontName, "symbols">, size: number, x: number, y: number, text: string, align: "left" | "right" | "centre" = "left", grey = 0) {
    const w = align === "left" ? 0 : textWidth(text, size, font);
    const left = align === "right" ? x - w : align === "centre" ? x - w / 2 : x;
    this.ops.push(`BT ${num(grey)} g /${FONT_KEY[font]} ${num(size)} Tf 1 0 0 1 ${num(left)} ${this.y(y)} Tm <${glyphIds(text).map(hex4).join("")}> Tj ET`);
  }

  /**
   * Chart symbols: each glyph fills a `size` square whose top-left corner is given. One text object for them all;
   * `grey` 0 = black, 1 = white (for symbols on a dark colour).
   */
  glyphs(size: number, cells: { x: number; y: number; glyph: number }[], ink: number | string = 0) {
    if (!cells.length) return;
    const show = cells.map((c) => `1 0 0 1 ${num(c.x)} ${this.y(c.y + size)} Tm <${hex4(c.glyph)}> Tj`);
    this.ops.push(`BT ${typeof ink === "string" ? `${rgb(ink)} rg` : `${num(ink)} g`} /${FONT_KEY.symbols} ${num(size)} Tf`, ...show, "ET");
  }

  lines(segments: [number, number, number, number][], width: number, grey = 0) {
    if (!segments.length) return;
    this.ops.push(`${num(grey)} G ${num(width)} w`, ...segments.map(([x1, y1, x2, y2]) => `${num(x1)} ${this.y(y1)} m ${num(x2)} ${this.y(y2)} l`), "S");
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: number; width?: number }) {
    const box = `${num(x)} ${this.y(y + h)} ${num(w)} ${num(h)} re`;
    if (o.fill) this.ops.push(`${rgb(o.fill)} rg ${box} f`);
    if (o.stroke !== undefined) this.ops.push(`${num(o.stroke)} G ${num(o.width ?? 0.5)} w ${box} S`);
  }

  image(ref: Ref, x: number, y: number, w: number, h: number) {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, ref });
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${this.y(y + h)} cm /${name} Do Q`);
  }
}

export class PdfWriter {
  private readonly bodies: (Uint8Array | null)[] = [];
  private readonly pageRefs: Ref[] = [];
  private readonly pagesRef = this.reserve();
  private readonly fonts: Record<string, Ref> = {};

  private reserve(): Ref {
    this.bodies.push(null);
    return this.bodies.length;
  }

  private put(ref: Ref, body: string | Uint8Array) {
    this.bodies[ref - 1] = typeof body === "string" ? ascii(body) : body;
  }

  private add(body: string | Uint8Array): Ref {
    const ref = this.reserve();
    this.put(ref, body);
    return ref;
  }

  private async stream(dict: string, data: Uint8Array): Promise<Ref> {
    const packed = await deflate(data);
    return this.add(concat([ascii(`<< ${dict} /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`), packed, ascii("\nendstream")]));
  }

  /**
   * Embeds a TrueType font, addressed by glyph id. `unicode` lists [glyph id, code point] so that viewers and chart
   * trackers read each glyph as that character; `widths` are advances by glyph id (default: every glyph 1000).
   */
  private async embedFont(key: string, o: { name: string; file: Uint8Array; unicode: readonly (readonly [number, number])[]; widths?: readonly number[]; symbolic: boolean; ascent: number; descent: number; capHeight: number; bbox: readonly number[] }) {
    const fontFile = await this.stream(`/Length1 ${o.file.length}`, o.file);
    const descriptor = this.add(`<< /Type /FontDescriptor /FontName /${o.name} /Flags ${o.symbolic ? 4 : 32} /FontBBox [${o.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${o.ascent} /Descent ${o.descent} /CapHeight ${o.capHeight} /StemV 80 /FontFile2 ${fontFile} 0 R >>`);
    const widths = o.widths ? ` /W [0 [${o.widths.join(" ")}]]` : "";
    const cid = this.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${o.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000${widths} /CIDToGIDMap /Identity >>`);
    const blocks: string[] = [];
    for (let i = 0; i < o.unicode.length; i += 100) {
      const part = o.unicode.slice(i, i + 100);
      blocks.push(`${part.length} beginbfchar`, ...part.map(([gid, code]) => `<${hex4(gid)}> <${hex4(code)}>`), "endbfchar");
    }
    const cmap = [
      "/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def", "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def",
      "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange", ...blocks,
      "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end",
    ].join("\n");
    const toUnicode = await this.stream("", ascii(cmap));
    this.fonts[key] = this.add(`<< /Type /Font /Subtype /Type0 /BaseFont /${o.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`);
  }

  /** The chart-symbol font (`PdfPage.glyphs`): every glyph one em wide; `unicode` as [glyph id, code point]. */
  embedSymbolFont(name: string, file: Uint8Array, unicode: readonly (readonly [number, number])[]) {
    return this.embedFont("F3", { name, file, unicode, symbolic: true, ascent: 1000, descent: 0, capHeight: 1000, bbox: [0, 0, 1000, 1000] });
  }

  /** The text fonts (`PdfPage.text`): the files named by `TEXT_FONTS`. */
  async embedTextFonts(files: { regular: Uint8Array; bold: Uint8Array }) {
    const unicode = Object.entries(TEXT_GLYPHS).map(([code, gid]) => [gid, Number(code)] as const);
    for (const [key, id] of [["F1", "regular"], ["F2", "bold"]] as const) {
      const f = TEXT_FONTS[id];
      await this.embedFont(key, { name: f.name, file: files[id], unicode, widths: f.widths, symbolic: false, ascent: f.ascent, descent: f.descent, capHeight: f.capHeight, bbox: f.bbox });
    }
  }

  image(r: Raster): Promise<Ref> {
    return this.stream(`/Type /XObject /Subtype /Image /Width ${r.w} /Height ${r.h} /ColorSpace /DeviceRGB /BitsPerComponent 8`, r.rgb);
  }

  async addPage(page: PdfPage) {
    const contents = await this.stream("", ascii(page.ops.join("\n")));
    const fonts = Object.entries(this.fonts).map(([k, ref]) => `/${k} ${ref} 0 R`).join(" ");
    const images = page.images.length ? ` /XObject << ${page.images.map((i) => `/${i.name} ${i.ref} 0 R`).join(" ")} >>` : "";
    const states = page.alphas.size ? ` /ExtGState << ${[...page.alphas].map((a) => `/GA${a} << /ca ${num(a / 100)} /CA ${num(a / 100)} >>`).join(" ")} >>` : "";
    this.pageRefs.push(this.add(`<< /Type /Page /Parent ${this.pagesRef} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fonts} >>${images}${states} >> /Contents ${contents} 0 R >>`));
  }

  get pageCount() {
    return this.pageRefs.length;
  }

  build(info: { title: string; producer: string }): Uint8Array {
    this.put(this.pagesRef, `<< /Type /Pages /Count ${this.pageRefs.length} /Kids [${this.pageRefs.map((r) => `${r} 0 R`).join(" ")}] >>`);
    const catalog = this.add(`<< /Type /Catalog /Pages ${this.pagesRef} 0 R >>`);
    const plain = (t: string) => `(${latin(t).replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&")})`;
    const infoRef = this.add(`<< /Title ${plain(info.title)} /Producer ${plain(info.producer)} >>`);
    // the second line marks the file as binary
    const parts: Uint8Array[] = [ascii("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")];
    const offsets: number[] = [];
    let at = parts[0]!.length;
    this.bodies.forEach((body, i) => {
      const obj = concat([ascii(`${i + 1} 0 obj\n`), body ?? ascii("null"), ascii("\nendobj\n")]);
      offsets.push(at);
      parts.push(obj);
      at += obj.length;
    });
    const xref = [`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    parts.push(ascii(`${xref}trailer\n<< /Size ${offsets.length + 1} /Root ${catalog} 0 R /Info ${infoRef} 0 R >>\nstartxref\n${at}\n%%EOF\n`));
    return concat(parts);
  }
}
