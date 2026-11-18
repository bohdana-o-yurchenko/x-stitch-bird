import type { FileVersion } from "@/core/formats/json/serialize";
import { account } from "./accountPatterns";

/*
 * One pattern open in several windows or devices (SPEC §15.34): checking in, taking over the editing, and the
 * pattern's versions from every device. Signed in only; null/undefined when signed out or unreachable.
 */

export interface LiveState {
  rev: number;
  editor: "me" | "other" | null;
  handOver: boolean;
  waiting: boolean;
  others: number;
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!account.signedIn) return null;
  try {
    const res = await fetch(path, { credentials: "same-origin", signal: AbortSignal.timeout(20_000), ...init });
    if (res.status === 401) account.signedIn = false;
    return res.status >= 500 || res.status === 401 ? null : res;
  } catch {
    return null;
  }
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const live = (id: string) => `/api/patterns/${encodeURIComponent(id)}/live`;
const versions = (id: string) => `/api/patterns/${encodeURIComponent(id)}/versions`;

export const liveApi = {
  /** The pattern's state; null: the account doesn't have it; undefined: unreachable. */
  async checkIn(id: string, window: string, editing: boolean): Promise<LiveState | null | undefined> {
    const res = await call(live(id), json({ window, editing }));
    if (!res) return undefined;
    return res.ok ? ((await res.json()) as LiveState) : null;
  },
  async claim(id: string, window: string): Promise<{ waiting: boolean } | null> {
    const res = await call(live(id), json({ window, action: "claim" }));
    return res?.ok ? ((await res.json()) as { waiting: boolean }) : null;
  },
  async release(id: string, window: string): Promise<void> {
    await call(live(id), json({ window, action: "release" }));
  },
  /** This window has gone. `closing`: the page is closing — the request goes even so. */
  async leave(id: string, window: string, closing = false): Promise<void> {
    await call(live(id), { ...json({ window, action: "leave" }), ...(closing && { keepalive: true }) });
  },
};

export const versionApi = {
  async list(id: string): Promise<{ time: number; reason: string }[] | null> {
    const res = await call(versions(id));
    return res?.ok ? ((await res.json()) as { time: number; reason: string }[]) : null;
  },
  async get(id: string, times: number[]): Promise<FileVersion[] | null> {
    const res = await call(`${versions(id)}?times=${times.join(",")}`);
    return res?.ok ? ((await res.json()) as FileVersion[]) : null;
  },
  async add(id: string, list: FileVersion[]): Promise<boolean> {
    return !!(await call(versions(id), json(list)))?.ok;
  },
};
