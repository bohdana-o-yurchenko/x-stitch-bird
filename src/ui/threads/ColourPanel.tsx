"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColorEntry } from "@/core/color/colorEntry";
import type { PatternSummary } from "@/editor/types";
import { BEAD_CATALOGUES, THREAD_CATALOGUES, closeness, familyOf, flossFor, inOtherBrands, seriesOf, shades, similar as similarIn, type Match } from "@/core/catalog/colourInfo";
import { EDITOR, Link } from "@/i18n/navigation";
import { copyText } from "@/platform/files";
import { cx, ui } from "../common/widgets";
import type { Item } from "./inventoryView";
import s from "./colourPanel.module.css";

/**
 * One colour (SPEC §15.57): on a wide screen a column of its own beside the list, always there; narrower, a sheet
 * from the bottom (`sheet`) that can be closed. Its swatch and numbers, the same colour in the other brands, its
 * shades lighter and darker, similar ones of its brand, and the patterns that use it. Every colour named here can be
 * picked — the panel moves to it (a short fade, nothing else moves).
 */
export function ColourPanel({ item, sheet, pool, uses, preview, onPick, onClose, onDuplicate, onEdit, onDelete }: {
  item: Item;
  sheet: boolean;
  /** The colours of its brand (the catalogue's and your own), for similar ones and shades. */
  pool: readonly ColorEntry[];
  /** Patterns by colour id; null while they're read. */
  uses: Map<string, PatternSummary[]> | null;
  /** A pattern's picture (a link or data: URL), or null. */
  preview: (p: PatternSummary) => Promise<string | null>;
  onPick: (e: ColorEntry) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("threadsPage");
  const e = item.entry, bead = e.kind === "bead";
  // closing the sheet slides it away first
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 150);
  };
  /** The colour just copied (its hex): said on the button till another colour shows. */
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      setClosing(true);
      setTimeout(onClose, 150);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, onClose]);

  const others: Match[] = bead ? [flossFor(e), ...inOtherBrands(e, BEAD_CATALOGUES)].filter((m): m is Match => !!m) : inOtherBrands(e, THREAD_CATALOGUES);
  const similar = similarIn(e, pool);
  const ladder = shades(e, pool);
  const patterns = uses?.get(e.id) ?? [];
  const series = bead ? seriesOf(e) : null;
  const facts = [t(`family_${familyOf(e)}`), series, e.pack ? t("perPack", { n: e.pack }) : null, `RGB ${e.rgb.join(", ")}`].filter(Boolean).join(" · ");

  const chip = (x: ColorEntry, tag?: string) => (
    <button key={x.id} type="button" className={s.chip} onClick={() => onPick(x)} title={`${x.brand} ${x.code} — ${x.name}`}>
      <span className={cx(s.dot, x.kind === "bead" && s.round)} style={{ background: x.hex }} />
      <span className={s.chipText}>
        <b>{x.code}</b>
        <small>{x.brand}</small>
      </span>
      {tag && <span className={s.tag}>{tag}</span>}
    </button>
  );

  return (
    <aside className={cx(s.panel, sheet ? s.sheet : s.column, closing && s.closing)} aria-label={`${e.brand} ${e.code}`} data-testid="colour-panel">
      {sheet && <button type="button" className={cx(ui.iconbtn, s.close)} onClick={close} title={t("close")} aria-label={t("close")}>✕</button>}
      <div key={e.id} className={s.body}>
      <div className={cx(s.swatch, bead && s.round)} style={{ background: e.hex }} />
      <div className={s.head}>
        <h2>
          {e.brand} {e.code}
          {item.own && <span className={s.yours}>{t("yours")}</span>}
        </h2>
        {e.name !== e.code && <p className={s.name}>{e.name}</p>}
        <p className={s.facts}>
          <button type="button" className={s.hex} onClick={() => void copyText(e.hex).then((ok) => setCopied(ok ? e.id : null))} title={t("copyHex")}>{copied === e.id ? t("copied") : e.hex}</button>
          <span>{facts}</span>
        </p>
      </div>
      <div className={s.actions}>
        {onEdit && <button type="button" className={cx(ui.btn, ui.sm)} onClick={onEdit}>{t("change")}</button>}
        <button type="button" className={cx(ui.btn, ui.sm)} onClick={onDuplicate}>{t("duplicate")}</button>
        {onDelete && <button type="button" className={cx(ui.btn, ui.sm, ui.ghost, s.delete)} onClick={onDelete}>{t("delete")}</button>}
      </div>

      {others.length > 0 && (
        <section className={s.section} data-testid="colour-other-brands">
          <h3>{bead ? t("matches") : t("inOtherBrands")}</h3>
          <div className={s.chips}>{others.map((m) => chip(m.entry, m.how === "chart" ? t("how_chart") : t(`close_${closeness(m.d)}`)))}</div>
        </section>
      )}
      {ladder.length > 1 && (
        <section className={s.section}>
          <h3>{t("shades")}</h3>
          <div className={s.ladder} data-testid="colour-shades">
            {ladder.map((x) => (
              <button key={x.id} type="button" className={cx(s.step, x.id === e.id && s.here)} style={{ background: x.hex }} onClick={() => onPick(x)} title={`${x.brand} ${x.code} — ${x.name}`} aria-label={`${x.brand} ${x.code}`} aria-current={x.id === e.id || undefined}>
                <span style={{ color: x.ink }}>{x.code}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {(similar.close.length > 0 || similar.alone) && (
        <section className={s.section} data-testid="colour-similar">
          <h3>{t("similarIn", { brand: e.brand })}</h3>
          {/* only colours that look close, said how close; none: said so, with the one nearest */}
          {!similar.close.length && <p className={cx(ui.hint, s.alone)}>{t("nothingClose", { brand: e.brand })}</p>}
          <div className={s.chips}>{(similar.close.length ? similar.close : [similar.alone!]).map((x) => chip(x.entry, t(`close_${closeness(x.d)}`)))}</div>
        </section>
      )}
      <section className={s.section} data-testid="colour-patterns">
        <h3>{t("inPatterns")}</h3>
        {!uses ? (
          <p className={ui.hint}>{t("loading")}</p>
        ) : !patterns.length ? (
          <p className={ui.hint}>{t("notInPatterns")}</p>
        ) : (
          <ul className={s.patterns}>
            {patterns.map((p) => <PatternRow key={p.id} p={p} preview={preview} />)}
          </ul>
        )}
      </section>
      </div>
    </aside>
  );
}

/** A pattern that uses the colour: its picture, name and size — opens it in the editor. */
function PatternRow({ p, preview }: { p: PatternSummary; preview: (p: PatternSummary) => Promise<string | null> }) {
  const t = useTranslations("threadsPage");
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void preview(p).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [p, preview]);
  return (
    <li>
      <Link className={s.pattern} href={{ pathname: EDITOR, query: { open: p.id } }}>
        {/* a picture drawn here (data: URL) or the account's: nothing for the image optimiser */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img className={s.thumb} src={src} alt="" /> : <span className={s.thumb} />}
        <span className={s.patternText}>
          <b>{p.name}</b>
          <small>{t("patternSize", { w: p.w, h: p.h })}</small>
        </span>
        <span className={s.go} aria-hidden>→</span>
      </Link>
    </li>
  );
}
