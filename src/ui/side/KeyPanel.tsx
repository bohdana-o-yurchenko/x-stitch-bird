"use client";

import { useTranslations } from "next-intl";
import { entryCount, partialCount } from "@/core/calculator/usage";
import { KeyIcon, cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { useEntryLabel } from "../i18n/labels";
import s from "./side.module.css";
import { useUsage } from "./useUsage";

const UNIT = { thread: "cell", combo: "cell", bead: "bead", back: "segment", knot: "knot" } as const;

export function KeyPanel() {
  const t = useTranslations("key");
  const run = useCommand();
  const key = useEditorState((st) => st.doc.key);
  useEditorState((st) => st.keyRevision);
  const palette = useEditorState((st) => st.palette);
  const active = useEditorState((st) => st.activeEntry);
  const label = useEntryLabel();
  const { usage } = useUsage();
  const rows = key.flatMap((e, i) => (e && i ? [{ i, e }] : []));
  return (
    <>
      <div className={s.keyHead}>
        <h3>{t("heading")}</h3>
        <span className={s.count}>{rows.length ? t("count", { count: rows.length }) : ""}</span>
        <span className={s.spacer} />
        <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} onClick={() => run("key.add")}>{t("add")}</button>
      </div>
      <div className={s.keyList}>
        {!rows.length && (
          <div className={s.empty}>
            <p>{t("empty")}</p>
            <p className={ui.hint}>{t("emptyHint")}</p>
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => run("key.add")}>{t("add")}</button>
          </div>
        )}
        {rows.map(({ i, e }, idx) => {
          const u = usage.perEntry.get(i), n = entryCount(u), parts = partialCount(u), slot = palette[i];
          const { title, sub } = label(i);
          return (
            <div key={i} role="button" tabIndex={0} data-entry={i} className={cx(s.row, i === active && s.on)} title={t("rowTitle")}
              onClick={() => run("key.select", i)} onDoubleClick={() => run("key.edit", i)} onKeyDown={(ev) => ev.key === "Enter" && run("key.select", i)}>
              {slot && <KeyIcon slot={slot} />}
              <div className={s.text}>
                <div className={s.title}>
                  {title}
                  {idx < 9 && <span className={s.shortcut}>{idx + 1}</span>}
                </div>
                <div className={s.sub}>{sub}</div>
              </div>
              <div className={s.num}>
                {n || parts ? n.toLocaleString() : "—"}
                {parts > 0 && <div className={s.sub}>{t("partials", { count: parts })}</div>}
                <div className={s.sub}>{t(`unit.${UNIT[e.t]}`, { count: n })}</div>
              </div>
              <div className={s.actions}>
                <button type="button" className={ui.iconbtn} title={t("edit")} onClick={(ev) => { ev.stopPropagation(); run("key.edit", i); }}>✎</button>
                <button type="button" className={ui.iconbtn} title={t("delete")} onClick={(ev) => { ev.stopPropagation(); run("key.requestDelete", i); }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
