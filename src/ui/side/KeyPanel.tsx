"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { entryCount, partialCount } from "@/core/calculator/usage";
import { keyView, type KeySort } from "@/core/pattern/keyView";
import { Icon } from "../common/Icon";
import { DeleteButton, KeyIcon, cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { useEntryLabel } from "../i18n/labels";
import s from "./side.module.css";
import { useUsage } from "./useUsage";
import { isPointBead } from "@/core/entryKinds/registry";
import { HelpLink } from "../common/HelpLink";

const UNIT = { thread: "cell", combo: "cell", bead: "bead", back: "segment", knot: "knot" } as const;

const VIEW_KEY = "stitchwork.keyView";
/** From this many entries on, the key gets its search box, sorting and groups. */
const LONG_KEY = 10;
const SORTS: readonly KeySort[] = ["added", "number", "used"];

function savedView(): { sort: KeySort; grouped: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}") as { sort?: KeySort; grouped?: boolean };
    return { sort: SORTS.includes(v.sort as KeySort) ? v.sort! : "added", grouped: v.grouped !== false };
  } catch {
    return { sort: "added", grouped: true };
  }
}

/**
 * Where the key list (and the side panel) were scrolled to. The key form takes the whole panel, so the list is
 * built anew when it closes: it comes back where it was — or, if it was at the very bottom and an entry was added,
 * moved on just enough to show the new entry (at the new bottom, or in its group) — before anything is painted.
 */
const scrollMemory = { top: 0, atBottom: false, count: 0, sideTop: 0 };

/** Keeps the key list's scroll position across the key form (see `scrollMemory`). */
function useListScroll(count: number, active: number) {
  const list = useRef<HTMLDivElement>(null), countNow = useRef(count);
  useLayoutEffect(() => {
    countNow.current = count;
  }, [count]);
  useLayoutEffect(() => {
    const el = list.current, side = el?.closest("aside");
    if (!el) return;
    if (side) side.scrollTop = scrollMemory.sideTop;
    el.scrollTop = scrollMemory.top;
    const added = el.querySelector<HTMLElement>(`[data-entry="${active}"]`);
    if (scrollMemory.atBottom && count > scrollMemory.count && added) {
      const row = added.getBoundingClientRect(), box = el.getBoundingClientRect();
      if (row.bottom > box.bottom) el.scrollTop += row.bottom - box.bottom;
      else if (row.top < box.top) el.scrollTop -= box.top - row.top;
    }
    const save = () => {
      scrollMemory.top = el.scrollTop;
      scrollMemory.atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      scrollMemory.count = countNow.current;
      scrollMemory.sideTop = side?.scrollTop ?? 0;
    };
    save();
    el.addEventListener("scroll", save);
    side?.addEventListener("scroll", save);
    return () => {
      el.removeEventListener("scroll", save);
      side?.removeEventListener("scroll", save);
    };
    // once per showing of the list: the form replaces it, and it is built again after
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return list;
}

export function KeyPanel() {
  const t = useTranslations("key");
  const run = useCommand();
  const ed = useEditor();
  const key = useEditorState((st) => st.doc.key);
  useEditorState((st) => st.keyRevision);
  const palette = useEditorState((st) => st.palette);
  // Autofill doesn't draw with the chosen entry: it's shown as chosen but not in use
  const autofill = useEditorState((st) => st.tool === "autofill");
  const active = useEditorState((st) => st.activeEntry);
  const highlight = useEditorState((st) => st.highlight);
  const label = useEntryLabel();
  const { usage } = useUsage();
  const [query, setQuery] = useState("");
  const [view, setView] = useState(savedView);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const all = key.flatMap((e, i) => (e && i ? [i] : []));
  const listRef = useListScroll(all.length, active);
  const long = all.length >= LONG_KEY;
  const used = (k: number) => entryCount(usage.perEntry.get(k)) + partialCount(usage.perEntry.get(k));
  // a short key stays a plain list, as added
  const groups = keyView(ed.doc, used, long ? { query, ...view } : { query: "", sort: "added", grouped: false });
  const change = (patch: Partial<typeof view>) => {
    const next = { ...view, ...patch };
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // private mode: the view just isn't remembered
    }
  };
  const toggle = (kind: string) => setClosed((c) => new Set(c.has(kind) ? [...c].filter((k) => k !== kind) : [...c, kind]));
  const row = (i: number) => {
    const e = key[i]!, u = usage.perEntry.get(i), n = entryCount(u), parts = partialCount(u), slot = palette[i];
    const { title, sub } = label(i), nth = all.indexOf(i);
    return (
      <div key={i} role="button" tabIndex={0} data-entry={i} className={cx(s.row, i === active && s.on, i === active && autofill && s.idleEntry)} title={i === active && autofill ? t("notUsedByAutofill") : t("rowTitle")}
        onClick={() => run("key.select", i)} onDoubleClick={() => run("key.edit", i)} onKeyDown={(ev) => ev.key === "Enter" && run("key.select", i)}>
        {slot && <KeyIcon slot={slot} />}
        <div className={s.text} data-testid="key-entry-text">
          <div className={s.title}>
            {title}
            {nth < 9 && <span className={s.shortcut}>{nth + 1}</span>}
          </div>
          <div className={s.sub}>{sub}</div>
        </div>
        <div className={s.num}>
          {n || parts ? n.toLocaleString() : "—"}
          {parts > 0 && <div className={s.sub}>{t("partials", { count: parts })}</div>}
          <div className={s.sub}>{t(`unit.${isPointBead(e) ? "bead" : UNIT[e.t]}`, { count: n })}</div>
        </div>
        <div className={s.actions} data-testid="key-entry-actions">
          <button type="button" className={ui.iconbtn} title={t("duplicate")} aria-label={t("duplicate")} onClick={(ev) => { ev.stopPropagation(); run("key.duplicate", i); }}><Icon name="duplicate" size={16} /></button>
          <button type="button" className={ui.iconbtn} title={t("edit")} aria-label={t("edit")} onClick={(ev) => { ev.stopPropagation(); run("key.edit", i); }}><Icon name="pencil" size={16} /></button>
          <DeleteButton label={t("delete")} onClick={() => run("key.requestDelete", i)} />
        </div>
      </div>
    );
  };
  return (
    <>
      <div className={s.keyHead}>
        <h3>{t("heading")}</h3>
        <HelpLink to="key#add" className={s.headHelp} />
        <span className={s.count}>{all.length ? t("count", { count: all.length }) : ""}</span>
        <span className={s.spacer} />
        <button type="button" className={cx(ui.tool, highlight && ui.on)} title={t("highlight")} aria-label={t("highlight")} aria-pressed={highlight} data-testid="highlight-toggle" data-guide="highlight" onClick={() => run("view.toggleHighlight")}><Icon name="highlight" size={18} /></button>
        <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} data-guide="add-key" onClick={() => run("key.add")}>{t("add")}</button>
      </div>
      {long && (
        <div className={s.keyTools} data-no-shortcuts data-testid="key-tools">
          <div className={s.keySearch}>
            <input className={ui.input} type="search" placeholder={t("search")} aria-label={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
          </div>
          <select className={ui.input} aria-label={t("sortLabel")} title={t("sortLabel")} value={view.sort} onChange={(e) => change({ sort: e.target.value as KeySort })}>
            {SORTS.map((id) => <option key={id} value={id}>{t(`sort.${id}`)}</option>)}
          </select>
          <button type="button" className={cx(ui.tool, view.grouped && ui.on)} title={t("group")} aria-label={t("group")} aria-pressed={view.grouped} onClick={() => change({ grouped: !view.grouped })}><Icon name="group" size={17} /></button>
        </div>
      )}
      <div ref={listRef} className={s.keyList} data-shrink data-testid="key-list">
        {!all.length && (
          <div className={s.empty}>
            <p>{t("empty")}</p>
            <p className={ui.hint}>{t("emptyHint")}</p>
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => run("key.add")}>{t("add")}</button>
          </div>
        )}
        {all.length > 0 && !groups.length && <p className={cx(ui.hint, s.noMatch)}>{t("noMatch")}</p>}
        {groups.map((g) =>
          g.kind === null ? g.entries.map(row) : (
            <section key={g.kind} data-key-group={g.kind}>
              <button type="button" className={s.groupHead} aria-expanded={!closed.has(g.kind)} onClick={() => toggle(g.kind!)}>
                <span className={cx(s.chevron, !closed.has(g.kind) && s.open)} />
                {t(`groups.${g.kind}`)}
                <span className={s.count}>{g.entries.length}</span>
              </button>
              {!closed.has(g.kind) && g.entries.map(row)}
            </section>
          ),
        )}
      </div>
    </>
  );
}
