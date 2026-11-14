import { serializePattern } from "@/core/formats/json/serialize";
import type { DraftStore } from "@/persistence/ports";
import type { Pattern } from "@/core/pattern/types";

const DRAFT_DELAY = 600;
/** How often changes also go to the saved-patterns library (File ▸ Open saved pattern). */
export const LIBRARY_EVERY = 60_000;

/**
 * Two kinds of automatic saving (SPEC §9.2): the open pattern as a draft shortly after each change, and into
 * the library at most once a minute while it has unsaved changes. Both happen at once when the page is hidden.
 */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private libraryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsaved = false;

  constructor(private draft: DraftStore, private doc: () => Pattern, private saveToLibrary: () => Promise<unknown>) {}

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flushDraft(), DRAFT_DELAY);
    this.unsaved = true;
    this.libraryTimer ??= setTimeout(() => void this.saveLibrary(), LIBRARY_EVERY);
  }

  /** The library already has this exact pattern (just opened from it, or just saved). */
  markSaved() {
    this.unsaved = false;
    if (this.libraryTimer) clearTimeout(this.libraryTimer);
    this.libraryTimer = null;
  }

  private flushDraft() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.draft.save(serializePattern(this.doc()));
  }

  private async saveLibrary() {
    const changed = this.unsaved;
    this.markSaved();
    if (changed) await this.saveToLibrary();
  }

  flush() {
    this.flushDraft();
    void this.saveLibrary();
  }
}
