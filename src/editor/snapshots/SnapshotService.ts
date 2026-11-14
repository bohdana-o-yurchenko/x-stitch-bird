import { parsePattern } from "@/core/formats/json/parse";
import { serializePattern } from "@/core/formats/json/serialize";
import { snapshotsToDelete } from "@/core/snapshots/retention";
import { renderChartImage } from "@/render/exportChart";
import type { SnapshotSummary } from "@/persistence/ports";
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
    let thumb: string | null = null;
    try {
      thumb = renderChartImage(p, this.ed.state.palette, "color", this.ed.theme, { heading: "", key: [] }, Math.max(1, Math.floor(96 / Math.max(p.w, p.h)))).toDataURL("image/png");
    } catch {}
    const snap = { projectId: p.id, time: Date.now(), reason, w: p.w, h: p.h, data, thumb };
    const repo = this.ed.persistence.snapshots;
    try {
      await repo.add(snap);
    } catch {
      await this.prune(p.id, 10).catch(() => {});
      await repo.add(snap).catch(() => {});
    }
    await this.prune(p.id).catch(() => {});
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

  /** Restore keeps the project id; the current state is snapshotted first. */
  async restore(time: number) {
    const s = await this.ed.persistence.snapshots.get(this.ed.doc.id, time);
    if (!s) return;
    await this.take("restore");
    const { pattern } = parsePattern(JSON.parse(s.data), this.ed.state.symbols);
    loadPattern(this.ed, pattern);
    this.ed.toast("toasts.restored");
  }
}
