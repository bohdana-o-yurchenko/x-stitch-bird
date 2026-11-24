"use client";

import { useEffect, useRef, useState } from "react";
import s from "./help.module.css";

interface TocGroup {
  title: string;
  qs: { id: string; q: string }[];
}

/** How far below the top of the text's own scroll the reading line sits: a little into the text. */
const READING_LINE = 64;

/**
 * "On this page": the page's questions, the one being read marked. Being read = the last question whose top has
 * scrolled above the reading line (near the top of the text's scroll) — the one whose text fills the top of the view. At the very
 * bottom of the page it's the last question, which may never reach the line.
 */
export function HelpToc({ title, groups }: { title: string; groups: TocGroup[] }) {
  const ids = groups.flatMap((g) => g.qs.map((q) => q.id));
  const [current, setCurrent] = useState<string | null>(null);
  const list = useRef<HTMLElement>(null);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>("[data-help-scroll]");
    if (!scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = scroller.getBoundingClientRect().top + READING_LINE;
      let at: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) at = id;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) at = ids[ids.length - 1] ?? at;
      setCurrent(at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
    // the ids are the page's; they don't change while it's shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a long list keeps the marked question in view — moving only the list, never the page
  useEffect(() => {
    const box = list.current, item = current ? box?.querySelector<HTMLElement>(`[data-toc="${current}"]`) : null;
    if (!box || !item) return;
    const top = item.offsetTop - box.offsetTop, bottom = top + item.offsetHeight;
    if (top < box.scrollTop + 24) box.scrollTop = Math.max(0, top - 24);
    else if (bottom > box.scrollTop + box.clientHeight - 24) box.scrollTop = bottom - box.clientHeight + 24;
  }, [current]);

  return (
    <nav ref={list} className={s.toc} aria-label={title}>
      <p className={s.tocTitle}>{title}</p>
      {groups.map((g) => (
        <div key={g.title} className={s.tocGroup}>
          {groups.length > 1 && <p className={s.tocGroupTitle}>{g.title}</p>}
          <ul>
            {g.qs.map((q) => (
              <li key={q.id}>
                <a href={`#${q.id}`} data-toc={q.id} aria-current={q.id === current ? "location" : undefined} onClick={() => setCurrent(q.id)}>
                  {q.q}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
