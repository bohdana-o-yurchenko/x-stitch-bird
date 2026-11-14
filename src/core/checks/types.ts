import type { KeyIndex, Pattern } from "../pattern/types";

export interface OptionSpec {
  id: string;
  type: "number" | "boolean";
  default: number | boolean;
  min?: number;
  max?: number;
}

export interface Finding {
  /** Stable across runs, so "Ignore" can hide it for the session. */
  id: string;
  checkId: string;
  /** Cell to centre on; entry-level findings have `entry` instead. */
  cell?: number;
  entry?: KeyIndex;
  related?: number[];
  messageKey: string;
  params?: Record<string, string | number>;
  /** Near symmetry: copy the entry at `from` onto `to`. */
  suggestion?: { to: number; from: number }[];
}

/** An on-demand chart check (ARCHITECTURE §14.4). */
export interface ChartCheck {
  id: string;
  options: readonly OptionSpec[];
  run(p: Pattern, opts: Record<string, number | boolean>): Finding[];
}

export const optionDefaults = (c: ChartCheck): Record<string, number | boolean> =>
  Object.fromEntries(c.options.map((o) => [o.id, o.default]));
