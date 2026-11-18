/*
 * What the editor opens on arrival (SPEC §15.37), decided before it shows anything: the pattern worked on last, a
 * pattern picked on the patterns page (`?open=<id>`), a new one (`?new=1`; `?new=pdf`: from a PDF chart), or a file
 * picked there — kept in memory across the page change (the app doesn't reload), so the file itself needn't go
 * anywhere.
 */
export type StartIntent = { kind: "resume" } | { kind: "open"; id: string } | { kind: "new"; from?: "pdf" } | { kind: "image" | "file"; file: File };

let picked: { kind: "image" | "file"; file: File } | null = null;

/** The patterns page hands over a picked picture or work file. */
export function requestStart(r: { kind: "image" | "file"; file: File }) {
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
