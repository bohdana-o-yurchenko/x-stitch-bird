"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { tipDue, tipsInOrder, today, type Tip } from "@/core/tips/tips";
import { helpHref } from "../help/help";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState, useKeyNames } from "../hooks/editor";
import s from "./tips.module.css";

/** Waits this long once the editor is calm before today's tip shows: not in the middle of starting up. */
const SETTLE_MS = 4_000;
/** How long "Show me" points at the place. */
const SPOT_MS = 4_500;

/** Targets that live in the side panel: it's opened for them. */
const IN_PANEL = (n: string) => n.startsWith("side-") || n === "add-key" || n === "highlight";

type Box = { x: number; y: number; w: number; h: number };
const boxesOf = (names: string[]): Box[] =>
  names.flatMap((n) =>
    [...document.querySelectorAll<HTMLElement>(`[data-guide="${n}"]`)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      return r.width && r.height ? [{ x: r.left - 5, y: r.top - 5, w: r.width + 10, h: r.height + 10 }] : [];
    }),
  );

/**
 * Tip of the day (SPEC §15.60): once a day, when the editor is calm, a small card in the corner — a shortcut for
 * something, or where a feature is — picked from what this person hasn't used yet (core/tips). ‹ › browse the
 * others, "Show me" points at the place, "Read more" opens its help question. Also from ☰ ▸ Tip of the day.
 */
export function TipOfTheDay() {
  const ed = useEditor();
  const open = useEditorState((st) => st.tipCard);
  const ready = useEditorState((st) => st.ready && st.accountKnown && !st.arriving);
  // something else has the person's attention: no tip now
  const busy = useEditorState((st) => !!st.dialog || !!st.guide || !!st.pendingTip || !!st.keyForm || !!st.match || !!st.floating);

  useEffect(() => {
    if (!ready || busy || open) return;
    const t = setTimeout(() => {
      if (!tipDue(ed.tips.state, today()) || ed.state.tipCard) return;
      if (!tipsInOrder(ed.tips.state, !!ed.state.account).length) return;
      ed.store.setState({ tipCard: "auto" });
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [ed, ready, busy, open]);

  if (!open) return null;
  return <TipCard key={open} auto={open === "auto"} onClose={() => ed.store.setState({ tipCard: null })} />;
}

function TipCard({ auto, onClose }: { auto: boolean; onClose: () => void }) {
  const ed = useEditor();
  const t = useTranslations("tips");
  const locale = useLocale();
  const keys = useKeyNames();
  const mac = ed.isMac;
  // the tips as they stood when the card opened: browsing doesn't reshuffle them
  const [list] = useState<Tip[]>(() => tipsInOrder(ed.tips.state, !!ed.state.account));
  const [i, setI] = useState(0);
  const [daily, setDaily] = useState(!ed.tips.state.off);
  const [spot, setSpot] = useState<Box[] | null>(null);
  const tip = list[i];

  // each tip shown counts as seen; the first one opened by itself is today's
  useEffect(() => {
    if (!tip) return;
    ed.tips.markShown(tip.id);
  }, [ed, tip]);
  useEffect(() => {
    if (auto) ed.tips.shownToday();
  }, [ed, auto]);

  // Esc closes it, unless a menu or dialog is the one to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !ed.state.dialog && !ed.state.menuReveal && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ed, onClose]);

  const values = { mod: mac ? "⌘" : "Ctrl+", shift: mac ? "⇧" : "Shift+", shiftKey: mac ? "⇧" : "Shift", alt: keys.alt, undo: keys.undo, redo: keys.redo };
  const text = tip && t.rich(`items.${tip.id}`, { ...values, b: (c) => <b className={s.ui}>{c}</b>, k: (c) => <kbd className={s.key}>{c}</kbd> });

  const showMe = () => {
    const show = tip?.show;
    if (!show) return;
    if (ed.state.panelCollapsed && (show.section || show.targets.some(IN_PANEL))) void ed.commands.run("panel.toggle");
    if (show.section) ed.showSection(show.section);
    if (show.menu) ed.store.setState({ menuReveal: { menu: show.menu, path: show.reveal ?? [] } });
    // once the panel, section or menu is drawn
    requestAnimationFrame(() => requestAnimationFrame(() => setSpot(boxesOf(show.targets))));
  };
  const endSpot = () => {
    setSpot(null);
    if (tip?.show?.menu) ed.store.setState({ menuReveal: null });
  };
  useEffect(() => {
    if (!spot) return;
    const done = setTimeout(endSpot, SPOT_MS);
    const away = () => endSpot();
    window.addEventListener("pointerdown", away, true);
    return () => {
      clearTimeout(done);
      window.removeEventListener("pointerdown", away, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one spotlight at a time
  }, [spot]);
  // the menu held open by "Show me" lets go when the card goes
  useLayoutEffect(() => () => {
    if (ed.state.menuReveal) ed.store.setState({ menuReveal: null });
  }, [ed]);

  const go = (d: number) => {
    endSpot();
    setI((n) => (n + d + list.length) % list.length);
  };

  return (
    <>
      {spot && (
        <div className={s.spots} aria-hidden>
          {spot.map((b, n) => <div key={n} className={s.ring} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />)}
        </div>
      )}
      <aside className={s.card} role="dialog" aria-label={t("title")} data-testid="tip-card" data-tip={tip?.id}>
        <div className={s.head}>
          <span className={s.kicker}><Icon name="bulb" size={15} /> {t("title")}</span>
          <button type="button" className={ui.iconbtn} title={t("close")} aria-label={t("close")} onClick={onClose}>✕</button>
        </div>
        {tip ? <p className={s.text}>{text}</p> : <p className={s.text}>{t("none")}</p>}
        {tip && (
          <div className={s.actions}>
            {tip.show && <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} data-testid="tip-show" onClick={showMe}>{t("showMe")}</button>}
            <a className={cx(ui.btn, ui.sm)} href={helpHref(locale, tip.help)} target="_blank" rel="noopener" data-testid="tip-more">{t("more")} ↗</a>
            <span className={s.spacer} />
            {list.length > 1 && (
              <span className={s.nav}>
                <button type="button" className={ui.iconbtn} title={t("prev")} aria-label={t("prev")} onClick={() => go(-1)}>‹</button>
                <span className={s.count}>{i + 1} / {list.length}</span>
                <button type="button" className={ui.iconbtn} title={t("next")} aria-label={t("next")} data-testid="tip-next" onClick={() => go(1)}>›</button>
              </span>
            )}
          </div>
        )}
        <label className={cx(ui.chk, s.daily)}>
          <input type="checkbox" checked={daily} data-testid="tip-daily" onChange={(e) => { setDaily(e.target.checked); ed.tips.setOff(!e.target.checked); }} />
          {t("daily")}
        </label>
      </aside>
    </>
  );
}
