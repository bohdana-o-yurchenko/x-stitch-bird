import { IDLE_AFTER, workGap } from "@/core/time/workTime";
import type { Editor } from "../createEditor";

/** Time spent is saved with the pattern at least this often while it grows. */
const SAVE_EVERY = 30_000;

/**
 * Counts active work on the open pattern (SPEC §15.17). The UI reports every user action (pointer press, drag,
 * key, wheel); time between actions counts while they come less than 3 minutes apart. There is nothing to start,
 * stop or edit by hand. Switching patterns starts afresh, so no time leaks from one pattern into another.
 */
export class WorkTimer {
  private last: number | null = null;
  private docId: string | null = null;
  private savedAt = 0;

  constructor(private ed: Editor, private now: () => number = () => Date.now()) {}

  activity() {
    // following another window: the work is counted there
    if (this.ed.live?.readOnly) return;
    const t = this.now(), doc = this.ed.doc;
    const gap = doc.id === this.docId ? workGap(this.last, t) : 0;
    this.docId = doc.id;
    this.last = t;
    if (!gap) return;
    doc.spent += gap;
    if (t - this.savedAt >= SAVE_EVERY) {
      this.savedAt = t;
      this.ed.autosave.scheduleTime();
    }
  }

  /** The timer is counting: the last action on this pattern was less than 3 minutes ago. */
  get running(): boolean {
    return this.last !== null && this.docId === this.ed.doc.id && this.now() - this.last <= IDLE_AFTER;
  }
}
