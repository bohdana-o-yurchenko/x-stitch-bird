/*
 * A minimal PDF writer (SPEC §15.10): objects, compressed streams, pages with text, lines and images, the built-in
 * Helvetica, and one embedded TrueType font addressed by glyph id. Just enough for chart export — no library, so
 * the file contains exactly what we put in it.
 */

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

const WIN_ANSI: Record<string, number> = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "−": 0x2d };
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ё: "e", ъ: "",
};

/** Text for the built-in fonts: Latin only. Cyrillic is transliterated; anything else unknown becomes "?". */
export function latin(text: string): string {
  let out = "";
  for (const ch of text) {
    const low = ch.toLowerCase(), tr = CYRILLIC[low];
    if (tr !== undefined) out += ch === low ? tr : tr.charAt(0).toUpperCase() + tr.slice(1);
    else out += ch;
  }
  return out;
}

/** A PDF hex string in WinAnsi encoding. */
function winAnsiHex(text: string): string {
  let hex = "";
  for (const ch of latin(text)) {
    const c = ch.codePointAt(0)!;
    const b = WIN_ANSI[ch] ?? (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x3f);
    hex += b.toString(16).padStart(2, "0");
  }
  return `<${hex}>`;
}

/** Helvetica advance widths that matter for aligning numbers; other characters are estimated. */
export function helveticaWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of latin(text)) w += /[0-9]/.test(ch) ? 556 : ch === "-" ? 333 : ch === " " || ch === "," || ch === "." ? 278 : /[A-Z]/.test(ch) ? 680 : 520;
  return (w * size) / 1000;
}

export type FontName = "regular" | "bold" | "symbols";
const FONT_KEY: Record<FontName, string> = { regular: "F1", bold: "F2", symbols: "F3" };

/** Drawing on one page, in points with the origin at the top-left corner (PDF's own origin is bottom-left). */
export class PdfPage {
  readonly ops: string[] = [];
  readonly images: { name: string; ref: Ref }[] = [];
  constructor(readonly width: number, readonly height: number) {}

  private y(v: number) {
    return num(this.height - v);
  }

  /** `y` is the baseline. */
  text(font: Exclude<FontName, "symbols">, size: number, x: number, y: number, text: string, align: "left" | "right" | "centre" = "left", grey = 0) {
    const w = align === "left" ? 0 : helveticaWidth(text, size);
    const left = align === "right" ? x - w : align === "centre" ? x - w / 2 : x;
    this.ops.push(`BT ${num(grey)} g /${FONT_KEY[font]} ${num(size)} Tf 1 0 0 1 ${num(left)} ${this.y(y)} Tm ${winAnsiHex(text)} Tj ET`);
  }

  /** Chart symbols: each glyph fills a `size` square whose top-left corner is given. One text object for them all. */
  glyphs(size: number, cells: { x: number; y: number; glyph: number }[]) {
    if (!cells.length) return;
    const show = cells.map((c) => `1 0 0 1 ${num(c.x)} ${this.y(c.y + size)} Tm <${c.glyph.toString(16).padStart(4, "0")}> Tj`);
    this.ops.push(`BT 0 g /${FONT_KEY.symbols} ${num(size)} Tf`, ...show, "ET");
  }

  lines(segments: [number, number, number, number][], width: number, grey = 0) {
    if (!segments.length) return;
    this.ops.push(`${num(grey)} G ${num(width)} w`, ...segments.map(([x1, y1, x2, y2]) => `${num(x1)} ${this.y(y1)} m ${num(x2)} ${this.y(y2)} l`), "S");
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: number; width?: number }) {
    const box = `${num(x)} ${this.y(y + h)} ${num(w)} ${num(h)} re`;
    if (o.fill) {
      const [r, g, b] = [1, 3, 5].map((i) => num(parseInt(o.fill!.slice(i, i + 2), 16) / 255));
      this.ops.push(`${r} ${g} ${b} rg ${box} f`);
    }
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
  private readonly fonts: Record<string, Ref> = {
    F1: this.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    F2: this.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  };

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
   * Embeds a TrueType font whole, addressed by glyph id (`PdfPage.glyphs`). `unicode` lists [glyph id, code point]
   * so that viewers and chart trackers read each glyph as that character.
   */
  async embedSymbolFont(name: string, file: Uint8Array, unicode: readonly (readonly [number, number])[]) {
    const fontFile = await this.stream(`/Length1 ${file.length}`, file);
    const descriptor = this.add(`<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 1000 /Descent 0 /CapHeight 1000 /StemV 80 /FontFile2 ${fontFile} 0 R >>`);
    const cid = this.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /CIDToGIDMap /Identity >>`);
    const hex4 = (n: number) => n.toString(16).padStart(4, "0");
    const blocks: string[] = [];
    for (let i = 0; i < unicode.length; i += 100) {
      const part = unicode.slice(i, i + 100);
      blocks.push(`${part.length} beginbfchar`, ...part.map(([gid, code]) => `<${hex4(gid)}> <${hex4(code)}>`), "endbfchar");
    }
    const cmap = [
      "/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def", "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def",
      "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange", ...blocks,
      "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end",
    ].join("\n");
    const toUnicode = await this.stream("", ascii(cmap));
    this.fonts.F3 = this.add(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`);
  }

  image(r: Raster): Promise<Ref> {
    return this.stream(`/Type /XObject /Subtype /Image /Width ${r.w} /Height ${r.h} /ColorSpace /DeviceRGB /BitsPerComponent 8`, r.rgb);
  }

  async addPage(page: PdfPage) {
    const contents = await this.stream("", ascii(page.ops.join("\n")));
    const fonts = Object.entries(this.fonts).map(([k, ref]) => `/${k} ${ref} 0 R`).join(" ");
    const images = page.images.length ? ` /XObject << ${page.images.map((i) => `/${i.name} ${i.ref} 0 R`).join(" ")} >>` : "";
    this.pageRefs.push(this.add(`<< /Type /Page /Parent ${this.pagesRef} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fonts} >>${images} >> /Contents ${contents} 0 R >>`));
  }

  get pageCount() {
    return this.pageRefs.length;
  }

  build(info: { title: string; producer: string }): Uint8Array {
    this.put(this.pagesRef, `<< /Type /Pages /Count ${this.pageRefs.length} /Kids [${this.pageRefs.map((r) => `${r} 0 R`).join(" ")}] >>`);
    const catalog = this.add(`<< /Type /Catalog /Pages ${this.pagesRef} 0 R >>`);
    const infoRef = this.add(`<< /Title ${winAnsiHex(info.title)} /Producer ${winAnsiHex(info.producer)} >>`);
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
