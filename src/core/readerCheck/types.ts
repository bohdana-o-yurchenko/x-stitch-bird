import type { KeyIndex, Pattern, Rect } from "../pattern/types";

/*
 * "Does my app read it?" (SPEC §15.51): test charts with every kind of thing a file of ours can carry, each thing
 * numbered on the chart, for people to open in their reader app and mark one by one — fine, or with issues.
 */

/** The file under test: the .oxs, the PDF for Pattern Keeper, the PDF chart to print. */
export type CheckKind = "oxs" | "pk" | "pdf";
export const CHECK_KINDS: readonly CheckKind[] = ["oxs", "pk", "pdf"];

/** Text in both of the app's languages (like the changelog's). */
export interface Words {
  uk: string;
  en: string;
}

export interface CheckItem {
  /** Stable within its kind: marks are stored by it, so it never changes once released. */
  id: string;
  /** Its heading in the list (`readerCheck.groups.<group>`). */
  group: string;
  /** What it tests, for the summary (`readerCheck.tags.<tag>`): "issues only with your own beads". */
  tags: string[];
  what: Words;
  /** How the file writes it, or what to look for. */
  how?: Words;
  /** Where it is on the chart — its number included; null: a check of the whole file (its key, its pages). */
  area: Rect | null;
  /** Left out of this file on purpose: the app should NOT show it. */
  absent?: true;
}

export interface CheckSuite {
  kind: CheckKind;
  pattern: Pattern;
  /** In the order they are numbered: item i is number i + 1. */
  items: CheckItem[];
  /** The key entry the numbers are drawn in: not part of any sample. */
  label: KeyIndex;
}

export type MarkValue = "ok" | "issue";
export interface Mark {
  v: MarkValue;
  /** What's wrong, in the user's words. */
  note?: string;
}
export type Marks = Record<string, Mark>;

/** One check of one app: whose file, which app, the marks so far. */
export interface CheckRun {
  id: string;
  kind: CheckKind;
  /** The app checked ("Хрестики"), as the user names it. */
  app: string;
  marks: Marks;
  /** ms since the epoch. */
  updated: number;
}

export const MAX_APP_NAME = 60;
export const MAX_NOTE = 300;

const t = (en: string, uk: string): Words => ({ en, uk });
export { t as words };
