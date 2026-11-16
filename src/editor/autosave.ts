import { serializePattern } from "@/core/formats/json/serialize";
import type { DraftStore } from "@/persistence/ports";
import type { Pattern } from "@/core/pattern/types";

const DRAFT_DELAY = 600;
/** Changes go to the saved patterns (and the account, while signed in) this long after editing stops… */
export const LIBRARY_QUIET = 5_000;
/** …and, while editing goes on, at least this often. */
export const LIBRARY_EVERY = 30_000;

/**
 * Two kinds of automatic saving (SPEC §9.2): the open pattern as a draft shortly after each change (this browser),
 * and into the saved patterns — the account too, while signed in — a few seconds after editing stops, at least
 * every half minute while it goes on. Both happen at once when the page is hidden.
 */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private libraryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsaved = false;
  /** When the oldest change not yet in the saved patterns was made. */
  private since = 0;
  /** A save to the saved patterns is under way. */
  private saving: Promise<unknown> | null = null;

  constructor(private draft: DraftStore, private doc: () => Pattern, private saveToLibrary: () => Promise<unknown>) {}

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flushDraft(), DRAFT_DELAY);
    if (!this.unsaved) this.since = Date.now();
    this.unsaved = true;
    if (this.libraryTimer) clearTimeout(this.libraryTimer);
    const wait = Math.max(0, Math.min(LIBRARY_QUIET, this.since + LIBRARY_EVERY - Date.now()));
    this.libraryTimer = setTimeout(() => void this.saveLibrary(), wait);
  }

  /** Changes not in the saved patterns yet, or a save still going: leaving now could lose them. */
  get pending() {
    return this.unsaved || !!this.saving;
  }

  /** The library already has this exact pattern (just opened from it, or just saved). */
  markSaved() {
    this.unsaved = false;
    if (this.libraryTimer) clearTimeout(this.libraryTimer);
    this.libraryTimer = null;
  }

  /**
   * Another pattern is about to replace this one: its unsaved changes go to the library now. Otherwise opening
   * another pattern within the minute would drop them (the library save only waits for the timer).
   */
  saveBeforeSwitch() {
    // the pattern is serialised right away, before the call returns
    if (this.unsaved) void this.saveLibrary();
  }

  private flushDraft() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.draft.save(serializePattern(this.doc()));
  }

  private async saveLibrary() {
    const changed = this.unsaved;
    this.markSaved();
    if (!changed) return;
    const run = this.saveToLibrary();
    this.saving = run;
    await run.finally(() => this.saving === run && (this.saving = null));
  }

  flush() {
    this.flushDraft();
    void this.saveLibrary();
  }
}
