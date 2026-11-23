import type { NewPatternOptions } from "./actions/pattern";

/*
 * What the editor opens on arrival (SPEC §15.37), decided before it shows anything: the pattern worked on last, a
 * pattern picked on the patterns page (`?open=<id>`), a new one (`?new=1`; `?new=pdf`: from a PDF chart), or what
 * was chosen there — a file, or a new pattern's settings — kept in memory across the page change (the app doesn't
 * reload), so the file itself needn't go anywhere.
 */
export type StartIntent =
  | { kind: "resume" }
  | { kind: "open"; id: string }
  | { kind: "new"; from?: "pdf" }
  | { kind: "image" | "file" | "pdf"; file: File }
  | { kind: "create"; options: NewPatternOptions };

type Picked = Extract<StartIntent, { file: File } | { kind: "create" }>;

let picked: Picked | null = null;

/** The patterns page hands over a picked picture, work file or PDF chart, or a new pattern's settings. */
export function requestStart(r: Picked) {
  picked = r;
}

/** What to open, read once: the picked file (taken), else the address's `open` / `new` (removed from it). */
export function takeStartIntent(): StartIntent {
  const file = picked;
  picked = null;
  if (typeof window === "undefined") return file ?? { kind: "resume" };
  const url = new URL(window.location.href), open = url.searchParams.get("open"), make = url.searchParams.get("new");
  if (open !== null || make !== null) {
    url.searchParams.delete("open");
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url);
  }
  if (file) return file;
  return open ? { kind: "open", id: open } : make === "pdf" ? { kind: "new", from: "pdf" } : make !== null ? { kind: "new" } : { kind: "resume" };
}

/** What went wrong while starting a pattern from the patterns page (a toast's message key), said back there. */
export type HandedBack = { key: string; values?: Record<string, string | number> };

let handedBack: HandedBack | null = null;

export function handBack(note: HandedBack) {
  handedBack = note;
}

/** Read once by the patterns page. */
export function takeHandedBack(): HandedBack | null {
  const note = handedBack;
  handedBack = null;
  return note;
}
