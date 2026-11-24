"use client";

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { entryLayerOf, isPointBead } from "@/core/entryKinds/registry";
import { keyView } from "@/core/pattern/keyView";
import type { KeyIndex } from "@/core/pattern/types";
import { KeyIcon, Modal, cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { useEntryLabel } from "../i18n/labels";
import side from "../side/side.module.css";
import s from "./replaceKey.module.css";

const UNIT = { thread: "cell", combo: "cell", bead: "bead", back: "segment", knot: "knot" } as const;
/** From this many entries on, a list gets its search box and kind groups (as the key does). */
const LONG = 8;

/**
 * Replace key in selection (SPEC §15.6): two lists that look like the key — on the left the entries the selection
 * has (with how many of each), on the right what they can become (entries of the same kind of stitch). Arrows move
 * in a list, typing searches, Enter replaces.
 */
export function ReplaceKeyDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const ed = useEditor();
  const key = useEditorState((st) => st.doc.key);
  const active = useEditorState((st) => st.activeEntry);
  // the selection can't change while the dialog is open: counted once
  const counts = useMemo(() => ed.selection.keyCounts(), [ed]);
  const present = key.flatMap((e, i) => (e && i && counts.has(i) ? [i] : []));
  const [from, setFrom] = useState<KeyIndex>(() => (counts.has(active) ? active : [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0));
  const layer = key[from] ? entryLayerOf(key[from]!) : null;
  const targets = key.flatMap((e, i) => (e && i && i !== from && entryLayerOf(e) === layer ? [i] : []));
  const [to, setTo] = useState<KeyIndex>(() => (active !== from && targets.includes(active) ? active : 0));
  const chosenTo = targets.includes(to) ? to : 0;
  const replace = () => {
    if (!from || !chosenTo) return false;
    run("selection.replaceKey", { from, to: chosenTo });
  };
  const confirm = () => {
    if (replace() !== false) onClose();
  };
  const palette = useEditorState((st) => st.palette);
  const label = useEntryLabel();
  return (
    <Modal title={t("replaceKeyTitle")} help="draw#replace-in-selection" wide onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("replace"), primary: true, disabled: !from || !chosenTo, onClick: replace }]}>
      {!present.length ? (
        <p className={ui.hint}>{t("replaceNothing")}</p>
      ) : (
        <div data-no-shortcuts>
          <div className={s.columns}>
            <EntryList heading={t("replaceFrom")} entries={present} value={from} onChange={setFrom} counts={counts} onConfirm={confirm} autoFocus testId="replace-from" />
            <EntryList heading={t("replaceTo")} entries={targets} value={chosenTo} onChange={setTo} onConfirm={confirm} testId="replace-to" empty={t("replaceNoTarget")} />
          </div>
          <div className={s.summary} data-testid="replace-summary">
            {from > 0 && palette[from] && <KeyIcon slot={palette[from]!} size={22} />}
            <span>{from ? label(from).title : ""}</span>
            <span className={s.arrow} aria-hidden>→</span>
            {chosenTo > 0 && palette[chosenTo] ? <KeyIcon slot={palette[chosenTo]!} size={22} /> : null}
            <span className={cx(!chosenTo && ui.hint)}>{chosenTo ? label(chosenTo).title : t("replacePick")}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** One of the two lists: the key's rows, a search box and kind groups once long; the arrows move the choice. */
function EntryList({ heading, entries, value, onChange, counts, onConfirm, autoFocus, testId, empty }: {
  heading: string;
  entries: KeyIndex[];
  value: KeyIndex;
  onChange: (k: KeyIndex) => void;
  counts?: Map<KeyIndex, number>;
  onConfirm: () => void;
  autoFocus?: boolean;
  testId: string;
  empty?: string;
}) {
  const t = useTranslations("key");
  const ed = useEditor();
  const key = useEditorState((st) => st.doc.key);
  const palette = useEditorState((st) => st.palette);
  const label = useEntryLabel();
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const long = entries.length >= LONG;
  const only = new Set(entries);
  const groups = keyView(ed.doc, (k) => counts?.get(k) ?? 0, { query: long ? query : "", sort: "added", grouped: long })
    .map((g) => ({ ...g, entries: g.entries.filter((k) => only.has(k)) }))
    .filter((g) => g.entries.length);
  const shown = groups.flatMap((g) => g.entries);
  const id = (k: KeyIndex) => `${testId}-${k}`;

  // the choice stays in view as it moves
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-entry="${value}"]`)?.scrollIntoView({ block: "nearest" });
  }, [value, query]);
  useLayoutEffect(() => {
    if (autoFocus) list.current?.focus();
  }, [autoFocus]);

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = shown.indexOf(value);
    const go = (i: number) => {
      e.preventDefault();
      const k = shown[Math.max(0, Math.min(shown.length - 1, i))];
      if (k) onChange(k);
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at <= 0 ? 0 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(shown.length - 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      onConfirm();
    } else if (long && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // typing while in the list: straight into the search
      search.current?.focus();
    }
  };
  const searchKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && query) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setQuery("");
    } else if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      if (shown.length && !shown.includes(value)) onChange(shown[0]!);
      list.current?.focus();
    }
  };

  const row = (k: KeyIndex) => {
    const e = key[k]!, slot = palette[k], { title, sub } = label(k), n = counts?.get(k);
    return (
      <div key={k} id={id(k)} role="option" aria-selected={k === value} data-entry={k} className={cx(side.row, s.row, k === value && side.on)} onClick={() => { onChange(k); list.current?.focus(); }} onDoubleClick={onConfirm}>
        {slot && <KeyIcon slot={slot} />}
        <div className={side.text}>
          <div className={side.title}>{title}</div>
          <div className={side.sub}>{sub}</div>
        </div>
        {n !== undefined && (
          <div className={side.num}>
            {n.toLocaleString()}
            <div className={side.sub}>{t(`unit.${isPointBead(e) ? "bead" : UNIT[e.t]}`, { count: n })}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={s.column} data-testid={testId}>
      <div className={s.heading}>{heading}</div>
      {long && <input ref={search} className={ui.input} type="search" placeholder={t("search")} aria-label={`${heading}: ${t("search")}`} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={searchKeys} />}
      <div ref={list} className={s.list} role="listbox" tabIndex={0} aria-label={heading} aria-activedescendant={value ? id(value) : undefined} onKeyDown={move}>
        {!entries.length && empty && <p className={cx(ui.hint, s.empty)}>{empty}</p>}
        {entries.length > 0 && !shown.length && <p className={cx(ui.hint, s.empty)}>{t("noMatch")}</p>}
        {groups.map((g) =>
          g.kind === null ? g.entries.map(row) : (
            <section key={g.kind}>
              <div className={cx(side.groupHead, s.groupHead)}>
                {t(`groups.${g.kind}`)}
                <span className={side.count}>{g.entries.length}</span>
              </div>
              {g.entries.map(row)}
            </section>
          ),
        )}
      </div>
    </div>
  );
}
