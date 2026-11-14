import { isolatedCheck } from "./isolated";
import { duplicateEntriesCheck, rareEntriesCheck, unusedEntriesCheck } from "./keyChecks";
import { nearSymmetryCheck } from "./nearSymmetry";
import type { ChartCheck } from "./types";

export const CHECKS: readonly ChartCheck[] = [isolatedCheck, nearSymmetryCheck, unusedEntriesCheck, rareEntriesCheck, duplicateEntriesCheck];
