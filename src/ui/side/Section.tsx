"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import s from "./side.module.css";

const KEY = "stitchwork.sections";

function read(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** In the side panel the panel draws the header and folds it (SPEC §15.32): a section is then just its content. */
export const InSidePanel = createContext(false);

/** A collapsible side-panel section whose open/closed state is remembered in this browser (per section `id`). */
export function Section({ id, title, defaultOpen = false, testId, children }: { id: string; title: string; defaultOpen?: boolean; testId?: string; children: ReactNode }) {
  const inPanel = useContext(InSidePanel);
  const [open, setOpen] = useState(() => read()[id] ?? defaultOpen);
  if (inPanel)
    return (
      <div data-section={id} data-testid={testId}>
        {children}
      </div>
    );
  const toggle = (now: boolean) => {
    setOpen(now);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: now }));
    } catch {
      // private mode: the state just isn't remembered
    }
  };
  return (
    <details className={s.details} open={open} data-testid={testId} data-section={id} onToggle={(e) => toggle(e.currentTarget.open)}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

