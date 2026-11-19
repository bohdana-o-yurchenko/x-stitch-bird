"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { applyUpdate, startOffline, updateReady, watchUpdate } from "./offline";
import s from "./install.module.css";

/**
 * In the layout, on every page (SPEC §15.53): starts what lets the installed app open without the internet, and
 * says when a new version is ready — Reload, or later (it comes by itself once the app is closed and opened again).
 */
export function AppUpdate() {
  const t = useTranslations("install");
  useEffect(() => startOffline(), []);
  const ready = useSyncExternalStore(watchUpdate, updateReady, () => false);
  const [later, setLater] = useState(false);
  if (!ready || later) return null;
  return (
    <div className={s.update} role="status" data-testid="app-update">
      <span>{t.rich("updateReady", { b: (c) => <b>{c}</b> })}</span>
      <button type="button" className={cx(ui.btn, ui.primary, ui.sm)} onClick={applyUpdate}>{t("updateReload")}</button>
      <button type="button" className={s.later} title={t("updateLater")} aria-label={t("updateLater")} onClick={() => setLater(true)}>×</button>
    </div>
  );
}
