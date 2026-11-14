import type { RefWindowData, RefWindowFile } from "@/persistence/ports";
import { canvasToBlob } from "@/platform/images";
import type { Editor } from "../createEditor";

const SAVE_DELAY = 700;

/**
 * Reference photo windows per pattern (SPEC §11). The photo and the marks are stored pictures (ids); the window
 * record itself is small. Saving is disabled while a pattern's windows are being restored, so an empty list can
 * never overwrite stored ones.
 */
export class ReferenceService {
  private patternId: string | null = null;
  private ready = false;
  private dirty = false;
  private warned = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Latest marks change per window, so a slow older save can't overwrite a newer one. */
  private marksVersion = new Map<string, number>();

  constructor(private ed: Editor) {}

  private get list() {
    return this.ed.state.references;
  }

  private setList(list: RefWindowData[]) {
    this.ed.store.setState({ references: list });
  }

  /** `incoming`: windows from a loaded .json file (pictures as data URLs). */
  async switchTo(patternId: string, incoming: unknown[] | null) {
    if (this.dirty) this.saveNow();
    this.patternId = patternId;
    this.ready = false;
    this.setList([]);
    // an empty list stays synchronous, so a window added right after loading (image → pattern) isn't lost
    const data = incoming ? (incoming.length ? await this.ed.images.refsFromFile(incoming) : []) : await this.ed.persistence.references.load(patternId);
    if (this.patternId !== patternId) return;
    this.ready = true;
    this.setList((data ?? []).filter((d) => d && d.image));
    // windows that came inside a loaded file are stored right away
    if (incoming) this.save();
  }

  add(d: Pick<RefWindowData, "image" | "name"> & Partial<RefWindowData>) {
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
    this.marksVersion.delete(id);
    this.setList(this.list.filter((r) => r.id !== id));
    this.save();
  }

  /** Stores the window's marks after a stroke, undo or clear; `null` = no marks. */
  async setMarks(id: string, canvas: HTMLCanvasElement | null) {
    const v = (this.marksVersion.get(id) ?? 0) + 1;
    this.marksVersion.set(id, v);
    const marks = canvas ? await this.ed.images.put(await canvasToBlob(canvas)) : null;
    if (this.marksVersion.get(id) === v && this.list.some((r) => r.id === id)) this.update(id, { marks });
  }

  /** The windows as written into a .json file. */
  exportFile(): Promise<RefWindowFile[]> {
    return this.ed.images.refsToFile(this.list);
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
    void this.ed.persistence.references.save(this.patternId, this.list).then((r) => {
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
