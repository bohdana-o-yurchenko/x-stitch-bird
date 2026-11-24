/**
 * The help pages (`/[locale]/help`, docs/HELP-PLAN.md): one page per step of making a pattern, each a list of
 * questions as a stitcher would ask them. Question ids are anchors (`/uk/help/draw#replace-in-selection`): the "?"
 * links in the app and the tips point at them, so **an id never changes once released** — add new ones instead.
 *
 * Answer text is plain, with three marks: `**Name**` — a button or menu item as the app names it; `` `K` `` — a key;
 * `[text](page#id)` — another question (same language). Both languages have the same pages and ids (help.test.ts).
 */
export interface HelpQuestion {
  id: string;
  q: string;
  /** 1–5 short bullets. */
  a: string[];
  /** A screenshot of the place, `public/help/<locale>/<id>.png`, cropped to it (scripts/help-shots.mjs). */
  shot?: boolean;
}

export interface HelpGroup {
  title: string;
  qs: HelpQuestion[];
}

export interface HelpPage {
  id: string;
  title: string;
  /** One line under the title. */
  intro: string;
  groups: HelpGroup[];
}

export interface HelpTexts {
  title: string;
  intro: string;
  search: string;
  noMatch: string;
  back: string;
  contents: string;
  onThisPage: string;
  next: string;
  pages: HelpPage[];
}

export type HelpLocale = "en" | "uk";
export const helpLocale = (locale: string): HelpLocale => (locale === "uk" ? "uk" : "en");

/** The pages in the order a pattern is made. */
export const HELP_PAGES = ["start", "import", "key", "draw", "check", "fix", "export", "patterns", "floss", "app"] as const;
export type HelpPageId = (typeof HELP_PAGES)[number];

/** Link to a question: `helpHref("uk", "draw#replace-in-selection")`. */
export const helpHref = (locale: string, to: string) => {
  const [page, id] = to.split("#");
  return `/${helpLocale(locale)}/help/${page}${id ? `#${id}` : ""}`;
};

export type Inline = { t: "text" | "ui" | "key"; s: string } | { t: "link"; s: string; to: string };

/** `**Name**`, `` `K` `` and `[text](page#id)` into pieces to render. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\(([a-z]+(?:#[a-z0-9-]+)?)\)/g;
  let at = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    if (m.index > at) out.push({ t: "text", s: text.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ t: "ui", s: m[1] });
    else if (m[2] !== undefined) out.push({ t: "key", s: m[2] });
    else out.push({ t: "link", s: m[3]!, to: m[4]! });
    at = re.lastIndex;
  }
  if (at < text.length) out.push({ t: "text", s: text.slice(at) });
  return out;
}

/** Every question with its page, for search and checks. */
export function allQuestions(texts: HelpTexts) {
  return texts.pages.flatMap((p) => p.groups.flatMap((g) => g.qs.map((q) => ({ page: p.id, pageTitle: p.title, ...q }))));
}
