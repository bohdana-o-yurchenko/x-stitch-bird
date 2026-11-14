import type { ColorEntry } from "../color/colorEntry";
import type { Pattern } from "../pattern/types";
import type { UsageReport } from "./usage";

export interface ShoppingLine {
  item: ColorEntry;
  kind: "thread" | "bead" | "other";
  quantity: number;
  unit: "skein" | "meter" | "bead" | "pack";
}

export interface ShoppingList {
  lines: ShoppingLine[];
  /** Message keys explaining the rules. */
  notes: string[];
}

/** A strategy that turns usage facts into what to buy (ARCHITECTURE §10). */
export interface ShoppingCalculator {
  id: string;
  defaults: Readonly<Record<string, number>>;
  calculate(input: { pattern: Pattern; usage: UsageReport; settings: Record<string, number> }): ShoppingList;
}
