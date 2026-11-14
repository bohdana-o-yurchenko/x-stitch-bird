"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./guide.module.css";

/** Seen once: the guide opens by itself only on the very first visit (then from Menu ▸ Quick start guide). */
const SEEN_KEY = "stitchwork.guideSeen";

/**
 * Quick-start steps for a перенабір (an e-copy of a paper chart). `targets` are `data-guide` names of the
 * elements to highlight; `paths` are menu paths (message keys) shown as chips.
 */
const STEPS: { id: string; targets: string[]; paths?: string[][]; tip?: boolean }[] = [
  { id: "welcome", targets: [] },
  { id: "create", targets: ["menu"], paths: [["fileMenu.label", "fileMenu.new", "fileMenu.newBlank"]] },
  { id: "key", targets: ["add-key"], paths: [["fileMenu.label", "fileMenu.references", "fileMenu.refWindow"]], tip: true },
  { id: "trace", targets: ["menu"], paths: [["fileMenu.label", "fileMenu.references", "fileMenu.refUnderlay"]], tip: true },
  { id: "views", targets: ["views"] },
  { id: "tools", targets: ["toolbar", "shortcuts"], tip: true },
  { id: "save", targets: ["saved", "menu"], paths: [["fileMenu.label", "fileMenu.download"]] },
  { id: "versions", targets: ["menu"], paths: [["fileMenu.label", "fileMenu.versions"]] },
  { id: "finish", targets: ["menu"], paths: [["fileMenu.label", "fileMenu.info"], ["fileMenu.label", "fileMenu.export", "fileMenu.oxs"]] },
  { id: "done", targets: [] },
];

const PAD = 6, GAP = 14, CARD_W = 400;

type Box = { x: number; y: number; w: number; h: number };

function measure(names: string[]): Box[] {
  return names.flatMap((n) =>
    [...document.querySelectorAll<HTMLElement>(`[data-guide="${n}"]`)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      return r.width && r.height ? [{ x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD }] : [];
    }),
  );
}

/** Opens itself on the first visit; otherwise shown when `guideOpen` is set (menu). */
export function Guide() {
  const ed = useEditor();
  const ready = useEditorState((st) => st.ready);
  const open = useEditorState((st) => st.guideOpen);

  useEffect(() => {
    if (!ready) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
    ed.store.setState({ guideOpen: true });
  }, [ed, ready]);

  if (!open) return null;
  return <GuideTour onClose={() => ed.store.setState({ guideOpen: false })} />;
}

function GuideTour({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const g = useTranslations("guide");
  const [i, setI] = useState(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = STEPS[i]!, last = i === STEPS.length - 1;

  // highlight the step's elements and put the card next to them (below if there's room, else above)
  useLayoutEffect(() => {
    const place = () => {
      const b = measure(step.targets), c = cardRef.current;
      setBoxes(b);
      if (!c) return;
      const W = window.innerWidth, H = window.innerHeight, cw = c.offsetWidth, ch = c.offsetHeight;
      if (!b.length) return setCard({ left: (W - cw) / 2, top: (H - ch) / 2 });
      const top = Math.min(...b.map((r) => r.y)), bottom = Math.max(...b.map((r) => r.y + r.h)), left = Math.min(...b.map((r) => r.x));
      const y = bottom + GAP + ch <= H - 8 ? bottom + GAP : top - GAP - ch >= 8 ? top - GAP - ch : (H - ch) / 2;
      setCard({ left: Math.max(8, Math.min(W - cw - 8, left)), top: y });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
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

  const b = (c: React.ReactNode) => <b>{c}</b>;
  const label = (k: string) => t(k).replace(/\s*▾$/, "");
  return (
    <div className={s.layer} role="dialog" aria-modal="true" aria-label={g("title")} data-testid="guide">
      <svg className={s.shade} width="100%" height="100%" aria-hidden>
        <defs>
          <mask id="guide-holes">
            <rect width="100%" height="100%" fill="#fff" />
            {boxes.map((r, n) => <rect key={n} x={r.x} y={r.y} width={r.w} height={r.h} rx={9} fill="#000" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#14100c" fillOpacity={0.62} mask="url(#guide-holes)" />
      </svg>
      {boxes.map((r, n) => <div key={n} className={s.ring} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />)}
      <div ref={cardRef} className={s.card} style={{ width: CARD_W, ...(card ? { left: card.left, top: card.top } : { visibility: "hidden" }) }}>
        <div className={s.count}>{g("count", { n: i + 1, total: STEPS.length })}</div>
        <h3>{g(`${step.id}.title`)}</h3>
        <p>{g.rich(`${step.id}.body`, { b })}</p>
        {step.paths?.map((p) => (
          <div key={p.join()} className={s.path}>
            {p.map((k, n) => (
              <Fragment key={k}>
                {n > 0 && <span className={s.arrow}>▸</span>}
                <span className={s.chip}>{label(k)}</span>
              </Fragment>
            ))}
          </div>
        ))}
        {step.tip && <p className={s.tip}>{g.rich(`${step.id}.tip`, { b })}</p>}
        <div className={s.foot}>
          {!last && <button type="button" className={s.skip} onClick={onClose}>{g("skip")}</button>}
          <span className={s.spacer} />
          {i > 0 && <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => setI(i - 1)}>{g("back")}</button>}
          <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>{last ? g("done.button") : g("next")}</button>
        </div>
      </div>
    </div>
  );
}
