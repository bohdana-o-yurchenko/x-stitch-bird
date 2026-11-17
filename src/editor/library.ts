import { parsePattern } from "@/core/formats/json/parse";
import { buildPalette } from "@/core/pattern/palette";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { account, accountPatternApi, createPersistence, type Persistence, type PatternSummary } from "@/persistence";
import { renderChartImage } from "@/render/exportChart";
import { defaultCanvasTheme } from "@/render/theme";
import { keepForGood } from "./keepPattern";

/*
 * Saved patterns outside the editor (SPEC §15.26, the My patterns page): this browser's and, signed in, the
 * account's — listed, previewed, deleted, and this browser's moved into the account.
 */

/** Longest side of a preview picture, in pixels. */
const PREVIEW_SIZE = 480;

/**
 * Before signing out: the account's patterns leave this browser (it may be a shared computer) — and the draft with
 * them when it's one of those. Patterns only here stay; nothing goes if the account can't be reached. The ids gone.
 */
export async function forgetAccountHere(persistence: Persistence): Promise<string[]> {
  const gone = (await persistence.patterns.trimCache?.({ all: true }).catch(() => [])) ?? [];
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

    /** Copies patterns kept only in this browser into the account, with their previews. Returns how many went. */
    async moveToAccount(ids: string[], progress?: (done: number) => void): Promise<number> {
      let done = 0;
      for (const id of ids) {
        const doc = await persistence.patterns.load(id);
        if (!doc || !(await accountPatternApi.save(doc))) continue;
        keepForGood(id);
        const canvas = await drawPreview(id).catch(() => null);
        if (canvas) await new Promise<void>((ok) => canvas.toBlob((b) => void (b ? accountPatternApi.putPreview(id, b) : Promise.resolve()).finally(ok), "image/png"));
        progress?.(++done);
      }
      return done;
    },
  };
}

export type Library = ReturnType<typeof createLibrary>;
