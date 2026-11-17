"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BUILT_IN_BEAD_BRANDS, BUILT_IN_THREAD_BRANDS, type Materials } from "@/core/pattern/brands";
import type { CustomColor, Pattern } from "@/core/pattern/types";
import { cx, ui } from "../common/widgets";
import s from "./threads.module.css";

/** Brands that can't be unticked (the key uses them), and whether beads can be turned off. */
export interface MaterialsLocks {
  threads: ReadonlySet<string>;
  beads: ReadonlySet<string>;
  beadsUsed: boolean;
}

/** Brands to offer: the built-in ones, then your own (the pattern's and, signed in, your inventory's). */
export function brandChoices(p: Pattern, inventory: readonly CustomColor[] | null) {
  const own = (kind: "thread" | "bead") => [...Object.values(p.customs), ...(inventory ?? [])].filter((c) => c.kind === kind).map((c) => c.brand);
  return { threads: [...new Set([...BUILT_IN_THREAD_BRANDS, ...own("thread")])], beads: [...new Set([...BUILT_IN_BEAD_BRANDS, ...own("bead")])] };
}

const NO_LOCKS: MaterialsLocks = { threads: new Set(), beads: new Set(), beadsUsed: false };

/**
 * Threads & beads of a pattern (SPEC §15.31), as checkboxes: its thread brands — and, with exactly one ticked, "only
 * this brand"; beads on or off, their brands likewise. A brand of your own can be added by name. The New dialog and
 * the side panel use it.
 */
export function MaterialsForm({ value, threadChoices, beadChoices, locks = NO_LOCKS, onChange }: {
  value: Materials;
  threadChoices: readonly string[];
  beadChoices: readonly string[];
  locks?: MaterialsLocks;
  onChange: (m: Materials) => void;
}) {
  const t = useTranslations("materials");
  const set = (patch: Partial<Materials>) => onChange({ ...value, ...patch });
  return (
    <div className={s.materials} data-testid="materials">
      <section className={s.matGroup}>
        <h4 className={s.matTitle}>{t("threads")}</h4>
        <BrandBoxes
          kind="threads"
          chosen={value.brands}
          choices={threadChoices}
          locked={locks.threads}
          only={value.onlyBrand}
          onChosen={(brands) => set({ brands, onlyBrand: value.onlyBrand && brands.length === 1 })}
          onOnly={(onlyBrand) => set({ onlyBrand })}
        />
      </section>
      <section className={s.matGroup}>
        <div className={s.matTitleRow}>
          <h4 className={s.matTitle}>{t("beads")}</h4>
          {/* beads on or off: a switch in the heading */}
          <label className={s.switch} title={locks.beadsUsed ? t("beadsUsed") : undefined}>
            <input type="checkbox" role="switch" checked={!value.noBeads} disabled={locks.beadsUsed} onChange={(e) => set({ noBeads: !e.target.checked })} />
            <span>{t("hasBeads")}</span>
          </label>
        </div>
        {!value.noBeads && (
          <BrandBoxes
            kind="beads"
            chosen={value.beadBrands}
            choices={beadChoices}
            locked={locks.beads}
            only={value.onlyBeadBrand}
            onChosen={(beadBrands) => set({ beadBrands, onlyBeadBrand: value.onlyBeadBrand && beadBrands.length === 1 })}
            onOnly={(onlyBeadBrand) => set({ onlyBeadBrand })}
          />
        )}
      </section>
    </div>
  );
}

function BrandBoxes({ kind, chosen, choices, locked, only, onChosen, onOnly }: {
  kind: "threads" | "beads";
  chosen: string[];
  choices: readonly string[];
  locked: ReadonlySet<string>;
  only: boolean;
  onChosen: (b: string[]) => void;
  onOnly: (on: boolean) => void;
}) {
  const t = useTranslations("materials");
  const [naming, setNaming] = useState(false);
  const all = [...new Set([...choices, ...chosen])];
  const toggle = (b: string, on: boolean) => onChosen(on ? [...chosen, b] : chosen.filter((x) => x !== b));
  const add = (name: string) => {
    const b = name.trim();
    setNaming(false);
    if (b && !chosen.includes(b)) onChosen([...chosen, b]);
  };
  return (
    <div className={s.matBody} role="group" aria-label={t(kind)} data-testid={`materials-${kind}`}>
      <div className={s.matBoxes}>
        {all.map((b) => {
          const on = chosen.includes(b), fixed = locked.has(b) || (on && chosen.length === 1);
          return (
            <label key={b} className={s.matBox} title={locked.has(b) ? t("brandUsed", { brand: b }) : undefined}>
              <input type="checkbox" checked={on} disabled={on && fixed} onChange={(e) => toggle(b, e.target.checked)} />
              <span>{b}</span>
            </label>
          );
        })}
        {naming ? (
          <input
            className={cx(ui.input, s.matNew)}
            autoFocus
            placeholder={t("brandName")}
            aria-label={t("brandName")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(e.currentTarget.value);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setNaming(false);
              }
            }}
            onBlur={(e) => add(e.currentTarget.value)}
          />
        ) : (
          <button type="button" className={s.matAdd} onClick={() => setNaming(true)}>{t("newBrand")}</button>
        )}
      </div>
      {chosen.length === 1 && (
        <label className={s.matOnly}>
          <input type="checkbox" checked={only} onChange={(e) => onOnly(e.target.checked)} />
          <span>{t(kind === "threads" ? "onlyThreads" : "onlyBeads", { brand: chosen[0]! })}</span>
        </label>
      )}
    </div>
  );
}
