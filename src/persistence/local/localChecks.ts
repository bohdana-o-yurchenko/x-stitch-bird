import { CHECK_KINDS, type CheckRun } from "@/core/readerCheck/types";
import type { CheckSaved } from "../cloud/accountChecks";

/*
 * Checks of reader apps signed out (SPEC §15.51): in this browser, one per kind of file — clearing it is how
 * another app gets checked.
 */

const KEY = "stitchwork.readerChecks";

function read(): CheckRun[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((c: CheckRun) => c && typeof c.id === "string" && CHECK_KINDS.includes(c.kind) && typeof c.app === "string" && c.marks && typeof c.marks === "object") : [];
  } catch {
    return [];
  }
}

function write(list: CheckRun[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const localCheckStore = {
  list: async (): Promise<CheckRun[]> => read().sort((a, b) => b.updated - a.updated),
  /** Saving a check replaces this browser's check of the same kind of file. */
  save: async (c: CheckRun): Promise<CheckSaved> => (write([...read().filter((x) => x.id !== c.id && x.kind !== c.kind), c]) ? "saved" : "failed"),
  remove: async (id: string): Promise<boolean> => write(read().filter((x) => x.id !== id)),
};
