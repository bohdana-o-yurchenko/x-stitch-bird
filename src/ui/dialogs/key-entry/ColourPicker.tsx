"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BEADS, BEAD_SERIES, DMC, byHue, byNumber, matchesQuery } from "@/core/catalog/catalog";
import { resolveColor } from "@/core/pattern/resolve";
import { addCustomColour } from "@/editor/actions/keyEntries";
import { Swatch, cx, ui } from "../../common/widgets";
import { useEditor } from "../../hooks/editor";
import s from "./keyEntry.module.css";

/** Searchable list of threads or beads, with custom colours (SPEC §8.1). */
export function ColourPicker({ kind, selected, onPick, height = 240 }: { kind: "thread" | "bead"; selected: string; onPick: (id: string) => void; height?: number }) {
  const t = useTranslations("picker");
  const ed = useEditor();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"num" | "hue">("num");
  const [series, setSeries] = useState("all");
  const [custom, setCustom] = useState<{ open: boolean; brand: string; code: string; name: string; hex: string }>({ open: false, brand: kind === "bead" ? "Mill Hill" : "Anchor", code: "", name: "", hex: "#7A9CC6" });
  const [, bump] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const customs = Object.values(ed.doc.customs).filter((c) => c.kind === kind).map((c) => resolveColor(ed.doc, c.id)!);
  const items = useMemo(() => {
    let all = kind === "bead" ? (series === "mine" ? customs : [...BEADS, ...customs].filter((e) => series === "all" || e.series === series)) : [...DMC, ...customs];
    all = all.filter((e) => matchesQuery(e, query));
    return kind === "thread" ? [...all].sort(sort === "num" ? byNumber : byHue) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, query, sort, series, customs.length]);

  useEffect(() => {
    if (!query) list.current?.querySelector("[data-on='true']")?.scrollIntoView({ block: "nearest" });
  }, [query, selected]);

  const addCustom = () => {
    if (!custom.code.trim()) return ed.toast("toasts.enterCode");
    const id = addCustomColour(ed, { kind, brand: custom.brand.trim() || t("customDefault"), code: custom.code.trim(), name: custom.name.trim() || t("customDefault"), hex: custom.hex, series: kind === "bead" ? "Custom" : undefined });
    setCustom({ ...custom, open: false, code: "", name: "" });
    bump((n) => n + 1);
    onPick(id);
  };

  return (
    <div className={s.picker}>
      <div className={ui.row}>
        <input className={cx(ui.input, s.search)} placeholder={kind === "bead" ? t("searchBead") : t("searchThread")} value={query} onChange={(e) => setQuery(e.target.value)} />
        {kind === "bead" ? (
          <select className={ui.input} value={series} onChange={(e) => setSeries(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="all">{t("allSeries")}</option>
            {BEAD_SERIES.map((sr) => <option key={sr} value={sr}>{t("series", { name: sr, count: BEADS.filter((b) => b.series === sr).length })}</option>)}
            <option value="mine">{t("myBeads")}</option>
          </select>
        ) : (
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => setSort(sort === "num" ? "hue" : "num")}>{sort === "num" ? t("byNumber") : t("byColour")}</button>
        )}
        <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => setCustom({ ...custom, open: !custom.open })}>{kind === "bead" ? t("customBead") : t("customThread")}</button>
      </div>
      {custom.open && (
        <div className={ui.row}>
          <input className={ui.input} style={{ maxWidth: 110 }} placeholder={t("brand")} value={custom.brand} onChange={(e) => setCustom({ ...custom, brand: e.target.value })} />
          <input className={ui.input} style={{ maxWidth: 80 }} placeholder={t("code")} value={custom.code} onChange={(e) => setCustom({ ...custom, code: e.target.value })} />
          <input className={ui.input} style={{ flex: 1 }} placeholder={t("name")} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <input type="color" value={custom.hex} onChange={(e) => setCustom({ ...custom, hex: e.target.value })} style={{ width: 36, height: 30 }} />
          <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} onClick={addCustom}>{t("add")}</button>
        </div>
      )}
      <div ref={list} className={s.rows} style={{ height }} role="listbox">
        {items.map((e) => (
          <div key={e.id} role="option" aria-selected={e.id === selected} data-on={e.id === selected} data-id={e.id} className={cx(s.item, e.id === selected && s.on)} onClick={() => onPick(e.id)}>
            <Swatch entry={e} />
            <span className={s.code}>{e.code}</span>
            <span className={s.name}>
              {e.name}
              {e.dmc && <span style={{ opacity: 0.7 }}>{t("dmcEquivalent", { code: e.dmc })}</span>}
            </span>
            {e.series ? <span className={s.tag}>{e.series}</span> : e.brand !== "DMC" && <span className={s.tag}>{e.brand}</span>}
          </div>
        ))}
        {!items.length && <p className={ui.hint} style={{ padding: 10 }}>{t("nothing")}</p>}
      </div>
    </div>
  );
}
