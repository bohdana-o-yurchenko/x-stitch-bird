import { parsePattern } from "@/core/formats/json/parse";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import type { Pattern } from "@/core/pattern/types";
import { accountPatternApi, accountRevs, liveApi, type SaveOptions } from "@/persistence";
import type { Editor } from "../createEditor";

/**
 * - `off`: nothing to share (signed out, the pattern not in the account yet, or not checked yet);
 * - `editing`: this window edits; other windows follow it;
 * - `following`: another window edits; this one shows its changes as they come, and can take over;
 * - `takingOver`: this window asked to edit; the one before is saving its last changes.
 */
export type LiveRole = "off" | "editing" | "following" | "takingOver";

/** How often a window checks in: with other windows on the pattern, or taking over… */
const QUICK = 2_000;
/** …and otherwise. Hidden windows don't check in; they catch up when shown. */
const CALM = 6_000;

const randomId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);

/** The pattern's content, leaving out the time spent (it grows on its own in every window). */
function content(doc: PatternFile | Pattern): string {
  const file = ("layers" in doc ? serializePattern(doc as Pattern) : doc) as PatternFile & { spent?: number };
  const copy: Record<string, unknown> = { ...file };
  delete copy.spent;
  return JSON.stringify(copy);
}

/**
 * One pattern open in several windows or devices (SPEC §15.34). One window edits at a time; the others follow it,
 * its changes showing within seconds, and can take over (the window before saves its last changes first). Every save
 * names the account revision it was made over: one made over an older revision — offline work meeting changes made
 * elsewhere — is never applied unseen: the user chooses which version to go on with, and the other is kept in
 * Versions.
 */
export class LiveSync {
  readonly windowId = randomId();
  /** The account revision the open pattern is based on; null: not known (not in the account, or from before). */
  private base: number | null = null;
  /** `docRevision` when the open pattern last matched the account's copy; -1: it may differ. */
  private syncedAt = -1;
  private patternId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;
  private started = false;
  /** Left for another page (`stop`): a check-in still under way doesn't take the editing afterwards. */
  private stopped = false;
  /** Versions are brought together once per opened pattern (SPEC §15.34). */
  private versionsSynced: string | null = null;
  /** This window's version was chosen over the account's: it goes up once this window edits. */
  private keeping = false;

  constructor(private ed: Editor) {}

  get role(): LiveRole {
    return this.ed.state.live.role;
  }

  /** Another window edits: this one doesn't change the pattern. */
  get readOnly(): boolean {
    return this.role === "following" || this.role === "takingOver";
  }

  /** The open pattern has changes the account doesn't have yet. */
  get changedHere(): boolean {
    return this.ed.state.docRevision !== this.syncedAt;
  }

  private onVisible = () => document.visibilityState === "visible" && this.schedule(0);
  private onOnline = () => this.schedule(0);
  /**
   * The page closing or reloading: this window goes at once, so the next one edits without waiting. Not with a save
   * still on its way — that save keeps the editing for this window; it then counts as gone after a while.
   */
  private onPageHide = () => {
    if (this.patternId && this.ed.state.account && this.role !== "off" && !this.ed.autosave.pending) void liveApi.leave(this.patternId, this.windowId, true);
  };

  start() {
    if (this.started || typeof document === "undefined") return;
    this.started = true;
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("pagehide", this.onPageHide);
    this.schedule(0);
  }

  /**
   * The editor is left for another page in this tab: no more checking in (a window left running would go on editing
   * unseen, and the editor opened next would only follow it). Once its last save is in, this window goes.
   */
  stop() {
    if (!this.started) return;
    this.started = false;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("pagehide", this.onPageHide);
    const id = this.patternId;
    if (!id || !this.ed.state.account || this.role === "off") return;
    void this.ed.autosave.settle().then(() => liveApi.leave(id, this.windowId));
  }

  /**
   * A pattern became the open one (opened, created, restored at start-up). `unsure`: it may hold changes the
   * library copy doesn't (the draft, restored at start-up) — compared before trusting it.
   */
  opened(id: string, o: { unsure?: boolean } = {}) {
    const known = accountRevs.get(id);
    this.patternId = id;
    this.base = known?.rev ?? null;
    this.syncedAt = known && !known.pending ? this.ed.state.docRevision : -1;
    this.setRole("off", 0);
    if (o.unsure && this.syncedAt >= 0) {
      const at = this.syncedAt;
      void this.ed.persistence.patterns.load(id).then((lib) => {
        if (this.patternId === id && this.syncedAt === at && (!lib || content(lib) !== content(this.ed.doc))) this.syncedAt = -1;
      });
    }
    this.schedule(0);
  }

  /** For a save of the open pattern: the revision it's made over, and this window. */
  saveOptions(): SaveOptions {
    return { base: this.base, window: this.windowId };
  }

  /** This window's save reached the account: the pattern as it was at `docRevision` is its revision `rev`. */
  saved(rev: number, docRevision: number) {
    this.base = rev;
    this.syncedAt = docRevision;
  }

  /** A save was refused: the account's copy had another save since. */
  refused(current: { rev: number; doc: PatternFile }) {
    void this.resolve(current);
  }

  /** Someone tried to change the pattern while following: say why nothing happens. */
  blocked() {
    this.ed.store.setState({ live: { ...this.ed.state.live, nudge: (this.ed.state.live.nudge ?? 0) + 1 } });
  }

  /** "Edit here": this window takes over the editing (the one before saves its last changes first). */
  async takeOver() {
    const id = this.patternId;
    if (!id) return;
    const r = await liveApi.claim(id, this.windowId);
    if (!r || id !== this.patternId) return;
    this.setRole(r.waiting ? "takingOver" : "editing", this.ed.state.live.others);
    this.schedule(0);
  }

  /** The user chose: go on with this window's version; the account's is kept in Versions. */
  async keepMine(theirs: { rev: number; doc: PatternFile }) {
    this.ed.closeDialog();
    await this.ed.snapshots.addVersion(theirs.doc, "otherDevice");
    this.base = theirs.rev;
    this.syncedAt = -1;
    this.keeping = true;
    // saved over theirs from the editing window — this one, after the other hands over
    if (this.role === "editing") this.saveKept();
    else await this.takeOver();
  }

  private saveKept() {
    this.keeping = false;
    this.ed.autosave.saveNow();
  }

  /** The user chose: go on with the account's version; this window's is kept in Versions. */
  async useTheirs(theirs: { rev: number; doc: PatternFile }) {
    this.ed.closeDialog();
    await this.ed.snapshots.take("thisDevice");
    this.apply(theirs);
  }

  private setRole(role: LiveRole, others: number) {
    const l = this.ed.state.live;
    if (l.role !== role || l.others !== others) this.ed.store.setState({ live: { ...l, role, others } });
  }

  private schedule(delay = this.role === "off" || !this.ed.state.live.others ? (this.role === "takingOver" ? QUICK : CALM) : QUICK) {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.check();
    } catch {
      // unreachable or refused: as it was, and again shortly
    } finally {
      this.ticking = false;
      this.schedule();
    }
  }

  private async check() {
    const id = this.patternId, ed = this.ed;
    if (!id || !ed.state.account || !ed.state.ready) return this.setRole("off", 0);
    if (document.visibilityState === "hidden") return;
    let st = await liveApi.checkIn(id, this.windowId, this.role === "editing");
    if (this.stopped || id !== this.patternId || st === undefined) return;
    // not in the account (yet): its first save puts it there, with this window editing
    if (st === null) return this.setRole("off", 0);
    if (this.versionsSynced !== id) {
      this.versionsSynced = id;
      void ed.snapshots.sync();
    }
    if (st.handOver) {
      // another window took over: what this one has goes first, then it follows
      await ed.autosave.settle();
      await liveApi.release(id, this.windowId);
      return this.setRole("following", st.others);
    }
    if (st.editor === null) {
      // nobody edits: this window does
      const c = await liveApi.claim(id, this.windowId);
      if (!c || this.stopped || id !== this.patternId) return;
      st = { ...st, editor: "me", waiting: c.waiting };
    }
    const role: LiveRole = st.editor === "me" ? (st.waiting ? "takingOver" : "editing") : "following";
    this.setRole(role, st.others);
    // taking over: the newest copy only once the window before has saved its last changes
    if (role === "takingOver") return;
    if (role === "editing" && this.keeping) return this.saveKept();
    // this window's own save under way: its answer brings the revision
    if (role === "editing" && ed.autosave.pending) return;
    if (this.base !== st.rev) await this.catchUp();
  }

  /** The account's copy is newer than the one this window has. */
  private async catchUp() {
    const id = this.patternId!;
    const got = await accountPatternApi.get(id);
    if (!got || id !== this.patternId) return;
    await this.resolve(got);
  }

  /** The account has `theirs`: the same as here, newer with nothing changed here, or both changed — then ask. */
  private async resolve(theirs: { rev: number; doc: PatternFile }) {
    const ed = this.ed;
    if (content(theirs.doc) === content(ed.doc)) {
      this.base = theirs.rev;
      this.syncedAt = ed.state.docRevision;
      accountRevs.set(this.patternId!, { rev: theirs.rev });
      return;
    }
    if (!this.changedHere) return this.apply(theirs);
    if (ed.state.dialog?.type !== "liveConflict") ed.openDialog({ type: "liveConflict", theirs });
  }

  /** The account's copy in place of this window's, the view kept. */
  private apply(theirs: { rev: number; doc: PatternFile }) {
    const ed = this.ed, id = this.patternId!;
    let pattern: Pattern;
    try {
      pattern = parsePattern(theirs.doc, ed.state.symbols).pattern;
    } catch {
      return;
    }
    // the time spent only grows
    pattern.spent = Math.max(pattern.spent, ed.doc.spent);
    ed.replaceDoc(pattern);
    this.base = theirs.rev;
    this.syncedAt = ed.state.docRevision;
    accountRevs.set(id, { rev: theirs.rev });
    // this browser's copy too (the account has it already)
    void ed.persistence.patterns.save(serializePattern(pattern), { localOnly: true });
  }
}
