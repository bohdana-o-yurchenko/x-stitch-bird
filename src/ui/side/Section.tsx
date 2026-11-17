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

/** Inside a tool pane (SidePanel): a section is just its content — the pane shows the title. */
export const InToolPane = createContext(false);

/** A collapsible side-panel section whose open/closed state is remembered in this browser (per section `id`). */
export function Section({ id, title, defaultOpen = false, testId, children }: { id: string; title: string; defaultOpen?: boolean; testId?: string; children: ReactNode }) {
  const inPane = useContext(InToolPane);
  const [open, setOpen] = useState(() => read()[id] ?? defaultOpen);
  if (inPane)
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
