import type { Editor } from "./createEditor";

/*
 * Signed out, one working pattern (SPEC §15.25). Before another pattern replaces the open one, the editor asks —
 * download its work file, sign in to keep it, or replace it — and a replaced pattern leaves this browser. It never
 * asks, and never removes anything, for:
 *  - patterns already in this browser before the rule (people kept their libraries), or that reached the account;
 *  - a pattern not changed since it was opened or made (it's the demo, or it's in a file, or it's blank) — that
 *    one is replaced without asking, and leaves this browser too.
 */

const KEPT_KEY = "stitchwork.keptPatterns";
/** The open pattern's id once it has been edited — so a pattern restored on the next visit still counts as work. */
const EDITED_KEY = "stitchwork.editedPattern";

export class KeepPattern {
  private kept = new Set<string>();
  /** `docRevision` when the open pattern was opened or made; edits after it are work to lose. -1: always counts. */
  private untouchedAt = -1;

  constructor(private ed: Editor) {}

  /** Start-up: on the first run with the rule, every pattern already saved here is kept for good. */
  async init() {
    try {
      const saved = localStorage.getItem(KEPT_KEY);
      if (saved) this.kept = new Set(JSON.parse(saved) as string[]);
      else this.keep(...(await this.ed.persistence.patterns.list()).map((p) => p.id));
    } catch {
      // storage unavailable: nothing is ever removed, so nothing can be lost
      this.kept = new Set(["*"]);
    }
  }

  keep(...ids: string[]) {
    for (const id of ids) this.kept.add(id);
    keepForGood(...this.kept);
  }

  /** Another pattern is about to be opened or made (just before the editor takes it in): nothing in it to lose yet. */
  opening() {
    // the editor counts the switch itself as one change
    this.untouchedAt = this.ed.state.docRevision + 1;
  }

  /** After every change: the first real edit of the open pattern is remembered across visits. */
  changed() {
    if (!this.ed.state.ready || !this.edited || remembered() === this.ed.doc.id) return;
    try {
      localStorage.setItem(EDITED_KEY, this.ed.doc.id);
    } catch {
      // not remembered: after a reload it counts as untouched
    }
  }

  /** Start-up restored the pattern of an earlier visit: it's work if it was edited then. */
  restored() {
    if (remembered() === this.ed.doc.id) this.untouchedAt = -1;
  }

  /** Signed out, and the open pattern isn't one kept for good: replacing it takes it out of this browser. */
  get leaves(): boolean {
    const s = this.ed.state, id = this.ed.doc.id;
    return s.ready && !s.account && !this.kept.has("*") && !this.kept.has(id);
  }

  /** The open pattern has changes since it was opened or made. */
  get edited(): boolean {
    return this.ed.state.docRevision > this.untouchedAt;
  }

  /** Replacing it would lose work: ask first. */
  get mustAsk(): boolean {
    return this.leaves && this.edited;
  }

  /**
   * Run a command that replaces the open pattern, the open one leaving this browser once it's gone ("Replace it"
   * or "Download, then continue"). Nothing is removed when the command didn't replace it (a bad file, say).
   */
  async replace(run: () => Promise<void>) {
    const old = this.ed.doc.id;
    // its last changes are given up: they mustn't be saved back while it's being removed
    this.ed.autosave.markSaved();
    await run();
    if (this.ed.doc.id !== old) {
      await this.ed.persistence.patterns.remove(old).catch(() => {});
      void this.ed.refreshPatterns();
    }
  }
}

function remembered(): string | null {
  try {
    return localStorage.getItem(EDITED_KEY);
  } catch {
    return null;
  }
}

/** Patterns that are never taken out of this browser by the rule (they're in the account, or were here before). */
export function keepForGood(...ids: string[]) {
  try {
    const kept = new Set([...((JSON.parse(localStorage.getItem(KEPT_KEY) || "[]") as string[]) ?? []), ...ids]);
    localStorage.setItem(KEPT_KEY, JSON.stringify([...kept]));
  } catch {
    // not remembered; asking again next time is harmless
  }
}
