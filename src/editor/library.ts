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
const PREVIEW_SIZE = 240;

export function createLibrary(persistence: Persistence = createPersistence()) {
  /** A colour picture of a pattern kept in this browser, drawn from its file. */
  async function drawPreview(id: string): Promise<HTMLCanvasElement | null> {
    const doc = await persistence.patterns.load(id);
    if (!doc) return null;
    const { pattern } = parsePattern(doc, ALL_SYMBOLS);
    const cell = Math.max(1, Math.floor(PREVIEW_SIZE / Math.max(pattern.w, pattern.h)));
    return renderChartImage(pattern, buildPalette(pattern), "color", defaultCanvasTheme, { heading: "", key: [] }, cell);
  }

  return {
    /** Tell storage who is signed in (from the session). */
    setSignedIn(on: boolean) {
      account.signedIn = on;
    },
    list: (): Promise<PatternSummary[]> => persistence.patterns.list(),
    remove: (id: string) => persistence.patterns.remove(id),

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
