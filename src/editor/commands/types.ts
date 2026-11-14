import type { Editor } from "../createEditor";

/** One user action, shared by buttons, menus and shortcuts (ARCHITECTURE §6.2). */
export interface Command {
  id: string;
  run(ed: Editor, args?: unknown): unknown;
  enabled?(ed: Editor): boolean;
  /** Snapshot reason; the registry takes a snapshot before running (SPEC §15.7). */
  destructive?: string;
}
