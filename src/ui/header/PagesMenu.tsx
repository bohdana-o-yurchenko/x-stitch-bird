"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Dropdown, ui, type MenuItem } from "../common/widgets";
import { Icon } from "../common/Icon";
import { SOURCE_URL } from "../common/source";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";
import { useInstallApp } from "../install/InstallApp";
import { Glory } from "./Glory";
import { LanguageSwitch } from "./LanguageSwitch";

/**
 * ☰ on the pages around the editor (My patterns, threads, beads, account — SPEC §15.49): the editor's menu without
 * what is only for the editor (the guide, What's new, the toolbar) — language, theme, installing, help, privacy, source.
 */
export function PagesMenu() {
  const t = useTranslations("fileMenu");
  const router = useRouter();
  const [install, installDialog] = useInstallApp();
  const items: MenuItem[] = [
    { id: "language", node: <LanguageSwitch /> },
    { id: "theme", node: <ThemeSwitcher /> },
    ...(install ? [install] : []),
    "-",
    { id: "support", label: t("support"), hint: t("supportHint"), onClick: () => router.push("/support") },
    { id: "privacy", label: t("privacy"), onClick: () => router.push("/privacy") },
    { id: "source", label: t("source"), hint: t("sourceHint"), onClick: () => void window.open(SOURCE_URL, "_blank", "noopener") },
    "-",
    { id: "glory", node: <Glory /> },
  ];
  return (
    <span data-testid="pages-menu">
      <Dropdown className={ui.tool} title={t("more")} label={<Icon name="menu" size={18} />} items={items} />
      {installDialog}
    </span>
  );
}
