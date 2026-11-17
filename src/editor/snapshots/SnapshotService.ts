import { parsePattern } from "@/core/formats/json/parse";
import { serializePattern, type FileVersion, type PatternFile } from "@/core/formats/json/serialize";
import { buildPalette, type Palette } from "@/core/pattern/palette";
import type { Pattern } from "@/core/pattern/types";
import { snapshotsToDelete } from "@/core/snapshots/retention";
import { renderChartImage } from "@/render/exportChart";
import { versionApi } from "@/persistence";
import type { Snapshot, SnapshotSummary } from "@/persistence/ports";
import type { Editor } from "../createEditor";
import { loadPattern } from "../actions/pattern";

const EVERY = 5 * 60_000;
/** Versions fetched from the account per request (each is a whole pattern). */
const FETCH_AT_ONCE = 10;

/** Automatic snapshots (SPEC §15.7): every 5 minutes while editing, and before destructive commands. */
export class SnapshotService {
  private lastRevision = -1;
  /** Versions are stored by time, so two taken in the same millisecond mustn't share one. */
  private lastTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private ed: Editor) {}

  start() {
    this.lastRevision = this.ed.state.docRevision;
    this.timer ??= setInterval(() => {
      if (this.ed.state.docRevision !== this.lastRevision) void this.take("timer");
    }, EVERY);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Called by the command registry before any command flagged `destructive`. */
  before(reason: string) {
    void this.take(reason);
  }

  async take(reason: string) {
    const p = this.ed.doc;
    this.lastRevision = this.ed.state.docRevision;
    const data = JSON.stringify(serializePattern(p));
    const time = (this.lastTime = Math.max(Date.now(), this.lastTime + 1));
    const snap = { projectId: p.id, time, reason, w: p.w, h: p.h, data, thumb: this.thumb(p, this.ed.state.palette) };
    const repo = this.ed.persistence.snapshots;
    try {
      await repo.add(snap);
    } catch {
      await this.prune(p.id, 10).catch(() => {});
      await repo.add(snap).catch(() => {});
    }
    await this.prune(p.id).catch(() => {});
    void this.sync(p.id);
  }

  /** A version of the pattern made elsewhere, kept here as it was (SPEC §15.34: the one not chosen in a conflict). */
  async addVersion(doc: PatternFile, reason: string) {
    const time = (this.lastTime = Math.max(Date.now(), this.lastTime + 1));
    await this.importFile(doc.id, [{ time, reason, doc }]);
    this.ed.store.setState({ versionsRevision: this.ed.state.versionsRevision + 1 });
    void this.sync(doc.id);
  }

  /**
   * Signed in, the pattern's versions from every device in one history (SPEC §15.34): this browser's go up, the
   * account's come down — only those the history keeps (the same thinning everywhere, so nothing goes back and forth).
   */
  async sync(id = this.ed.doc.id) {
    if (!this.ed.state.account) return;
    const repo = this.ed.persistence.snapshots;
    const remote = await versionApi.list(id).catch(() => null);
    if (!remote) return;
    const local = await repo.list(id).catch(() => [] as SnapshotSummary[]);
    const there = new Set(remote.map((v) => v.time)), here = new Set(local.map((s) => s.time));
    const all = [...new Set([...there, ...here])];
    const dropped = new Set(snapshotsToDelete(all, Date.now()));
    for (const s of local) {
      if (there.has(s.time) || dropped.has(s.time)) continue;
      const full = await repo.get(id, s.time).catch(() => null);
      if (!full) continue;
      try {
        if (!(await versionApi.add(id, [{ time: full.time, reason: full.reason, doc: JSON.parse(full.data) as PatternFile }]))) return;
      } catch {
        return;
      }
    }
    const wanted = remote.filter((v) => !here.has(v.time) && !dropped.has(v.time)).map((v) => v.time);
    for (let i = 0; i < wanted.length; i += FETCH_AT_ONCE) {
      const got = await versionApi.get(id, wanted.slice(i, i + FETCH_AT_ONCE)).catch(() => null);
      if (!got) return;
      await this.importFile(id, got);
    }
    if (wanted.length) this.ed.store.setState({ versionsRevision: this.ed.state.versionsRevision + 1 });
  }

  private thumb(p: Pattern, palette: Palette): string | null {
    try {
      return renderChartImage(p, palette, "color", this.ed.theme, { heading: "", key: [] }, Math.max(1, Math.floor(96 / Math.max(p.w, p.h)))).toDataURL("image/png");
    } catch {
      return null;
    }
  }

  private async prune(projectId: string, dropOldest = 0) {
    const repo = this.ed.persistence.snapshots;
    const times = (await repo.list(projectId)).map((s) => s.time);
    const remove = new Set(snapshotsToDelete(times, Date.now()));
    [...times].sort((a, b) => a - b).slice(0, dropOldest).forEach((t) => remove.add(t));
    await repo.removeMany([...remove].map((t) => [projectId, t]));
  }

  list(): Promise<SnapshotSummary[]> {
    return this.ed.persistence.snapshots.list(this.ed.doc.id).catch(() => []);
  }

  /** The open pattern's versions for a .xbird file, oldest first (thumbnails are redrawn on import). */
  async exportFile(): Promise<FileVersion[]> {
    const repo = this.ed.persistence.snapshots, id = this.ed.doc.id;
    const list = await this.list();
    const full = await Promise.all(list.map((s) => repo.get(id, s.time).catch(() => null)));
    return full
      .flatMap((s) => {
        try {
          return s ? [{ time: s.time, reason: s.reason, doc: JSON.parse(s.data) }] : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => a.time - b.time);
  }

  /** Versions from a .xbird file join this browser's versions of the pattern; ones already here are kept. */
  async importFile(projectId: string, versions: readonly FileVersion[]) {
    if (!versions.length) return;
    const repo = this.ed.persistence.snapshots;
    const have = new Set((await repo.list(projectId).catch(() => [])).map((s) => s.time));
    for (const v of versions) {
      if (have.has(v.time)) continue;
      let thumb: string | null = null;
      try {
        const { pattern } = parsePattern(v.doc, this.ed.state.symbols);
        thumb = this.thumb(pattern, buildPalette(pattern));
      } catch {
        continue;
      }
      const snap: Snapshot = { projectId, time: v.time, reason: v.reason, w: v.doc.w, h: v.doc.h, data: JSON.stringify(v.doc), thumb };
      await repo.add(snap).catch(() => {});
    }
    await this.prune(projectId).catch(() => {});
  }

  /** Restore keeps the project id and the time spent so far; the current state is snapshotted first. */
  async restore(time: number) {
    const s = await this.ed.persistence.snapshots.get(this.ed.doc.id, time);
    if (!s) return;
    await this.take("restore");
    const { pattern } = parsePattern(JSON.parse(s.data), this.ed.state.symbols);
    pattern.spent = Math.max(pattern.spent, this.ed.doc.spent);
    loadPattern(this.ed, pattern);
    this.ed.toast("toasts.restored");
  }
}
