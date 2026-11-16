"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./guide.module.css";

type Step = { id: string; targets: string[]; reveal?: string[]; tip?: boolean };

/**
 * Tours (SPEC §9.8). `intro` is the quick start for a перенабір; the others are feature tips shown once, right after
 * the feature is first used (`pendingTip`). `targets` are `data-guide` names to highlight (`menu:<id>` = a menu
 * option); `reveal` holds the main menu open on those submenus. Texts: `guide.<step id>.title`, `.points.{1,2,…}`,
 * optional `.tip`.
 */
export const TOURS: Record<string, Step[]> = {
  intro: [
    { id: "welcome", targets: [] },
    { id: "create", targets: ["menu", "menu:newBlank"], reveal: ["new"] },
    { id: "key", targets: ["add-key", "menu:refWindow"], reveal: ["references"], tip: true },
    { id: "trace", targets: ["menu:refUnderlay"], reveal: ["references"], tip: true },
    { id: "autofill", targets: ["tool-autofill"], tip: true },
    { id: "views", targets: ["views"] },
    { id: "tools", targets: ["toolbar", "override", "shortcuts"], tip: true },
    { id: "save", targets: ["saved", "menu:download"], reveal: [] },
    { id: "versions", targets: ["menu:versions"], reveal: [] },
    { id: "finish", targets: ["menu:info", "menu:oxs"], reveal: ["export"] },
    { id: "done", targets: [] },
  ],
  underlay: [{ id: "underlayTip", targets: ["underlay-edit"] }],
  reference: [
    { id: "referenceTip", targets: ["ref-window"] },
    { id: "referenceMarks", targets: ["ref-marker", "ref-done"] },
  ],
  // the first time Autofill is picked: what it needs, lining up, and that it isn't perfect
  autofill: [
    { id: "autofillPrepare", targets: ["add-key", "tool-autofill"] },
    { id: "autofillAlign", targets: ["underlay-edit"] },
    { id: "autofillHonest", targets: ["tool-autofill"] },
  ],
  // the first time Autofill shows what it found: the bar's buttons
  autofillReview: [
    { id: "autofillReview", targets: ["match-bar"] },
    { id: "autofillPreview", targets: ["match-view", "match-peek"] },
  ],
};

/** The intro opens by itself on the very first visit; each tip once, the first time its feature is used. */
const seenKey = (tour: string) => (tour === "intro" ? "stitchwork.guideSeen" : `stitchwork.tipSeen.${tour}`);

/** Marks a tour as seen; false if it already was (or storage is unavailable — then tips stay quiet). */
function firstTime(tour: string): boolean {
  try {
    if (localStorage.getItem(seenKey(tour))) return false;
    localStorage.setItem(seenKey(tour), "1");
    return true;
  } catch {
    return false;
  }
}

const PAD = 6, GAP = 18, CARD_W = 460;

type Box = { x: number; y: number; w: number; h: number };

function boxesOf(selector: string, pad: number): Box[] {
  return [...document.querySelectorAll<HTMLElement>(selector)].flatMap((el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height ? [{ x: r.left - pad, y: r.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad }] : [];
  });
}

const measure = (names: string[]) => names.flatMap((n) => boxesOf(`[data-guide="${n}"]`, PAD));

/** Hosts the tours: the intro on the first visit or from the menu, a feature tip once its feature is on screen. */
export function Guide() {
  const ed = useEditor();
  const ready = useEditorState((st) => st.ready);
  const tour = useEditorState((st) => st.guide);
  const pending = useEditorState((st) => st.pendingTip);
  // a tip waits until nothing else is in the way: no dialog (e.g. straightening), no other tour, picture loaded
  const blocked = useEditorState((st) => !!st.dialog || !!st.guide || (st.pendingTip === "underlay" && !st.underlayImage));

  useEffect(() => {
    if (ready && firstTime("intro")) ed.store.setState({ guide: "intro" });
  }, [ed, ready]);

  useEffect(() => {
    if (!pending || blocked) return;
    ed.store.setState({ pendingTip: null, ...(firstTime(pending) && TOURS[pending] ? { guide: pending } : {}) });
  }, [ed, pending, blocked]);

  if (!tour || !TOURS[tour]) return null;
  return <GuideTour key={tour} steps={TOURS[tour]} onClose={() => ed.store.setState({ guide: null })} />;
}

function GuideTour({ steps, onClose }: { steps: Step[]; onClose: () => void }) {
  const ed = useEditor();
  const g = useTranslations("guide");
  const [i, setI] = useState(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  /** Open menus stay clear of the shade, so the highlighted option is seen in context. */
  const [menus, setMenus] = useState<Box[]>([]);
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i]!, last = i === steps.length - 1, single = steps.length === 1;

  // hold the menu open where the step points; let go when the guide closes
  useEffect(() => {
    ed.store.setState({ menuReveal: step.reveal ?? null });
  }, [ed, step]);
  useEffect(() => () => ed.store.setState({ menuReveal: null }), [ed]);

  // highlight the step's elements and put the card beside them (menus open at the left, so to their right first)
  useLayoutEffect(() => {
    const place = () => {
      const b = measure(step.targets), c = cardRef.current;
      setBoxes(b);
      setMenus(step.reveal ? boxesOf("[role=menu]", 0) : []);
      if (!c) return;
      const W = window.innerWidth, H = window.innerHeight, cw = c.offsetWidth, ch = c.offsetHeight;
      if (!b.length) return setCard({ left: (W - cw) / 2, top: (H - ch) / 2 });
      const top = Math.min(...b.map((r) => r.y)), bottom = Math.max(...b.map((r) => r.y + r.h));
      const left = Math.min(...b.map((r) => r.x)), right = Math.max(...b.map((r) => r.x + r.w));
      const clampX = (x: number) => Math.max(8, Math.min(W - cw - 8, x)), clampY = (y: number) => Math.max(8, Math.min(H - ch - 8, y));
      const options = [
        right + GAP + cw <= W - 8 && { left: right + GAP, top: clampY(top) },
        bottom + GAP + ch <= H - 8 && { left: clampX(left), top: bottom + GAP },
        top - GAP - ch >= 8 && { left: clampX(left), top: top - GAP - ch },
        left - GAP - cw >= 8 && { left: left - GAP - cw, top: clampY(top) },
      ];
      const order = step.reveal ? [0, 3, 1, 2] : [1, 2, 0, 3];
      setCard(order.map((n) => options[n]).find(Boolean) || { left: (W - cw) / 2, top: (H - ch) / 2 });
    };
    // menus and submenus open a frame or two later
    place();
    const raf = requestAnimationFrame(place), t1 = setTimeout(place, 120), t2 = setTimeout(place, 300);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", place);
    };
  }, [step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.key === "ArrowRight" || e.key === "Enter") && last) onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") setI((n) => n + 1);
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [last, onClose]);

  const tags = { b: (c: React.ReactNode) => <b>{c}</b>, hl: (c: React.ReactNode) => <mark className={s.hl}>{c}</mark> };
  const points = Object.keys((g.raw(`${step.id}.points`) as Record<string, string>) ?? {});
  return (
    <div className={s.layer} role="dialog" aria-modal="true" aria-label={g("title")} data-testid="guide">
      <svg className={s.shade} width="100%" height="100%" aria-hidden>
        <defs>
          <mask id="guide-holes">
            <rect width="100%" height="100%" fill="#fff" />
            {[...menus, ...boxes].map((r, n) => <rect key={n} x={r.x} y={r.y} width={r.w} height={r.h} rx={9} fill="#000" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#14100c" fillOpacity={0.62} mask="url(#guide-holes)" />
      </svg>
      {boxes.map((r, n) => <div key={n} className={s.ring} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />)}
      <div ref={cardRef} className={s.card} style={{ width: CARD_W, ...(card ? { left: card.left, top: card.top } : { visibility: "hidden" }) }}>
        <div className={s.count}>{single ? g("tipLabel") : g("count", { n: i + 1, total: steps.length })}</div>
        <h3>{g(`${step.id}.title`)}</h3>
        <ul className={s.points}>
          {points.map((k) => <li key={k}>{g.rich(`${step.id}.points.${k}`, tags)}</li>)}
        </ul>
        {step.tip && <p className={s.tip}>{g.rich(`${step.id}.tip`, tags)}</p>}
        <div className={s.foot}>
          {!last && <button type="button" className={s.skip} onClick={onClose}>{g("skip")}</button>}
          <span className={s.spacer} />
          {i > 0 && <button type="button" className={ui.btn} onClick={() => setI(i - 1)}>{g("back")}</button>}
          <button type="button" className={cx(ui.btn, ui.primary)} autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>{!last ? g("next") : steps === TOURS.intro ? g("done.button") : g("gotIt")}</button>
        </div>
      </div>
    </div>
  );
}
