import { exportOxs } from "@/core/formats/oxs/exportOxs";
import { chartPdf } from "@/core/formats/pdf/chartPdf";
import { checkPatternKeeper, patternKeeperPdf } from "@/core/formats/pdf/patternKeeper";
import type { Translate } from "@/core/labels/keyLabel";
import { SUITES } from "@/core/readerCheck/suites";
import type { CheckKind, CheckRun, CheckSuite } from "@/core/readerCheck/types";
import { account, accountCheckApi, localCheckStore, type CheckSaved } from "@/persistence";
import { downloadFile } from "@/platform/files";
import { strokeLineStyle } from "@/render/primitives/lineStyles";
import type { Ctx } from "@/render/primitives/cells";
import { pdfFonts } from "./actions/importExport";

/*
 * "Does my app read it?" (SPEC §15.51) outside the editor: the test charts, their files to download, and the checks
 * people make of them — in this browser signed out (one per kind of file), in the account signed in (as many as they
 * like, up to the account's limit).
 */

export type { CheckKind, CheckRun, CheckSaved, CheckSuite };

const built = new Map<CheckKind, CheckSuite>();
/** A kind's test chart, made once. */
export function checkSuite(kind: CheckKind): CheckSuite {
  if (!built.has(kind)) built.set(kind, SUITES[kind]());
  return built.get(kind)!;
}

export interface CheckStore {
  /** Several checks of one kind of file may be kept (signed in). */
  many: boolean;
  /** Null when the account can't be reached. */
  list(): Promise<CheckRun[] | null>;
  save(c: CheckRun): Promise<CheckSaved>;
  remove(id: string): Promise<boolean>;
}

export function checkStore(signedIn: boolean): CheckStore {
  account.signedIn = signedIn;
  return signedIn ? { many: true, ...accountCheckApi } : { many: false, ...localCheckStore };
}

export const newCheckId = () => Math.random().toString(36).slice(2, 12);

const FILE_NAMES: Record<CheckKind, string> = { oxs: "ptashechka-check.oxs", pk: "ptashechka-check-pattern-keeper.pdf", pdf: "ptashechka-check-chart.pdf" };

/** Downloads a kind's test file. `t`: the interface's translations (the PDF chart's own texts). */
export async function downloadCheckFile(kind: CheckKind, t: Translate): Promise<void> {
  const p = checkSuite(kind).pattern;
  if (kind === "oxs") return downloadFile(FILE_NAMES.oxs, exportOxs(p));
  const fonts = await pdfFonts();
  const pdf = kind === "pk"
    ? await patternKeeperPdf(p, checkPatternKeeper(p), { fonts })
    : await chartPdf(p, { fonts, t, lineStyle: (g, x1, y1, x2, y2, w, u, sym) => strokeLineStyle(g as unknown as Ctx, x1, y1, x2, y2, w, u, sym) });
  downloadFile(FILE_NAMES[kind], new Blob([pdf as BlobPart], { type: "application/pdf" }));
}
