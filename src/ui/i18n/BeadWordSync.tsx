"use client";

import { useLocale } from "next-intl";
import { setBeadWord } from "@/core/catalog/catalog";

const WORDS: Record<string, string> = { uk: "Бісер", en: "Bead" };

/** Sets the word that prefixes numbered-organizer beads to the interface language. */
export function BeadWordSync() {
  setBeadWord(WORDS[useLocale()] ?? "Bead");
  return null;
}
