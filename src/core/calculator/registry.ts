import { classicSkeins } from "./classicSkeins";
import type { ShoppingCalculator } from "./types";

export const CALCULATORS: readonly ShoppingCalculator[] = [classicSkeins];

export const calculator = (id?: string): ShoppingCalculator => CALCULATORS.find((c) => c.id === id) ?? classicSkeins;
