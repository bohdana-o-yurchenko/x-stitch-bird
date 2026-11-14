import type { RefWindowData } from "@/persistence/ports";
import type { Editor } from "../createEditor";

/** Returns the window's current marks as a PNG data URL (or the stored one until they have been drawn back). */
export type MarksProvider = () => string | null;

const SAVE_DELAY = 700;

/**
 * Reference photo windows per pattern (SPEC §11). Saving is disabled while a pattern's windows are being
 * restored, so an empty list can never overwrite stored photos and marks.
 */
export class ReferenceService {
  private patternId: string | null = null;
  private ready = false;
  private dirty = false;
  private warned = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private marks = new Map<string, MarksProvider>();

  constructor(private ed: Editor) {}

  private get list() {
    return this.ed.state.references;
  }

  private setList(list: RefWindowData[]) {
    this.ed.store.setState({ references: list });
  }

  async switchTo(patternId: string, incoming: RefWindowData[] | null) {
    if (this.dirty) this.saveNow();
    this.patternId = patternId;
    this.ready = false;
    this.setList([]);
    const data = incoming ?? (await this.ed.persistence.references.load(patternId));
    if (this.patternId !== patternId) return;
    this.ready = true;
    this.setList((data ?? []).filter((d) => d && d.src));
    // windows that came inside a loaded file are stored right away
    if (incoming) this.save();
  }

  add(d: Pick<RefWindowData, "src" | "name"> & Partial<RefWindowData>) {
    const n = this.list.length;
    const w = typeof window === "undefined" ? 1400 : window.innerWidth;
    const ref: RefWindowData = {
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      x: Math.max(8, w - 380 - 360 - n * 28), y: 70 + n * 28, w: 360, h: 320,
      min: false, op: 1, view: null, tool: "marker", color: "#16A34A", size: 14, grid: false, showSt: false, marks: null,
      ...d,
    };
    this.setList([...this.list, ref]);
    this.save();
  }

  update(id: string, patch: Partial<RefWindowData>) {
    this.setList(this.list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    this.save();
  }

  remove(id: string) {
    this.marks.delete(id);
    this.setList(this.list.filter((r) => r.id !== id));
    this.save();
  }

  registerMarks(id: string, provider: MarksProvider) {
    this.marks.set(id, provider);
    return () => void (this.marks.get(id) === provider && this.marks.delete(id));
  }

  exportAll(): RefWindowData[] {
    return this.list.map((r) => ({ ...r, marks: this.marks.get(r.id)?.() ?? r.marks }));
  }

  save() {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), SAVE_DELAY);
  }

  saveNow() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.patternId || !this.ready) return;
    this.dirty = false;
    void this.ed.persistence.references.save(this.patternId, this.exportAll()).then((r) => {
      if (!r.ok && !this.warned) {
        this.warned = true;
        this.ed.toast("toasts.refsTooBig");
      }
    });
  }

  flush() {
    if (this.dirty) this.saveNow();
  }
}
