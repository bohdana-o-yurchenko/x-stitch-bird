/**
 * Tip of the day (docs/HELP-PLAN.md, SPEC §15.60): which tip to show, from what this person has used. Pure: the
 * editor keeps the state (this browser, and the account when signed in) and shows the card.
 *
 * A tip either names a shortcut for something ("Hold ⌥ and click a stitch…") or says where a feature is ("Select an
 * area, then Replace key…"). Each links to its help question (`help`), and its `id` is that question's anchor — the
 * texts are messages `tips.items.<id>`.
 */

/** A feature as feature usage counts it (`featureOf`): `tool.select:fill`; a bare `draw.pickBrush` is any brush size. */
export type Feature = string;

export interface TipShow {
  /** `data-guide` names to point at (`menu:<id>` — a menu item, `side-<id>` — a side panel button). */
  targets: string[];
  /** A side panel section to bring in first. */
  section?: string;
  /** A header menu to hold open on these submenus. */
  menu?: "pattern" | "app";
  reveal?: string[];
}

export interface Tip {
  id: string;
  kind: "shortcut" | "where";
  /** The help question: `page#anchor`. */
  help: string;
  /**
   * When it's worth showing — all that are given must hold. `unused`: none of these has been used at all (the tip is
   * news). `used`: one of these has (the tip builds on it). `clicked` + `notByKey`: used by clicking, never by its key
   * (the tip is the key).
   */
  when: { unused?: Feature[]; used?: Feature[]; clicked?: Feature[]; notByKey?: Feature[] };
  /** Only for signed-in people (the pages it points at are theirs). */
  signedIn?: boolean;
  /** "Show me": where it is in the app. */
  show?: TipShow;
}

/** In order, the most hidden first — the order they're shown in. */
export const TIPS: readonly Tip[] = [
  { id: "replace-in-selection", kind: "where", help: "draw#replace-in-selection", when: { unused: ["selection.requestReplaceKey", "selection.replaceKey"] }, show: { targets: ["tool-select", "tool-magicWand"] } },
  { id: "override", kind: "shortcut", help: "draw#override", when: { unused: ["draw.toggleOverride"] }, show: { targets: ["override"] } },
  { id: "picker", kind: "shortcut", help: "draw#picker", when: { unused: ["tool.hold:picker"] }, show: { targets: ["tool-picker"] } },
  { id: "ambiguous", kind: "shortcut", help: "check#ambiguous", when: { unused: ["ambiguous.toggleAtHover"] } },
  { id: "chart-checks", kind: "where", help: "check#chart-checks", when: { unused: ["checks.run"] }, show: { targets: ["side-checks"], section: "checks" } },
  { id: "select-colour", kind: "shortcut", help: "draw#select-colour", when: { unused: ["tool.select:magicWand"] }, show: { targets: ["tool-magicWand"] } },
  { id: "undo", kind: "shortcut", help: "fix#undo", when: { clicked: ["history.undo"], notByKey: ["history.undo"] }, show: { targets: ["undo"] } },
  { id: "key-numbers", kind: "shortcut", help: "key#key-numbers", when: { unused: ["key.selectNth"] } },
  { id: "brush", kind: "shortcut", help: "draw#pencil", when: { clicked: ["draw.pickBrush"], notByKey: ["draw.pickBrush"] }, show: { targets: ["brush"] } },
  { id: "highlight", kind: "shortcut", help: "check#highlight", when: { unused: ["view.toggleHighlight"] }, show: { targets: ["highlight"] } },
  { id: "hide-kinds", kind: "where", help: "check#hide-kinds", when: { unused: ["view.toggleGroup", "view.showAll"] }, show: { targets: ["groups"] } },
  { id: "go-to-cell", kind: "shortcut", help: "check#go-to-cell", when: { unused: ["view.goToCell"] } },
  { id: "mirror", kind: "shortcut", help: "draw#mirror", when: { unused: ["draw.cycleMirror"] }, show: { targets: ["mirror"] } },
  { id: "partial", kind: "shortcut", help: "draw#partial", when: { used: ["tool.select:partial", "draw.setPartialKind"], unused: ["draw.cyclePartialKind"] }, show: { targets: ["tool-partial"] } },
  { id: "backstitch", kind: "shortcut", help: "draw#backstitch", when: {} },
  { id: "line-up", kind: "shortcut", help: "import#line-up", when: { clicked: ["underlay.toggleBehind"], notByKey: ["underlay.toggleBehind"] }, show: { targets: ["underlay-edit"] } },
  { id: "rotate", kind: "shortcut", help: "import#rotate", when: { used: ["underlay.toggleBehind"], notByKey: ["underlay.rotate"] } },
  { id: "autofill", kind: "shortcut", help: "import#autofill", when: { clicked: ["tool.select:autofill"], notByKey: ["tool.select:autofill"] }, show: { targets: ["tool-autofill"] } },
  { id: "eraser-modes", kind: "where", help: "fix#eraser-modes", when: { used: ["tool.select:eraser"] }, show: { targets: ["tool-eraser"] } },
  { id: "versions", kind: "where", help: "fix#versions", when: { unused: ["snapshot.restore"] }, show: { targets: ["side-versions"], section: "versions" } },
  { id: "drop", kind: "where", help: "import#drop", when: { unused: ["file.drop"] } },
  { id: "own-pdf", kind: "where", help: "import#own-pdf", when: { unused: ["file.newFromPdf"] }, show: { targets: ["menu", "menu:newFromPdf"], menu: "pattern", reveal: ["new"] } },
  { id: "numbering", kind: "where", help: "start#numbering", when: { unused: ["pattern.setGrid"] }, show: { targets: ["side-fabric"], section: "fabric" } },
  { id: "paste-other-pattern", kind: "where", help: "draw#paste-other-pattern", when: { used: ["clipboard.copy"] } },
  // { id: "stamps", … } comes back with special stitches in the next release (BACKLOG 7)
  { id: "shade-stitched", kind: "where", help: "import#shade-stitched", when: { used: ["reference.pick", "reference.open"] } },
  { id: "marker", kind: "where", help: "import#marker", when: { used: ["reference.pick", "reference.open"] } },
  { id: "key-search", kind: "where", help: "key#key-search", when: {} },
  { id: "png", kind: "where", help: "export#png", when: { unused: ["file.export:png-stitched"] }, show: { targets: ["menu", "menu:pngPreviews"], menu: "pattern", reveal: ["export", "pngPreviews"] } },
  { id: "print-presets", kind: "where", help: "export#print-presets", when: { used: ["file.exportChartPdf"] } },
  { id: "equivalents", kind: "where", help: "floss#equivalents", when: {}, signedIn: true },
  { id: "toolbar", kind: "where", help: "draw#toolbar", when: {}, show: { targets: ["app-menu", "menu:toolbar"], menu: "app", reveal: [] } },
  { id: "panel", kind: "shortcut", help: "draw#panel", when: { clicked: ["panel.toggle"], notByKey: ["panel.toggle"] }, show: { targets: ["panel-toggle"] } },
  { id: "navigate", kind: "shortcut", help: "draw#navigate", when: { unused: ["tool.hold:pan"] } },
  { id: "saving", kind: "shortcut", help: "patterns#saving", when: { unused: ["file.save"] }, show: { targets: ["saved"] } },
  { id: "reader-check", kind: "where", help: "export#reader-check", when: { used: ["file.export:oxs"] }, show: { targets: ["app-menu", "menu:check"], menu: "app", reveal: [] } },
];

/** Clicks and shortcut presses of each feature, as far as tips care: kept per person, never sent anywhere else. */
export type Used = Record<Feature, [clicks: number, keys: number]>;

/** What tips know about one person: this browser's, and the account's when signed in (merged, `mergeTipState`). */
export interface TipState {
  v: 1;
  /** The first day tips knew of this person (YYYY-MM-DD, their own calendar): no tip that day. */
  since: string;
  /** The day a tip was last shown by itself; null — never. */
  day: string | null;
  /** "Show a tip each day" unticked. */
  off: boolean;
  /** When `off` was last changed (ms; 0 — never): of two states, the later choice wins. */
  offAt: number;
  /** Tips seen (shown or browsed to), and when (ms). */
  shown: Record<string, number>;
  used: Used;
}

/** At most this many features are remembered — more than the app has. */
export const MAX_USED = 400;
const MAX_COUNT = 1_000_000;

export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** A first state. `old`: someone who used the app before tips existed — no day to wait. */
export const newTipState = (day: string, old = false): TipState => ({ v: 1, since: old ? "2000-01-01" : day, day: null, off: false, offAt: 0, shown: {}, used: {} });

/** Counts a use of a feature (`via`: a click or a key). */
export function countUse(s: TipState, feature: Feature, via: "click" | "key"): void {
  const had = s.used[feature];
  if (!had && Object.keys(s.used).length >= MAX_USED) return;
  const c = had ?? [0, 0];
  c[via === "key" ? 1 : 0] = Math.min(MAX_COUNT, c[via === "key" ? 1 : 0] + 1);
  s.used[feature] = c;
}

/** All uses of a feature, `draw.pickBrush` adding up `draw.pickBrush:1`… */
function usesOf(used: Used, f: Feature): [number, number] {
  let c = 0, k = 0;
  for (const [name, [nc, nk]] of Object.entries(used))
    if (name === f || name.startsWith(`${f}:`)) {
      c += nc;
      k += nk;
    }
  return [c, k];
}

/** Whether a tip is worth showing to someone who has used what `used` says. */
export function worthShowing(tip: Tip, used: Used, signedIn: boolean): boolean {
  if (tip.signedIn && !signedIn) return false;
  const u = (f: Feature) => usesOf(used, f);
  const w = tip.when;
  if (w.unused && w.unused.some((f) => u(f)[0] + u(f)[1] > 0)) return false;
  if (w.used && !w.used.some((f) => u(f)[0] + u(f)[1] > 0)) return false;
  if (w.clicked && !w.clicked.some((f) => u(f)[0] > 0)) return false;
  if (w.notByKey && w.notByKey.some((f) => u(f)[1] > 0)) return false;
  return true;
}

/**
 * The tips worth showing, in the order to show them: those not seen yet in list order, then the seen ones, seen
 * longest ago first — so nothing repeats until every tip worth showing has been seen.
 */
export function tipsInOrder(s: TipState, signedIn: boolean, tips: readonly Tip[] = TIPS): Tip[] {
  const worth = tips.filter((t) => worthShowing(t, s.used, signedIn));
  const fresh = worth.filter((t) => !s.shown[t.id]);
  const seen = worth.filter((t) => s.shown[t.id]).sort((a, b) => s.shown[a.id]! - s.shown[b.id]!);
  return [...fresh, ...seen];
}

/** Whether today's tip is still to come: tips on, not on the first day, and not shown today already. */
export const tipDue = (s: TipState, day: string) => !s.off && s.since < day && s.day !== day;

/** Two states of one person (this browser and the account) as one: nothing seen or used is forgotten. */
export function mergeTipState(a: TipState, b: TipState): TipState {
  const shown = { ...a.shown };
  for (const [id, t] of Object.entries(b.shown)) shown[id] = Math.max(shown[id] ?? 0, t);
  const used: Used = { ...a.used };
  // the larger count of each: the same uses may be in both, so adding them would count twice
  for (const [f, [c, k]] of Object.entries(b.used)) {
    const had = used[f];
    if (had) used[f] = [Math.max(had[0], c), Math.max(had[1], k)];
    else if (Object.keys(used).length < MAX_USED) used[f] = [c, k];
  }
  const day = !a.day ? b.day : !b.day ? a.day : a.day > b.day ? a.day : b.day;
  const later = b.offAt > a.offAt ? b : a;
  return { v: 1, since: a.since < b.since ? a.since : b.since, day, off: later.off, offAt: later.offAt, shown, used };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_COUNT;

/** A state of the right shape (what the account accepts, and what this browser reads back); anything else is refused. */
export function validTipState(v: unknown): v is TipState {
  const s = v as TipState | null;
  if (!s || typeof s !== "object" || s.v !== 1 || typeof s.since !== "string" || !DAY.test(s.since)) return false;
  if (s.day !== null && (typeof s.day !== "string" || !DAY.test(s.day)) || typeof s.off !== "boolean" || typeof s.offAt !== "number" || !Number.isFinite(s.offAt) || s.offAt < 0) return false;
  if (!s.shown || typeof s.shown !== "object" || Array.isArray(s.shown) || Object.keys(s.shown).length > 200) return false;
  if (!Object.entries(s.shown).every(([id, t]) => /^[a-z0-9-]{1,40}$/.test(id) && typeof t === "number" && Number.isFinite(t) && t >= 0)) return false;
  if (!s.used || typeof s.used !== "object" || Array.isArray(s.used) || Object.keys(s.used).length > MAX_USED) return false;
  return Object.entries(s.used).every(([f, c]) => f.length <= 60 && Array.isArray(c) && c.length === 2 && count(c[0]) && count(c[1]));
}
