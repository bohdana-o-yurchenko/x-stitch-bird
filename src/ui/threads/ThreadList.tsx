"use client";

import type { KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { cx } from "../common/widgets";
import type { InventoryView, Item } from "./inventoryView";
import s from "./threadList.module.css";

/**
 * Colours in one of two views: a gallery of big swatches, or a compact list (one line each). A bead's swatch is
 * round; your own have a dot. Picking one shows it (its panel).
 */
export function ThreadList({ items, view, picked, onPick, onDuplicate }: { items: readonly Item[]; view: InventoryView; picked?: string | null; onPick: (i: Item) => void; onDuplicate: (i: Item) => void }) {
  const t = useTranslations("threadsPage");
  // the arrows move the pick round the grid (up and down by a row of the gallery)
  const move = (ev: KeyboardEvent<HTMLUListElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns(ev.currentTarget), ArrowDown: columns(ev.currentTarget) }[ev.key];
    const at = items.findIndex((i) => i.entry.id === picked);
    if (!step || at < 0) return;
    const next = items[at + step];
    if (!next) return;
    ev.preventDefault();
    onPick(next);
    ev.currentTarget.querySelector<HTMLElement>(`[data-colour="${CSS.escape(next.entry.id)}"]`)?.focus();
  };
  return (
    <ul className={cx(s.list, s[view])} data-testid="thread-list" data-view={view} onKeyDown={move}>
      {items.map((i) => {
        const e = i.entry;
        return (
          <li key={e.id} className={s.row}>
            <button type="button" className={cx(s.item, picked === e.id && s.on)} onClick={() => onPick(i)} aria-label={t("show", { brand: e.brand, code: e.code })} aria-current={picked === e.id || undefined} data-colour={e.id}>
              <span className={cx(s.swatch, e.kind === "bead" && s.round)} style={{ background: e.hex }} />
              <span className={s.text}>
                <b>
                  {e.code}
                  {i.own && <span className={s.mine} title={t("yours")} aria-label={t("yours")} data-testid="own-mark" />}
                </b>
                {e.name !== e.code && <span className={s.name}>{e.name}</span>}
                <small className={s.brand}>{e.brand}</small>
              </span>
            </button>
            <button type="button" className={s.duplicate} onClick={() => onDuplicate(i)} title={t("duplicateOne", { code: e.code })} aria-label={t("duplicateOne", { code: e.code })}>⧉</button>
          </li>
        );
      })}
    </ul>
  );
}

/** How many items a row of the list holds: those level with the first. */
function columns(list: HTMLElement): number {
  const rows = [...list.children] as HTMLElement[], top = rows[0]?.offsetTop;
  return Math.max(1, rows.filter((r) => r.offsetTop === top).length);
}
