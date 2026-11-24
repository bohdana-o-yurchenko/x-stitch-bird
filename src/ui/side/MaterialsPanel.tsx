"use client";

import { useTranslations } from "next-intl";
import { materialsOf, usedBeadBrands, usedThreadBrands, usesBeads } from "@/core/pattern/brands";
import { useCommand, useEditorState } from "../hooks/editor";
import { MaterialsForm, brandChoices } from "../threads/MaterialsForm";
import { Section } from "./Section";
import s from "./side.module.css";

/** Threads & beads of the open pattern (SPEC §15.31): the same checkboxes as the New dialog; brands the key uses stay. */
export function MaterialsPanel() {
  const t = useTranslations("materials");
  const run = useCommand();
  // brands live in the key: drawn again when it changes, not on every stroke
  useEditorState((st) => st.keyRevision);
  const p = useEditorState((st) => st.doc);
  const inventory = useEditorState((st) => st.inventory);
  const choices = brandChoices(p, inventory);
  return (
    <Section id="materials" title={t("heading")}>
      <div className={s.section}>
        <MaterialsForm
          value={materialsOf(p)}
          threadChoices={choices.threads}
          beadChoices={choices.beads}
          locks={{ threads: usedThreadBrands(p), beads: usedBeadBrands(p), beadsUsed: usesBeads(p) }}
          onChange={(m) => run("pattern.setMaterials", m)}
        />
      </div>
    </Section>
  );
}
