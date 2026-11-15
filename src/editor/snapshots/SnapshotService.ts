import { parsePattern } from "@/core/formats/json/parse";
import { serializePattern, type FileVersion } from "@/core/formats/json/serialize";
import { buildPalette, type Palette } from "@/core/pattern/palette";
import type { Pattern } from "@/core/pattern/types";
import { snapshotsToDelete } from "@/core/snapshots/retention";
import { renderChartImage } from "@/render/exportChart";
import type { Snapshot, SnapshotSummary } from "@/persistence/ports";
import type { Editor } from "../createEditor";
import { loadPattern } from "../actions/pattern";

const EVERY = 5 * 60_000;

/** Automatic snapshots (SPEC §15.7): every 5 minutes while editing, and before destructive commands. */
export class SnapshotService {
  private lastRevision = -1;
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
    const snap = { projectId: p.id, time: Date.now(), reason, w: p.w, h: p.h, data, thumb: this.thumb(p, this.ed.state.palette) };
    const repo = this.ed.persistence.snapshots;
    try {
      await repo.add(snap);
    } catch {
      await this.prune(p.id, 10).catch(() => {});
      await repo.add(snap).catch(() => {});
    }
    await this.prune(p.id).catch(() => {});
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
