"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHECKS, type CheckOptions, type Finding } from "@/core/checks/checks";
import { cellLabel } from "@/core/grid/numbering";
import { visibleFindings } from "@/editor/checks/checks";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { Section } from "./Section";
import s from "./side.module.css";

const OPTIONS_KEY = "stitchwork.checks";
/** Lines shown per group; the rest are reached with ‹ ›. */
const SHOWN = 100;

function savedOptions(): CheckOptions {
  try {
    const v = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "{}") as Partial<CheckOptions>;
    return { holes: { ...DEFAULT_CHECKS.holes, ...v.holes }, lone: { ...DEFAULT_CHECKS.lone, ...v.lone }, symmetry: { ...DEFAULT_CHECKS.symmetry, ...v.symmetry } };
  } catch {
    return DEFAULT_CHECKS;
  }
}

/** A finding's group: its check, and for near symmetry the axis too. */
const groupOf = (f: Finding) => (f.check === "symmetry" ? `symmetry-${f.axis}` : f.check);

/**
 * Chart checks (SPEC §15.4): choose checks (all opt-in, remembered), run them on demand, and step through what they
 * found, grouped by check. The chart centres on a finding and rings it; the editor keeps the results for the session.
 */
export function ChecksPanel() {
  const t = useTranslations("checks");
  const run = useCommand();
  const checks = useEditorState((st) => st.checks);
  const revision = useEditorState((st) => st.docRevision);
  const p = useEditorState((st) => st.doc);
  const [o, setO] = useState(savedOptions);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const current = useRef<HTMLButtonElement>(null);
  const list = visibleFindings(checks), at = checks?.current ?? -1;
  const anyOn = o.holes.on || o.lone.on || o.symmetry.on;

  // braces: an effect must return nothing or a cleanup function, and scrollIntoView may return a promise
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const change = (next: CheckOptions) => {
    setO(next);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // private mode: the choice just isn't remembered
    }
  };
  const where = (i: number) => t("at", { x: cellLabel(p.grid, "x", i % p.w, p), y: cellLabel(p.grid, "y", (i / p.w) | 0, p) });
  const line = (f: Finding) =>
    f.check === "symmetry" ? `${where(f.cells[0]!)} ↔ ${where(f.cells[1]!)}` : f.cells.length > 1 ? `${where(f.cells[0]!)} · ${t("cells", { count: f.cells.length })}` : where(f.cells[0]!);
  const groups = [...new Set(list.map(groupOf))].map((g) => ({ g, items: list.map((f, i) => ({ f, i })).filter(({ f }) => groupOf(f) === g) }));

  return (
    <Section id="checks" title={t("heading")} testId="checks-panel">
      <div className={s.section}>
        <label className={ui.chk}>
          <input type="checkbox" checked={o.holes.on} onChange={(e) => change({ ...o, holes: { ...o.holes, on: e.target.checked } })} />
          <span className={s.checkName}>{t("holes")}</span>
          <select className={ui.input} aria-label={t("holesSize")} value={o.holes.max} disabled={!o.holes.on} onChange={(e) => change({ ...o, holes: { ...o.holes, max: Number(e.target.value) as 1 | 2 | 3 } })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t("upTo", { count: n })}</option>)}
          </select>
        </label>
        <p className={cx(ui.hint, s.checkHint)}>{t("holesHint")}</p>
        <label className={ui.chk}>
          <input type="checkbox" checked={o.lone.on} onChange={(e) => change({ ...o, lone: { ...o.lone, on: e.target.checked } })} />
          <span className={s.checkName}>{t("lone")}</span>
          <select className={ui.input} aria-label={t("loneSize")} value={o.lone.max} disabled={!o.lone.on} onChange={(e) => change({ ...o, lone: { ...o.lone, max: Number(e.target.value) as 1 | 2 } })}>
            {[1, 2].map((n) => <option key={n} value={n}>{t("upTo", { count: n })}</option>)}
          </select>
        </label>
        <p className={cx(ui.hint, s.checkHint)}>{t("loneHint")}</p>
        {o.lone.on && (
          <label className={cx(ui.chk, s.checkSub)}>
            <input type="checkbox" checked={o.lone.alone} onChange={(e) => change({ ...o, lone: { ...o.lone, alone: e.target.checked } })} />
            {t("loneAlone")}
          </label>
        )}
        <label className={ui.chk}>
          <input type="checkbox" checked={o.symmetry.on} onChange={(e) => change({ ...o, symmetry: { on: e.target.checked } })} />
          <span className={s.checkName}>{t("symmetry")}</span>
        </label>
        <p className={cx(ui.hint, s.checkHint)}>{t("symmetryHint")}</p>
        <div className={ui.row}>
          <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} disabled={!anyOn} data-testid="checks-run" onClick={() => run("checks.run", o)}>{t("run")}</button>
          {checks && <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("checks.close")}>{t("close")}</button>}
        </div>

        {checks && (
          <div className={s.findings} data-testid="checks-results">
            {checks.revision !== revision && <p className={ui.warn}>{t("stale")}</p>}
            {list.length ? (
              <div className={s.findingsNav}>
                <span className={s.findingsCount}>{t("found", { count: list.length })}</span>
                <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("prev")} title={t("prev")} onClick={() => run("checks.prev")}>‹</button>
                <span className={s.findingsAt} data-testid="checks-position">{at >= 0 ? `${at + 1} / ${list.length}` : `– / ${list.length}`}</span>
                <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("next")} title={t("next")} onClick={() => run("checks.next")}>›</button>
              </div>
            ) : (
              <p className={s.findingsNone}>{t("none")}</p>
            )}
            {groups.map(({ g, items }) => (
              <section key={g} data-check-group={g}>
                <button type="button" className={s.groupHead} aria-expanded={!folded.has(g)} onClick={() => setFolded((f) => new Set(f.has(g) ? [...f].filter((x) => x !== g) : [...f, g]))}>
                  <span className={cx(s.chevron, !folded.has(g) && s.open)} />
                  {t(`group.${g}`)}
                  <span className={s.count}>{items.length}</span>
                </button>
                {!folded.has(g) && (
                  <ul className={s.findingList}>
                    {items.slice(0, SHOWN).map(({ f, i }) => (
                      <li key={f.id} className={cx(i === at && s.findingOn)}>
                        <button type="button" ref={i === at ? current : undefined} className={s.findingGo} onClick={() => run("checks.go", i)}>{line(f)}</button>
                        <button type="button" className={ui.iconbtn} title={t("ignore")} aria-label={t("ignore")} onClick={() => run("checks.ignore", f.id)}>✕</button>
                      </li>
                    ))}
                    {items.length > SHOWN && <li className={ui.hint}>{t("more", { count: items.length - SHOWN })}</li>}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
