"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { MAX_NOTE, type CheckItem, type CheckSuite, type Mark, type Marks } from "@/core/readerCheck/types";
import { cx, ui } from "../common/widgets";
import s from "./check.module.css";

/**
 * What's on the test chart, numbered as on it, under headings (SPEC §15.51). The one picked opens: how the file
 * writes it, and the two marks — all good, or issues (with a note of what's wrong).
 */
export function CheckList({ suite, marks, selected, onSelect, onMark, lang }: {
  suite: CheckSuite;
  marks: Marks;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMark: (id: string, m: Mark | null) => void;
  lang: "uk" | "en";
}) {
  const t = useTranslations("readerCheck");
  const list = useRef<HTMLDivElement>(null);

  // the picked one in view (picked on the chart, or the next after a mark) — the list scrolls, not the page
  useEffect(() => {
    const box = list.current, el = selected ? box?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selected)}"]`) : null;
    if (!box || !el) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    // below the group's sticky heading, with room for the item's buttons
    if (top < box.scrollTop + 40 || top + el.offsetHeight > box.scrollTop + box.clientHeight - 12) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: "smooth" });
  }, [selected]);

  const groups: { group: string; items: { item: CheckItem; n: number }[] }[] = [];
  suite.items.forEach((item, i) => {
    const last = groups[groups.length - 1];
    if (last?.group === item.group) last.items.push({ item, n: i + 1 });
    else groups.push({ group: item.group, items: [{ item, n: i + 1 }] });
  });

  return (
    <div ref={list} className={s.list} data-testid="check-list">
      {groups.map(({ group, items }) => (
        <section key={group} className={s.group}>
          <h3>{t(`groups.${group}`)}</h3>
          <ol>
            {items.map(({ item, n }) => {
              const m = marks[item.id], on = selected === item.id;
              return (
                <li key={item.id} data-id={item.id} className={cx(s.item, on && s.itemOn, m?.v === "ok" && s.itemOk, m?.v === "issue" && s.itemBad)}>
                  <button type="button" className={s.itemHead} aria-expanded={on} onClick={() => onSelect(on ? null : item.id)} data-testid={`check-item-${n}`}>
                    <span className={s.num}>{n}</span>
                    <span className={s.what}>
                      {item.what[lang]}
                      {!item.area && <small className={s.tag}>{t("wholeFile")}</small>}
                      {item.absent && <small className={cx(s.tag, s.tagAbsent)}>{t("shouldBeMissing")}</small>}
                    </span>
                    <span className={s.state} aria-label={m ? t(m.v === "ok" ? "ok" : "issue") : t("notYet")}>{m?.v === "ok" ? "✓" : m?.v === "issue" ? "!" : ""}</span>
                  </button>
                  {on && (
                    <div className={s.detail}>
                      {item.how && !item.absent && <p className={s.how}><span>{t("inFile")}</span> <code>{item.how[lang]}</code></p>}
                      {item.absent && <p className={s.absent}>{item.how?.[lang] ?? t("shouldBeMissing")}</p>}
                      <div className={s.marks}>
                        <button type="button" className={cx(ui.btn, s.okBtn, m?.v === "ok" && s.okOn)} aria-pressed={m?.v === "ok"} onClick={() => onMark(item.id, m?.v === "ok" ? null : { v: "ok" })} data-testid="check-ok">✓ {t("ok")}</button>
                        <button type="button" className={cx(ui.btn, s.badBtn, m?.v === "issue" && s.badOn)} aria-pressed={m?.v === "issue"} onClick={() => onMark(item.id, m?.v === "issue" ? null : { v: "issue" })} data-testid="check-issue">! {t("issue")}</button>
                      </div>
                      {m?.v === "issue" && (
                        <div className={s.noteRow}>
                          <textarea
                            className={cx(ui.input, s.note)}
                            rows={2}
                            maxLength={MAX_NOTE}
                            placeholder={t("notePlaceholder")}
                            defaultValue={m.note ?? ""}
                            onBlur={(e) => {
                              const note = e.target.value.trim();
                              if (note !== (m.note ?? "")) onMark(item.id, note ? { v: "issue", note } : { v: "issue" });
                            }}
                            data-testid="check-note"
                          />
                          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => {
                            const at = suite.items.findIndex((i) => i.id === item.id);
                            const next = [...suite.items.slice(at + 1), ...suite.items.slice(0, at)].find((i) => !marks[i.id]);
                            onSelect(next?.id ?? null);
                          }}>{t("next")} →</button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
