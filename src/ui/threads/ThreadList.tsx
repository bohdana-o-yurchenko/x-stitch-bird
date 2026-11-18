"use client";

import { useTranslations } from "next-intl";
import type { CustomColor } from "@/core/pattern/types";
import { cx } from "../common/widgets";
import type { InventoryView } from "./inventoryView";
import s from "./threadList.module.css";

/**
 * Your threads or beads in one of three views: a gallery of big swatches, a compact list (one line each), or a large
 * list (a big swatch, the name and the colour). A bead's swatch is round. Picking one opens it for changing.
 */
export function ThreadList({ items, view, onPick }: { items: readonly CustomColor[]; view: InventoryView; onPick: (c: CustomColor) => void }) {
  const t = useTranslations("threadsPage");
  return (
    <ul className={cx(s.list, s[view])} data-testid="thread-list" data-view={view}>
      {items.map((c) => (
        <li key={c.id}>
          <button type="button" className={s.item} onClick={() => onPick(c)} aria-label={t("edit", { brand: c.brand, code: c.code })}>
            <span className={cx(s.swatch, c.kind === "bead" && s.round)} style={{ background: c.hex }} />
            <span className={s.text}>
              <b>{c.code}</b>
              {c.name !== c.code && <span className={s.name}>{c.name}</span>}
              <small className={s.brand}>{c.brand}</small>
            </span>
            {view === "large" && <span className={s.hex}>{c.hex}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
