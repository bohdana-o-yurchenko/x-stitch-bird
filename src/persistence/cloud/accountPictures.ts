import type { UnderlayData } from "@/core/underlay/underlay";
import { imageId } from "../blobs";
import type { ImageRepository, PictureSync, ReferenceRepository, RefWindowData, UnderlayRepository } from "../ports";
import { account } from "./accountPatterns";

/*
 * A pattern's pictures in the account (SPEC §15.33): its photo windows (photo + marks) and the image behind the
 * chart. This browser stays the working copy; while signed in every change also goes up — pictures first, as they
 * came (never scaled down), then the records that use them. A change that couldn't go up (offline, tab closed) is
 * remembered here until it does. Two devices never overwrite each other unseen: the account counts revisions, and a
 * change made over an older one is merged (windows from both kept) rather than replacing it.
 */

/** Per pattern: the account revision this browser's records are based on, and changes not sent yet (0: none). */
interface SyncState {
  rev: number;
  dirty: number;
}

interface Remote {
  refs: RefWindowData[];
  underlay: UnderlayData | null;
  rev: number;
}

type SignedUpload = { method: "PUT"; url: string; headers?: Record<string, string> } | { method: "POST"; url: string; fields: Record<string, string> };

const STATE_KEY = "stitchwork.pictureSync";
/** Changes come in bursts (a marker stroke, a window dragged): they go up once things settle. */
const PUSH_DELAY = 2_000;
const CALL_TIMEOUT = 30_000;
const TRANSFER_TIMEOUT = 15 * 60_000;

function readStates(): Record<string, SyncState> {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") as Record<string, SyncState>;
  } catch {
    return {};
  }
}

function stateOf(id: string): SyncState | null {
  return readStates()[id] ?? null;
}

function setState(id: string, s: SyncState | null) {
  const all = readStates();
  if (s) all[id] = s;
  else delete all[id];
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(all));
  } catch {}
}

/** The app's own API, signed in only. Null: signed out or unreachable — nothing is assumed, nothing is lost. */
async function call(path: string, init: RequestInit = {}, timeout = CALL_TIMEOUT): Promise<Response | null> {
  if (!account.signedIn) return null;
  try {
    const res = await fetch(path, { credentials: "same-origin", signal: AbortSignal.timeout(timeout), ...init });
    if (res.status === 401) account.signedIn = false;
    return res.status >= 500 || res.status === 401 ? null : res;
  } catch {
    return null;
  }
}

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const pictureUrl = (id: string) => `/api/pictures/${encodeURIComponent(id)}`;
const recordsUrl = (patternId: string) => `/api/patterns/${encodeURIComponent(patternId)}/pictures`;

export const accountPictureApi = {
  /** The account's records for the pattern; null when it doesn't have the pattern, undefined when unreachable. */
  async get(patternId: string): Promise<Remote | null | undefined> {
    const res = await call(recordsUrl(patternId));
    if (!res) return undefined;
    return res.ok ? ((await res.json()) as Remote) : null;
  },
  put(patternId: string, body: { refs: RefWindowData[]; underlay: UnderlayData | null; base: number }) {
    return call(recordsUrl(patternId), { method: "PUT", ...json(body) });
  },
  /**
   * Sends one picture straight to storage, then has the account confirm it arrived. `{ used, max }`: it doesn't fit
   * in the account's room for photos (SPEC §15.35).
   */
  async upload(id: string, blob: Blob): Promise<boolean | { used: number; max: number }> {
    const res = await call(pictureUrl(id), { method: "POST", ...json({ type: blob.type || "application/octet-stream", size: blob.size }) });
    if (res?.status === 413) return (await res.json()) as { used: number; max: number };
    if (!res?.ok) return false;
    const target = (await res.json()) as SignedUpload;
    try {
      let sent: Response;
      if (target.method === "POST") {
        const form = new FormData();
        for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
        form.append("file", blob);
        sent = await fetch(target.url, { method: "POST", body: form, signal: AbortSignal.timeout(TRANSFER_TIMEOUT) });
      } else sent = await fetch(target.url, { method: "PUT", headers: target.headers, body: blob, signal: AbortSignal.timeout(TRANSFER_TIMEOUT) });
      if (!sent.ok) return false;
    } catch {
      return false;
    }
    const done = await call(pictureUrl(id), { method: "PUT" });
    if (done?.status === 413) return (await done.json()) as { used: number; max: number };
    return !!done?.ok;
  },
  /** The account has this picture already. */
  async has(id: string): Promise<boolean> {
    return !!(await call(pictureUrl(id)))?.ok;
  },
  /** One picture from the account, checked against its id (the id is its content hash). */
  async download(id: string): Promise<Blob | null> {
    const res = await call(pictureUrl(id));
    if (!res?.ok) return null;
    try {
      const { url } = (await res.json()) as { url: string };
      const got = await fetch(url, { signal: AbortSignal.timeout(TRANSFER_TIMEOUT) });
      if (!got.ok) return null;
      const blob = await got.blob();
      return (await imageId(blob)) === id ? blob : null;
    } catch {
      return null;
    }
  },
};

/** Every picture the records use. */
export function pictureIdsOf(refs: RefWindowData[], underlay: UnderlayData | null): string[] {
  const ids = new Set<string>();
  for (const r of refs) {
    if (r.image) ids.add(r.image);
    if (r.marks) ids.add(r.marks);
  }
  if (underlay?.image) ids.add(underlay.image);
  if (underlay?.straighten?.source) ids.add(underlay.straighten.source);
  return [...ids].filter((id) => id.startsWith("img:"));
}

/**
 * Changes made here over an older account revision, merged with the account's: every window from both stays (this
 * browser's version of one both have); this browser's underlay, or the account's when there is none here.
 */
export function mergePictures(mine: { refs: RefWindowData[]; underlay: UnderlayData | null }, theirs: Remote) {
  const here = new Set(mine.refs.map((r) => r.id));
  return { refs: [...mine.refs, ...theirs.refs.filter((r) => !here.has(r.id))], underlay: mine.underlay ?? theirs.underlay ?? null };
}

/** This browser's photo windows and underlays, and the account's alongside them while signed in. */
export function accountPictures(local: { references: ReferenceRepository; underlays: UnderlayRepository; images: ImageRepository }): PictureSync & {
  references: ReferenceRepository;
  underlays: UnderlayRepository;
} {
  const queues = new Map<string, Promise<void>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pulls = new Map<string, Promise<boolean>>();
  const listeners = new Set<(patternId: string) => void>();
  const fullListeners = new Set<(room: { used: number; max: number }) => void>();
  /** Saves into this browser under way: settling waits for them, as each marks a change to send. */
  const saving = new Set<Promise<unknown>>();

  function track<T>(p: Promise<T>): Promise<T> {
    saving.add(p);
    void p.finally(() => saving.delete(p)).catch(() => {});
    return p;
  }

  /** One thing at a time per pattern. */
  function serial(id: string, job: () => Promise<unknown>): Promise<void> {
    const next = (queues.get(id) ?? Promise.resolve()).then(job).then(() => {}, () => {});
    queues.set(id, next);
    void next.then(() => queues.get(id) === next && queues.delete(id));
    return next;
  }

  async function hasLocal(id: string) {
    return (await local.references.load(id)).length > 0 || !!(await local.underlays.load(id));
  }

  /** Brings the pictures into this browser; false when one couldn't be had. */
  async function fetchPictures(ids: string[]): Promise<boolean> {
    for (const id of ids) {
      if (await local.images.get(id)) continue;
      const blob = await accountPictureApi.download(id);
      if (!blob) return false;
      await local.images.put(blob);
    }
    return true;
  }

  /** The records of a pattern that has no sync state yet: ones here from before count as not sent. */
  async function current(id: string): Promise<SyncState | null> {
    const s = stateOf(id);
    if (s || !(await hasLocal(id))) return s;
    const fresh = { rev: 0, dirty: 1 };
    setState(id, fresh);
    return fresh;
  }

  async function pushNow(id: string) {
    if (!account.signedIn) return;
    const s = await current(id);
    if (!s?.dirty) return;
    const mark = s.dirty;
    let refs = await local.references.load(id), underlay = await local.underlays.load(id), base = s.rev;
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await accountPictureApi.put(id, { refs, underlay, base });
      // signed out, offline, or only in this browser: it stays marked, and goes up later
      if (!res || res.status === 404) return;
      if (res.ok) {
        const { rev } = (await res.json()) as { rev: number };
        const now = stateOf(id);
        setState(id, { rev, dirty: now && now.dirty !== mark ? now.dirty : 0 });
        return;
      }
      if (res.status !== 409) return;
      const body = (await res.json()) as { missing?: string[]; current?: Remote };
      if (body.missing) {
        for (const pid of body.missing) {
          const blob = await local.images.get(pid);
          if (!blob) return;
          const sent = await accountPictureApi.upload(pid, blob);
          // no room in the account: it stays here, marked, and goes up once there is (SPEC §15.35)
          if (typeof sent === "object") return fullListeners.forEach((fn) => fn(sent));
          if (!sent) return;
        }
      } else if (body.current) {
        // changed elsewhere since: keep both
        const merged = mergePictures({ refs, underlay }, body.current);
        if (!(await fetchPictures(pictureIdsOf(merged.refs, merged.underlay)))) return;
        const added = merged.refs.length !== refs.length || merged.underlay !== underlay;
        refs = merged.refs;
        underlay = merged.underlay;
        base = body.current.rev;
        if (added) {
          await local.references.save(id, refs);
          await local.underlays.save(id, underlay);
          listeners.forEach((fn) => fn(id));
        }
      } else return;
    }
  }

  /** The account's newer records into this browser. True when something here changed. */
  async function pullNow(id: string): Promise<boolean> {
    if (!account.signedIn) return false;
    const s = await current(id);
    if (s?.dirty) {
      push(id);
      return false;
    }
    const there = await accountPictureApi.get(id);
    if (!there || there.rev <= (s?.rev ?? 0)) return false;
    if (!(await fetchPictures(pictureIdsOf(there.refs, there.underlay)))) return false;
    // changed here meanwhile: that goes up and merges instead
    if (stateOf(id)?.dirty) return false;
    await local.references.save(id, there.refs);
    await local.underlays.save(id, there.underlay ?? null);
    setState(id, { rev: there.rev, dirty: 0 });
    return true;
  }

  /** Shared by the windows and the underlay of one pattern, loaded together. */
  function pull(id: string): Promise<boolean> {
    let p = pulls.get(id);
    if (!p) {
      p = new Promise<boolean>((done) => void serial(id, async () => done(await pullNow(id).catch(() => false))));
      pulls.set(id, p);
      void p.then(() => setTimeout(() => pulls.get(id) === p && pulls.delete(id), 3_000));
    }
    return p;
  }

  function push(id: string) {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      void serial(id, () => pushNow(id));
    }, PUSH_DELAY));
  }

  function changed(id: string) {
    const s = stateOf(id) ?? { rev: 0, dirty: 0 };
    setState(id, { ...s, dirty: s.dirty + 1 });
    push(id);
  }

  async function catchUp() {
    const dirty = Object.entries(readStates()).filter(([, s]) => s.dirty).map(([id]) => id);
    await Promise.all(dirty.map((id) => serial(id, () => pushNow(id))));
  }

  if (typeof window !== "undefined") window.addEventListener("online", () => void catchUp());

  return {
    references: {
      async load(id) {
        await pull(id);
        return local.references.load(id);
      },
      save: (id, refs) =>
        track(local.references.save(id, refs).then((r) => {
          if (r.ok) changed(id);
          return r;
        })),
    },
    underlays: {
      async load(id) {
        await pull(id);
        return local.underlays.load(id);
      },
      save: (id, underlay) =>
        track(local.underlays.save(id, underlay).then((r) => {
          if (r.ok) changed(id);
          return r;
        })),
    },
    push,
    catchUp,
    async refresh(id) {
      if (await pull(id)) listeners.forEach((fn) => fn(id));
    },
    async settle() {
      await Promise.allSettled([...saving]);
      for (const [id, t] of timers) {
        clearTimeout(t);
        timers.delete(id);
        void serial(id, () => pushNow(id));
      }
      await Promise.all(queues.values());
    },
    async forget(ids) {
      for (const id of ids) {
        const s = stateOf(id);
        // only what the account surely has
        if (!s || s.dirty || !s.rev) continue;
        await local.references.save(id, []);
        await local.underlays.save(id, null);
        setState(id, null);
      }
    },
    onChange(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    onFull(fn) {
      fullListeners.add(fn);
      return () => void fullListeners.delete(fn);
    },
  };
}
