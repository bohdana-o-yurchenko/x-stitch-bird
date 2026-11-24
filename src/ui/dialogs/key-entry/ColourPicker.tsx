"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BEAD_CATALOGUES, THREAD_CATALOGUES, byNumber, matchesQuery } from "@/core/catalog/catalog";
import { byColour } from "@/core/catalog/colourInfo";
import type { ColorEntry } from "@/core/color/colorEntry";
import { BUILT_IN_BEAD_BRANDS, BUILT_IN_THREAD_BRANDS, ORGANIZER, canRemoveBeadBrand, canRemoveBrand, materials, materialsOf, nextOrganizerCode, organizerCodeTaken } from "@/core/pattern/brands";
import { customColor, resolveColor } from "@/core/pattern/resolve";
import { addCustomColour, updateCustomColour } from "@/editor/actions/keyEntries";
import { Swatch, cx, ui } from "../../common/widgets";
import { useCommand, useEditor, useEditorState } from "../../hooks/editor";
import { useBrandLabel } from "../../threads/brandLabel";
import { ThreadForm, type ThreadFields } from "../../threads/ThreadForm";
import s from "./keyEntry.module.css";

/** The thread form: closed, adding one, or changing your own thread `id`. */
type FormState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; id: string } | { mode: "copy"; id: string; from: { brand: string; name: string; hex: string } };

/**
 * Searchable list of threads or beads, with your own colours (SPEC §8.1, §15.28). Threads come in one tab per brand of
 * the pattern — a brand can be added here, and removed while no entry uses it. Enter in the search picks the top match.
 */
export function ColourPicker({ kind, selected, onPick, height = 240, autoFocus }: { kind: "thread" | "bead"; selected: string; onPick: (id: string) => void; height?: number; autoFocus?: boolean }) {
  const t = useTranslations("picker");
  const label = useBrandLabel();
  const ed = useEditor();
  const run = useCommand();
  // brands and your own threads live in the pattern: redraw when it changes
  const revision = useEditorState((st) => st.keyRevision);
  const doc = useEditorState((st) => st.doc);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"num" | "hue">("num");
  const [series, setSeries] = useState("all");
  const inventory = useEditorState((st) => st.inventory);
  // threads: the pattern's brands; beads: the built-in bead brands, then your own
  // the pattern's brands for this kind (SPEC §15.31); just one brand: no tabs, and your own go into it
  const m = materials(doc), own = kind === "thread" ? m.threads : m.beads;
  const brands = own.brands, single = own.single;
  // the tab: the brand of what's picked, else the first
  const [tab, setTab] = useState<string>(() => resolveColor(doc, selected)?.brand ?? brands[0] ?? "");
  const brand = brands.includes(tab) ? tab : (brands[0] ?? "");
  const catalogue = (kind === "thread" ? THREAD_CATALOGUES : BEAD_CATALOGUES)[brand] ?? [];
  const seriesList = kind === "bead" ? [...new Set(catalogue.map((e) => e.series ?? "").filter(Boolean))] : [];
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  // signed out, the first time a thread or bead of your own is being made: where it's kept, and what an account adds
  const signedIn = useEditorState((st) => !!st.account);
  useEffect(() => {
    if (form.mode === "add" && !signedIn) ed.store.setState({ pendingTip: "ownColours" });
  }, [ed, form.mode, signedIn]);
  const [naming, setNaming] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  // your own: the pattern's, and (signed in) the rest of your inventory
  const extra = (inventory ?? []).filter((c) => c.kind === kind && !doc.customs[c.id] && c.brand !== ORGANIZER);
  const customs = [...Object.values(doc.customs).filter((c) => c.kind === kind).map((c) => resolveColor(doc, c.id)!), ...extra.map(customColor)];
  /** Picking one of your inventory's threads: the pattern takes a copy first. */
  const take = (id: string) => {
    if (id.startsWith("custom:") && !doc.customs[id]) {
      ed.inventory.useIn(doc, id);
      ed.changed({ keys: true });
    }
  };
  const pick = (id: string) => {
    take(id);
    onPick(id);
  };
  const items = useMemo(() => {
    let all: ColorEntry[];
    all = [...catalogue, ...customs.filter((e) => e.brand === brand)];
    if (kind === "bead" && series !== "all") all = all.filter((e) => e.series === series);
    all = all.filter((e) => matchesQuery(e, query));
    return kind === "thread" ? [...all].sort(sort === "num" ? byNumber : byColour) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, query, sort, series, brand, customs.length, revision, inventory]);

  useEffect(() => {
    if (!query) list.current?.querySelector("[data-on='true']")?.scrollIntoView({ block: "nearest" });
  }, [query, selected]);

  const otherBrands = [...new Set([...(kind === "thread" ? BUILT_IN_THREAD_BRANDS : BUILT_IN_BEAD_BRANDS), ...[...Object.values(doc.customs), ...(inventory ?? [])].filter((c) => c.kind === kind).map((c) => c.brand)])].filter((b) => b !== ORGANIZER && !brands.includes(b));
  // the numbered organizer is a mode of its own, instead of brands: just numbers, kept in this pattern, nothing else moved in
  const inOrganizer = brand === ORGANIZER;
  const formBrands = inOrganizer ? [ORGANIZER] : (single ? [brand] : [brand, ...brands, ...otherBrands]).filter((b) => b !== ORGANIZER);
  // an empty organizer: straight to the form for its first number, until the form is closed once
  const [dismissed, setDismissed] = useState<string | null>(null);
  const emptyOrganizer = inOrganizer && !customs.some((c) => c.brand === ORGANIZER);
  const shown: FormState = form.mode === "closed" && emptyOrganizer && dismissed !== kind ? { mode: "add" } : form;
  const closeForm = () => {
    setForm({ mode: "closed" });
    setDismissed(kind);
  };
  const codeTaken = (f: ThreadFields) => (f.brand === ORGANIZER && organizerCodeTaken(doc, kind, f.code, form.mode === "edit" ? form.id : undefined) ? t("organizerCodeTaken") : null);
  // the picker only shows tabs when it's not "only one": what it changes stays "several"
  const setBrands = (list: string[]) => run("pattern.setMaterials", { ...materialsOf(doc), ...(kind === "thread" ? { brands: list, onlyBrand: false } : { beadBrands: list, onlyBeadBrand: false }) });
  const addBrand = (b: string) => {
    const name = b.trim();
    setNaming(false);
    if (!name) return;
    setTab(name);
    setSeries("all");
    if (!brands.includes(name)) setBrands([...brands, name]);
    // a brand with nothing of yours in it yet, and no catalogue: straight to the form for its first one
    if (!(kind === "thread" ? THREAD_CATALOGUES : BEAD_CATALOGUES)[name]) setForm({ mode: "add" });
  };
  const removeBrand = (b: string) => {
    setBrands(brands.filter((x) => x !== b));
    if (tab === b) setTab(brands.find((x) => x !== b) ?? "DMC");
  };

  const save = (f: ThreadFields) => {
    // an organizer's colour is its number alone: no name, no "Custom" label
    const name = f.brand === ORGANIZER ? "" : f.name || t("customDefault");
    if (form.mode === "edit") {
      updateCustomColour(ed, form.id, { brand: f.brand, code: f.code, name, hex: f.hex });
    } else {
      const id = addCustomColour(ed, { kind, brand: f.brand, code: f.code, name, hex: f.hex, series: kind === "bead" && f.brand !== ORGANIZER ? "Custom" : undefined });
      onPick(id);
    }
    setTab(f.brand);
    setSeries("all");
    setForm({ mode: "closed" });
  };
  const editing = form.mode === "edit" ? doc.customs[form.id] : null;
  // a copy (of one's own or a catalogue colour): the same brand, name and colour, a code of its own to type (the
  // organizer's next number)
  const source = form.mode === "copy" ? form.from : null;
  const initial = editing ? { brand: editing.brand, code: editing.code, name: editing.name, hex: editing.hex }
    : source ? { brand: source.brand, code: source.brand === ORGANIZER ? nextOrganizerCode(doc, kind) : "", name: source.name, hex: source.hex }
    : { brand, code: inOrganizer ? nextOrganizerCode(doc, kind) : "", name: "", hex: "#7A9CC6" };

  return (
    <div className={s.picker}>
      {!single && (
        <div className={s.brandTabs} role="tablist" aria-label={t(kind === "bead" ? "beadBrands" : "brands")} data-testid="brand-tabs">
          {brands.map((b) => {
            const removable = kind === "thread" ? canRemoveBrand(doc, b) : canRemoveBeadBrand(doc, b);
            return (
              <span key={b} className={cx(s.brandTab, b === brand && s.on)}>
                <button type="button" role="tab" aria-selected={b === brand} onClick={() => (setTab(b), setSeries("all"))}>{label(b)}</button>
                {brands.length > 1 && (
                  <button
                    type="button"
                    className={s.brandX}
                    disabled={!removable}
                    title={removable ? t("removeBrand", { brand: b }) : t("brandInUse", { brand: b })}
                    aria-label={removable ? t("removeBrand", { brand: b }) : t("brandInUse", { brand: b })}
                    onClick={() => removeBrand(b)}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
          {naming ? (
            <input
              className={cx(ui.input, s.brandName)}
              autoFocus
              placeholder={t("newBrandName")}
              aria-label={t("newBrandName")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBrand(e.currentTarget.value);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setNaming(false);
                }
              }}
              onBlur={(e) => (e.currentTarget.value.trim() ? addBrand(e.currentTarget.value) : setNaming(false))}
            />
          ) : (
            <select className={s.addBrand} aria-label={t("addBrand")} value="" onChange={(e) => (e.target.value === "\u0000new" ? setNaming(true) : addBrand(e.target.value))}>
              <option value="">{t("addBrand")}</option>
              {otherBrands.map((b) => <option key={b} value={b}>{label(b)}</option>)}
              <option value={"\u0000new"}>{t("newBrand")}</option>
            </select>
          )}
        </div>
      )}
      <div className={ui.row}>
        <input className={cx(ui.input, s.search)} autoFocus={autoFocus} placeholder={inOrganizer ? t("searchNumber") : kind === "bead" && brand === "Mill Hill" ? t("searchBead") : t("searchIn", { brand: label(brand) })} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const q = query.trim().toLowerCase(), top = items.find((i) => i.code.toLowerCase() === q) ?? items[0];
            if (e.key !== "Enter" || !q || !top) return;
            e.preventDefault();
            pick(top.id);
            setQuery("");
          }} />
        {kind === "bead" ? (
          seriesList.length > 1 && (
            <select className={ui.input} aria-label={t(brand === "Mill Hill" ? "allSeries" : "allFinishes")} value={series} onChange={(e) => setSeries(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="all">{t(brand === "Mill Hill" ? "allSeries" : "allFinishes")}</option>
              {seriesList.map((sr) => <option key={sr} value={sr}>{t("series", { name: sr, count: catalogue.filter((b) => b.series === sr).length })}</option>)}
            </select>
          )
        ) : (
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => setSort(sort === "num" ? "hue" : "num")}>{sort === "num" ? t("byNumber") : t("byColour")}</button>
        )}
        <button type="button" className={cx(ui.btn, ui.sm)} title={inOrganizer ? t("addNumber") : kind === "bead" ? t("customBead") : t("customThread")} aria-label={inOrganizer ? t("addNumber") : kind === "bead" ? t("customBead") : t("customThread")} aria-pressed={shown.mode === "add"} onClick={() => (shown.mode === "add" ? closeForm() : setForm({ mode: "add" }))}>+</button>
      </div>
      {shown.mode !== "closed" && (
        <div data-guide="own-colour">
          <ThreadForm
            key={shown.mode === "edit" || shown.mode === "copy" ? `${shown.mode}:${shown.id}` : "add"}
            kind={kind}
            brands={formBrands}
            fixedBrand={single || inOrganizer}
            check={codeTaken}
            initial={initial}
            saveLabel={shown.mode === "edit" ? t("save") : t("add")}
            onSave={save}
            onCancel={closeForm}
          />
        </div>
      )}
      <div ref={list} className={s.rows} style={{ height }} role="listbox">
        {items.map((e) => (
          <div key={e.id} role="option" aria-selected={e.id === selected} data-on={e.id === selected} data-id={e.id} className={cx(s.item, e.id === selected && s.on)} onClick={() => pick(e.id)}>
            <Swatch entry={e} />
            <span className={s.code}>{e.code}</span>
            <span className={s.name}>
              {e.name}
              {e.dmc && <span style={{ opacity: 0.7 }}>{t("dmcEquivalent", { code: e.dmc })}</span>}
            </span>
            {e.series && e.series !== "Custom" && e.series !== e.name ? <span className={s.tag}>{e.series}</span> : e.id.startsWith("custom:") && e.brand !== ORGANIZER && <span className={s.tag}>{t("yours")}</span>}
            {e.id.startsWith("custom:") && (
              <button
                type="button"
                className={s.editCustom}
                title={t("editCustom", { code: e.code })}
                aria-label={t("editCustom", { code: e.code })}
                onClick={(ev) => {
                  ev.stopPropagation();
                  take(e.id);
                  setForm({ mode: "edit", id: e.id });
                }}
              >
                ✎
              </button>
            )}
            <button
              type="button"
              className={s.editCustom}
              title={t("copyCustom", { code: e.code })}
              aria-label={t("copyCustom", { code: e.code })}
              onClick={(ev) => {
                ev.stopPropagation();
                setForm({ mode: "copy", id: e.id, from: { brand: e.brand, name: e.name, hex: e.hex } });
              }}
            >
              ⧉
            </button>
          </div>
        ))}
        {!items.length && <p className={ui.hint} style={{ padding: 10 }}>{!query && !catalogue.length ? (inOrganizer ? t("emptyOrganizer") : t(kind === "bead" ? "emptyBeadBrand" : "emptyBrand", { brand: label(brand) })) : t("nothing")}</p>}
      </div>
    </div>
  );
}
