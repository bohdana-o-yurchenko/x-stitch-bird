import { parsePattern } from "@/core/formats/json/parse";
import { XBIRD_VERSION, type FileVersion, type PatternFile } from "@/core/formats/json/serialize";
import { newPatternId } from "@/core/pattern/createPattern";
import { patternStats, type PatternDetails } from "@/core/pattern/stats";
import { buildPalette } from "@/core/pattern/palette";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { CustomColor } from "@/core/pattern/types";
import { pictureIdsOf } from "@/persistence";
import { account, accountApi, accountPatternApi, accountThreadApi, accountUsageApi, createPersistence, versionApi, type AccountUsage, type Persistence, type PatternSummary } from "@/persistence";
import { downloadFile } from "@/platform/files";
import { PATTERN_EXT, safeName } from "./actions/importExport";
import { ImageService } from "./images/ImageService";
import { renderChartImage } from "@/render/exportChart";
import { defaultCanvasTheme } from "@/render/theme";

/*
 * Saved patterns outside the editor (SPEC §15.26, the My patterns page): this browser's and, signed in, the
 * account's — listed, previewed, deleted, and this browser's moved into the account.
 */

export type { AccountUsage };

/** What the signed-in account holds against its limits (SPEC §15.35); null signed out or offline. */
export const accountUsage = (): Promise<AccountUsage | null> => accountUsageApi.get();

/** A photo attached to a pattern (SPEC §15.37, Photos…): a photo window, or the image behind the chart. */
export interface AttachedPhoto {
  /** The window's id, or "underlay". */
  key: string;
  kind: "window" | "underlay";
  name: string;
  /** Its picture and marks (or the straighten source), in bytes. */
  bytes: number;
  /** A link to show it (an object URL; revoke when done). */
  url: string | null;
}

/** Longest side of a preview picture, in pixels. */
const PREVIEW_SIZE = 480;

/**
 * Before signing out: the account's patterns leave this browser (it may be a shared computer) — and the draft with
 * them when it's one of those. Patterns only here stay; nothing goes if the account can't be reached. The ids gone.
 */
export async function forgetAccountHere(persistence: Persistence): Promise<string[]> {
  const gone = (await persistence.patterns.trimCache?.({ all: true }).catch(() => [])) ?? [];
  // their photo windows too — those the account surely has
  await persistence.pictures?.forget(gone).catch(() => {});
  const draft = await persistence.draft.load().catch(() => null);
  if (draft && gone.includes(draft.id)) await persistence.draft.clear?.();
  return gone;
}

export function createLibrary(persistence: Persistence = createPersistence()) {
  /** A colour picture of a pattern file, its long side about PREVIEW_SIZE pixels. */
  function draw(doc: unknown): HTMLCanvasElement {
    const { pattern } = parsePattern(doc, ALL_SYMBOLS);
    const cell = Math.max(1, Math.floor(PREVIEW_SIZE / Math.max(pattern.w, pattern.h)));
    return renderChartImage(pattern, buildPalette(pattern), "color", defaultCanvasTheme, { heading: "", key: [] }, cell);
  }

  /** …of a pattern kept in this browser. */
  async function drawPreview(id: string): Promise<HTMLCanvasElement | null> {
    const doc = await persistence.patterns.load(id);
    return doc ? draw(doc) : null;
  }

  const images = new ImageService(persistence.images);

  /** The pattern file: this browser's copy, or the account's. */
  const fileOf = (id: string) => persistence.patterns.load(id).catch(() => null);

  /** Its photo windows and underlay, the account's brought into this browser first (with their pictures). */
  async function records(id: string) {
    return { refs: await persistence.references.load(id).catch(() => []), underlay: await persistence.underlays.load(id).catch(() => null) };
  }

  /** Bytes of these pictures here. */
  async function bytesOf(ids: (string | null | undefined)[]) {
    let n = 0;
    for (const id of new Set(ids.filter((x): x is string => !!x))) n += (await persistence.images.get(id).catch(() => null))?.size ?? 0;
    return n;
  }

  /** The draft (the pattern last worked on) when it's this one. */
  async function draftOf(id: string): Promise<PatternFile | null> {
    const d = await persistence.draft.load().catch(() => null);
    return d?.id === id ? d : null;
  }

  return {
    /** Tell storage who is signed in (from the session). */
    setSignedIn(on: boolean) {
      account.signedIn = on;
    },
    list: (): Promise<PatternSummary[]> => persistence.patterns.list(),
    /** Your own threads and beads in the account (SPEC §15.28); null when it can't be reached. */
    threads: (): Promise<CustomColor[] | null> => accountThreadApi.list(),
    saveThread: (c: CustomColor): Promise<boolean> => accountThreadApi.save(c),
    removeThread: (id: string): Promise<boolean> => accountThreadApi.remove(id),
    forgetAccountHere: () => forgetAccountHere(persistence),

    /**
     * Deletes the account and everything in it (SPEC §15.38), `email` typed to confirm; then this browser's copies
     * of its patterns go too (patterns only in this browser stay). False when it wasn't deleted.
     */
    async deleteAccount(email: string): Promise<boolean> {
      const theirs = (await persistence.patterns.list().catch(() => [])).filter((p) => p.where !== "browser").map((p) => p.id);
      if (!(await accountApi.remove(email))) return false;
      for (const id of theirs) await persistence.patterns.remove(id).catch(() => {});
      const draft = await persistence.draft.load().catch(() => null);
      if (draft && theirs.includes(draft.id)) await persistence.draft.clear?.();
      return true;
    },

    /** Deleted here and from the account; when it's the pattern last worked on, the editor starts afresh. */
    async remove(id: string) {
      await persistence.patterns.remove(id);
      if (await draftOf(id)) await persistence.draft.clear?.();
    },

    /**
     * The pattern as a .xbird work file (SPEC §15.37) — the same as the editor's Download: its photo windows,
     * underlay and versions (this browser's and the account's) inside. False when it can't be had.
     */
    async downloadXbird(p: PatternSummary): Promise<boolean> {
      const doc = (await draftOf(p.id)) ?? (await fileOf(p.id));
      if (!doc) return false;
      const { refs, underlay } = await records(p.id);
      const repo = persistence.snapshots;
      const versions: FileVersion[] = [];
      for (const s of await repo.list(p.id).catch(() => [])) {
        const full = await repo.get(p.id, s.time).catch(() => null);
        if (full) versions.push({ time: full.time, reason: full.reason, doc: JSON.parse(full.data) as PatternFile });
      }
      // signed in: the account's versions this browser hasn't got
      const theirs = account.signedIn ? ((await versionApi.list(p.id).catch(() => null)) ?? []) : [];
      const missing = theirs.map((v) => v.time).filter((t) => !versions.some((v) => v.time === t));
      for (let i = 0; i < missing.length; i += 10) versions.push(...((await versionApi.get(p.id, missing.slice(i, i + 10)).catch(() => null)) ?? []));
      versions.sort((a, b) => a.time - b.time);
      const file: PatternFile = {
        ...doc,
        xbird: XBIRD_VERSION,
        refs: await images.refsToFile(refs),
        ...(underlay ? { underlay: await images.underlayToFile(underlay) } : {}),
        ...(versions.length ? { versions } : {}),
        saved: p.updatedAt,
      };
      downloadFile(`${safeName(doc)}.${PATTERN_EXT}`, new Blob([JSON.stringify(file)], { type: "application/json" }));
      return true;
    },

    /** A new name, here and in the account (and in the draft, when it's the pattern last worked on). */
    async rename(p: PatternSummary, name: string): Promise<boolean> {
      const clean = name.trim();
      const doc = (await draftOf(p.id)) ?? (await fileOf(p.id));
      if (!doc || !clean) return false;
      const renamed = { ...doc, name: clean };
      if (await draftOf(p.id)) persistence.draft.save(renamed);
      return (await persistence.patterns.save(renamed)).ok;
    },

    /**
     * A copy, "<name> (copy)", with its photo windows and underlay (the pictures are shared, not stored twice); not
     * its versions. `limit`: the account is full — the copy is in this browser only.
     */
    async duplicate(p: PatternSummary, name: string): Promise<{ id: string; limit?: number } | null> {
      const doc = (await draftOf(p.id)) ?? (await fileOf(p.id));
      if (!doc) return null;
      const copy: PatternFile = { ...doc, id: newPatternId(), name };
      const r = await persistence.patterns.save(copy, { base: null });
      if (!r.ok) return null;
      const { refs, underlay } = await records(p.id);
      if (refs.length) await persistence.references.save(copy.id, refs);
      if (underlay) await persistence.underlays.save(copy.id, underlay);
      return { id: copy.id, ...(r.limit ? { limit: r.limit } : {}) };
    },

    /** The pattern's photos: its windows (photo + marks) and the image behind the chart. */
    async photos(p: PatternSummary): Promise<AttachedPhoto[]> {
      const { refs, underlay } = await records(p.id);
      const url = async (id: string) => {
        const b = await persistence.images.get(id).catch(() => null);
        return b ? URL.createObjectURL(b) : null;
      };
      const list: AttachedPhoto[] = [];
      // a PDF counts as the PDF (and its pages' marks), shown by its page drawn here (SPEC §15.41)
      for (const r of refs) list.push({ key: r.id, kind: "window", name: r.name, bytes: await bytesOf(pictureIdsOf([r], null)), url: await url(r.image) });
      if (underlay) list.push({ key: "underlay", kind: "underlay", name: "", bytes: await bytesOf(pictureIdsOf([], underlay)), url: await url(underlay.image) });
      return list;
    },

    /** Takes photos off the pattern (and so out of the account's room for photos): window ids, or "underlay". */
    async removePhotos(p: PatternSummary, keys: string[]) {
      const { refs, underlay } = await records(p.id);
      const left = refs.filter((r) => !keys.includes(r.id));
      if (left.length !== refs.length) await persistence.references.save(p.id, left);
      if (underlay && keys.includes("underlay")) await persistence.underlays.save(p.id, null);
    },

    /** The pattern last worked on in the editor (its draft): to continue with, at the top of the page. */
    async current(): Promise<{ id: string; name: string; w: number; h: number; count: number; preview: string | null } | null> {
      const doc = await persistence.draft.load().catch(() => null);
      if (!doc) return null;
      try {
        const { pattern } = parsePattern(doc, ALL_SYMBOLS);
        let preview: string | null = null;
        try {
          preview = draw(doc).toDataURL("image/png");
        } catch {
          // no canvas: the card shows without a picture
        }
        return { id: pattern.id, name: pattern.name, w: pattern.w, h: pattern.h, count: pattern.count, preview };
      } catch {
        return null;
      }
    },

    /**
     * A pattern's figures for the patterns list (SPEC §15.36): worked out here from this browser's copy (its photos
     * and versions here), or the account's for a pattern only there. Null when unknown.
     */
    async details(p: PatternSummary): Promise<PatternDetails | null> {
      const doc = (await draftOf(p.id)) ?? (p.where === "account" ? null : await persistence.patterns.load(p.id).catch(() => null));
      if (!doc) return p.details ?? null;
      try {
        const stats = patternStats(parsePattern(doc, ALL_SYMBOLS).pattern);
        const records = (await persistence.pictures?.localRecords(p.id).catch(() => null)) ?? { refs: [], underlay: null };
        // what the account keeps (a PDF, not its drawn pages, SPEC §15.41)
        const photoBytes = await bytesOf(pictureIdsOf(records.refs, records.underlay));
        const versions = (await persistence.snapshots.list(p.id).catch(() => [])).length;
        return {
          ...stats,
          bytes: new Blob([JSON.stringify(doc)]).size,
          photos: { count: records.refs.length + (records.underlay ? 1 : 0), bytes: photoBytes },
          versions: Math.max(versions, p.details?.versions ?? 0),
        };
      } catch {
        return p.details ?? null;
      }
    },

    /** An address for the pattern's preview: the account's picture when it has one, else drawn here. */
    async previewUrl(p: PatternSummary): Promise<string | null> {
      if (p.where !== "browser" && p.hasPreview) return accountPatternApi.previewUrl(p.id);
      if (p.where === "account") return null;
      try {
        return (await drawPreview(p.id))?.toDataURL("image/png") ?? null;
      } catch {
        return null;
      }
    },

    /** What the account holds against its limits (SPEC §15.35); null signed out or offline. */
    usage: accountUsage,

    /**
     * Copies patterns kept only in this browser into the account, with their previews. How many went, and `limit`
     * when the account filled up on the way (the rest stay in this browser, SPEC §15.35).
     */
    async moveToAccount(ids: string[], progress?: (done: number) => void): Promise<{ moved: number; limit?: number }> {
      let done = 0;
      for (const id of ids) {
        const doc = await persistence.patterns.load(id);
        if (!doc) continue;
        const up = await accountPatternApi.save(doc);
        if (!up.ok && up.limit) return { moved: done, limit: up.limit };
        if (!up.ok) continue;
        persistence.pictures?.push(id);
        const canvas = await drawPreview(id).catch(() => null);
        if (canvas) await new Promise<void>((ok) => canvas.toBlob((b) => void (b ? accountPatternApi.putPreview(id, b) : Promise.resolve()).finally(ok), "image/png"));
        // counted apart: `progress?.(++done)` skips the count when there's no progress callback
        done++;
        progress?.(done);
      }
      return { moved: done };
    },
  };
}

export type Library = ReturnType<typeof createLibrary>;
