import { oxsSuite } from "./oxsSuite";
import { pdfSuite } from "./pdfSuite";
import { pkSuite } from "./pkSuite";
import type { CheckKind, CheckSuite } from "./types";

/** The test chart of each kind of file (SPEC §15.51). */
export const SUITES: Record<CheckKind, () => CheckSuite> = { oxs: oxsSuite, pk: pkSuite, pdf: pdfSuite };

/** Every tag the test charts use (each needs a `readerCheck.tags.<tag>` message). */
export const allTags = (): string[] => [...new Set(Object.values(SUITES).flatMap((s) => s().items.flatMap((i) => i.tags)))].sort();
/** Every group the test charts use (`readerCheck.groups.<group>`). */
export const allGroups = (): string[] => [...new Set(Object.values(SUITES).flatMap((s) => s().items.map((i) => i.group)))].sort();
