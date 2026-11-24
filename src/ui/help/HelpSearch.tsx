"use client";

import { useMemo, useState } from "react";
import s from "./help.module.css";

interface Item {
  href: string;
  q: string;
  page: string;
  /** The answer as plain text, searched too. */
  text: string;
}

const norm = (t: string) => t.toLowerCase().replace(/[’'`*]/g, "").replace(/ё/g, "е");

/** Search every question of the help: all the words typed, in the question or its answer; questions first. */
export function HelpSearch({ items, placeholder, noMatch }: { items: Item[]; placeholder: string; noMatch: string }) {
  const [query, setQuery] = useState("");
  const index = useMemo(() => items.map((it) => ({ it, q: norm(it.q), all: norm(`${it.q} ${it.text}`) })), [items]);
  const words = norm(query).split(/\s+/).filter(Boolean);
  const found = words.length
    ? index
        .filter((x) => words.every((w) => x.all.includes(w)))
        .sort((a, b) => Number(words.every((w) => b.q.includes(w))) - Number(words.every((w) => a.q.includes(w))))
        .slice(0, 30)
    : [];
  return (
    <>
      <input className={s.search} type="search" placeholder={placeholder} aria-label={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus data-testid="help-search" />
      {words.length > 0 && (found.length ? (
        <ul className={s.results}>
          {found.map(({ it }) => (
            <li key={it.href}>
              <a href={it.href}>
                {it.q}
                <span className={s.resultPage}>{it.page}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : <p className={s.noMatch}>{noMatch}</p>)}
    </>
  );
}
