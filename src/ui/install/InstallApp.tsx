"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Modal, ui, type MenuItem } from "../common/widgets";
import { installWay, promptInstall, watchInstall, type InstallWay } from "./install";

/**
 * ☰ ▸ Install the app… (SPEC §15.50), on laptops in a browser that can: the item, and the dialog it opens (kept out
 * of the menu, which closes). Neither on phones and tablets, nor in the app's own window.
 */
export function useInstallApp(): [MenuItem | null, ReactNode] {
  const t = useTranslations("install");
  const way = useSyncExternalStore(watchInstall, installWay, () => null);
  const [open, setOpen] = useState(false);
  const item: MenuItem | null = way && { id: "install", label: t("menu"), hint: t("menuHint"), onClick: () => setOpen(true) };
  return [item, open && way ? <InstallDialog way={way} onClose={() => setOpen(false)} /> : null];
}

function InstallDialog({ way, onClose }: { way: InstallWay; onClose: () => void }) {
  const t = useTranslations("install");
  const d = useTranslations("dialogs");
  const b = (c: ReactNode) => <b>{c}</b>;
  const buttons =
    way === "prompt"
      ? [{ label: d("cancel") }, { label: t("install"), primary: true, onClick: () => void promptInstall() }]
      : [{ label: d("close"), primary: true }];
  return (
    <Modal title={t("title")} onClose={onClose} buttons={buttons}>
      <div data-testid="install-app">
        <p>{t("what")}</p>
        <p>{t.rich("internet", { b })}</p>
        {way !== "prompt" && <p className={ui.hint}>{t.rich(way, { b })}</p>}
      </div>
    </Modal>
  );
}
