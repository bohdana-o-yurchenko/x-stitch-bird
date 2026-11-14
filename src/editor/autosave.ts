import { serializePattern } from "@/core/formats/json/serialize";
import type { DraftStore } from "@/persistence/ports";
import type { Pattern } from "@/core/pattern/types";

const DELAY = 600;

/** Writes the edited pattern as a draft shortly after each change, and at once when the page is hidden. */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private draft: DraftStore, private doc: () => Pattern) {}

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), DELAY);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.draft.save(serializePattern(this.doc()));
  }
}
