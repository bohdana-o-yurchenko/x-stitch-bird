import type { ReactNode } from "react";
import { cx } from "../common/widgets";
import s from "./layout.module.css";

/** The screen's slots (ARCHITECTURE §6.3). Rearranging panels only touches this file and its CSS. */
export function EditorLayout(props: { collapsed: boolean; header: ReactNode; stage: ReactNode; side: ReactNode; status: ReactNode; overlays: ReactNode }) {
  return (
    <div className={cx(s.app, props.collapsed && s.collapsed)}>
      <div className={s.header}>{props.header}</div>
      <main className={s.stage}>{props.stage}</main>
      <aside className={s.side}>{props.side}</aside>
      <div className={s.status}>{props.status}</div>
      {props.overlays}
    </div>
  );
}

export function DropZoneOverlay({ text }: { text: string }) {
  return <div className={s.dropzone}>{text}</div>;
}
