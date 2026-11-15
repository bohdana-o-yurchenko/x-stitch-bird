"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CHANGELOG, compareVersions, releasesSince } from "@/core/release/changelog";
import { Modal, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? CHANGELOG[0]!.version;

/** The version whose notes this browser has seen; "What's new" opens once after an update (docs/RELEASING.md). */
const SEEN_KEY = "stitchwork.seenVersion";

/** Release notes, newest first; `since`: only what is new after that version (shown after an update). */
export function ChangelogDialog({ since, onClose }: { since?: string | null; onClose: () => void }) {
  const t = useTranslations("changelog");
  const locale = useLocale();
  const list = since !== undefined ? releasesSince(since) : [...CHANGELOG];
  const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  return (
    <Modal title={t("title")} onClose={onClose} buttons={[{ label: t("close"), primary: true }]}>
      <p className={ui.hint} style={{ margin: "0 0 14px" }}>{t("current", { version: APP_VERSION })}</p>
      {list.map((r) => (
        <section key={r.version} style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>
            {t("release", { version: r.version })} <span className={ui.hint} style={{ fontWeight: 400 }}>· {date(r.date)}</span>
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
            {(locale === "uk" ? r.uk : r.en).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      ))}
    </Modal>
  );
}

/**
 * Opens "What's new" once after an update, when nothing else is on screen. Brand-new users get the intro guide
 * instead (they only start counting from the current version).
 */
export function WhatsNewOnUpdate() {
  const ed = useEditor();
  const ready = useEditorState((st) => st.ready);
  const free = useEditorState((st) => !st.dialog && !st.guide);
  // read before the guide marks its first visit
  const [newUser] = useState(() => {
    try {
      return !localStorage.getItem("stitchwork.guideSeen");
    } catch {
      return false;
    }
  });
  const done = useRef(false);
  useEffect(() => {
    if (!ready || !free || done.current) return;
    done.current = true;
    let seen: string | null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    } catch {
      return;
    }
    if (newUser && !seen) return;
    if (seen && compareVersions(APP_VERSION, seen) <= 0) return;
    ed.openDialog({ type: "changelog", since: seen });
  }, [ed, ready, free, newUser]);
  return null;
}
