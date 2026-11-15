"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./common.module.css";

const DELAY_MS = 600;

type Tip = { text: string; anchor: DOMRect };

/**
 * App-wide tooltips for every element with a `title`, shown after DELAY_MS instead of the browser's long delay.
 * While hovered, the element's `title` is taken off (so the native tooltip stays away) and put back on leave.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: { el: Element; title: string } | null = null;
    const hide = () => {
      clearTimeout(timer);
      if (current && !current.el.hasAttribute("title")) current.el.setAttribute("title", current.title);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      // the element with the closest title wins: a button inside a row with its own title shows the button's
      const el = (e.target as Element | null)?.closest?.("[title]") ?? null;
      if (current?.el.contains(e.target as Node) && (!el || !current.el.contains(el))) return;
      hide();
      const title = el?.getAttribute("title");
      if (!el || !title) return;
      el.removeAttribute("title");
      current = { el, title };
      timer = setTimeout(() => setTip({ text: title, anchor: el.getBoundingClientRect() }), DELAY_MS);
    };
    const out = (e: PointerEvent) => {
      if (current && !current.el.contains(e.relatedTarget as Node | null)) hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // below the element, flipped above near the bottom, kept inside the window
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const a = tip.anchor, w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2));
    const top = a.bottom + 6 + h > window.innerHeight - 8 ? a.top - 6 - h : a.bottom + 6;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [tip]);

  if (!tip) return null;
  return <div ref={box} className={s.tooltip} role="tooltip" data-testid="tooltip">{tip.text}</div>;
}
