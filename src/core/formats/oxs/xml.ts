export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  /** Names of the open ancestor elements, outermost first. */
  path: string[];
  children: XmlElement[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m,
  );

/** Minimal XML reader for OXS: elements and attributes only (text, comments and CDATA are skipped). */
export function parseXml(text: string): XmlElement[] {
  const all: XmlElement[] = [];
  const stack: XmlElement[] = [];
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let m: RegExpExecArray | null; (m = tag.exec(text)); ) {
    const [, close, name, rawAttrs, selfClose] = m;
    if (!name) continue;
    if (close) {
      const idx = stack.map((e) => e.name).lastIndexOf(name);
      if (idx >= 0) stack.length = idx;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = decode(a[2] ?? a[3] ?? "");
    const el: XmlElement = { name, attrs, path: stack.map((e) => e.name), children: [] };
    stack[stack.length - 1]?.children.push(el);
    all.push(el);
    if (!selfClose) stack.push(el);
  }
  return all;
}
