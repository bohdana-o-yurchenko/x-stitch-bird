import { parsePattern } from "@/core/formats/json/parse";
import { patternStats, type PatternDetails } from "@/core/pattern/stats";
import { buildPalette } from "@/core/pattern/palette";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { CustomColor } from "@/core/pattern/types";
import { account, accountPatternApi, accountThreadApi, accountUsageApi, createPersistence, type AccountUsage, type Persistence, type PatternSummary } from "@/persistence";
import { renderChartImage } from "@/render/exportChart";
import { defaultCanvasTheme } from "@/render/theme";
import { keepForGood } from "./keepPattern";

/*
 * Saved patterns outside the editor (SPEC §15.26, the My patterns page): this browser's and, signed in, the
 * account's — listed, previewed, deleted, and this browser's moved into the account.
 */

export type { AccountUsage };

/** What the signed-in account holds against its limits (SPEC §15.35); null signed out or offline. */
export const accountUsage = (): Promise<AccountUsage | null> => accountUsageApi.get();

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
    remove: (id: string) => persistence.patterns.remove(id),

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
      if (p.where === "account") return p.details ?? null;
      const doc = await persistence.patterns.load(p.id).catch(() => null);
      if (!doc) return p.details ?? null;
      try {
        const stats = patternStats(parsePattern(doc, ALL_SYMBOLS).pattern);
        const records = (await persistence.pictures?.localRecords(p.id).catch(() => null)) ?? { refs: [], underlay: null };
        const ids = new Set<string>();
        for (const r of records.refs) [r.image, r.marks].forEach((id) => id && ids.add(id));
        [records.underlay?.image, records.underlay?.straighten?.source].forEach((id) => id && ids.add(id));
        let photoBytes = 0;
        for (const id of ids) photoBytes += (await persistence.images.get(id).catch(() => null))?.size ?? 0;
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
        keepForGood(id);
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
