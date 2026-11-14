"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { ChartView } from "@/render/chart";
import { Dropdown, cx, ui } from "../common/widgets";
import { Icon } from "../common/Icon";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import s from "./header.module.css";

function PatternName() {
  const name = useEditorState((st) => st.doc.name);
  return <PatternNameInput key={name} name={name} />;
}

function PatternNameInput({ name }: { name: string }) {
  const t = useTranslations("header");
  const run = useCommand();
  const [value, setValue] = useState(name);
  return <input className={s.name} aria-label={t("patternName")} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => run("pattern.rename", value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />;
}

function ViewSwitch() {
  const t = useTranslations("view");
  const run = useCommand();
  const view = useEditorState((st) => st.view);
  return (
    <div className={ui.seg} title={t("label")}>
      {(["color", "both", "symbols"] as ChartView[]).map((v) => (
        <button key={v} type="button" className={cx(view === v && ui.on)} onClick={() => run("view.set", v)}>
          {t(v)}
        </button>
      ))}
    </div>
  );
}

function LanguageSwitch() {
  const t = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const ed = useEditor();
  const change = (next: string) => {
    ed.flush();
    router.replace(pathname, { locale: next });
  };
  return (
    <select className={s.lang} aria-label={t("language")} value={locale} onChange={(e) => change(e.target.value)}>
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

/** Shown as buttons on wide screens and as a "File" menu on narrower ones (header.module.css). */
const FILE_ACTIONS = [
  ["info", "pattern.editInfo"],
  ["new", "file.new"],
  ["open", "file.open"],
  ["saveToFile", "file.saveToFile"],
  ["loadFile", "file.pickToLoad"],
  ["image", "image.pick"],
  ["reference", "reference.pick"],
] as const;

export function Header() {
  const t = useTranslations();
  const run = useCommand();
  const btn = cx(ui.btn, ui.ghost);
  const checksOpen = useEditorState((st) => st.checksOpen);
  return (
    <header className={s.bar}>
      <div className={s.brand}>
        <Icon name="brand" size={24} />
        <span className={s.brandText}>{t("app.brand")}</span>
      </div>
      <PatternName />
      <div className={s.inlineFiles}>
        {FILE_ACTIONS.map(([key, command]) => (
          <button key={key} type="button" className={btn} title={t(`header.${key}Title`)} onClick={() => run(command)}>{t(`header.${key}`)}</button>
        ))}
      </div>
      <div className={s.fileMenu}>
        <Dropdown className={btn} label={t("header.file")} items={FILE_ACTIONS.map(([key, command]) => ({ label: t(`header.${key}`), onClick: () => run(command) }))} />
      </div>
      <button type="button" className={btn} title={t("header.saveTitle")} onClick={() => run("file.save")}>{t("header.save")}</button>
      <div className={s.spacer} />
      <Dropdown
        className={btn}
        label={t("header.transform")}
        items={[
          ...(["flipH", "flipV", "rot90cw", "rot90ccw", "rot180"] as const).map((id) => ({ label: t(`transformMenu.${id}`), onClick: () => run("transform.apply", id) })),
          { label: t("transformMenu.mirrorFromCentre"), onClick: () => run("transform.requestMirror") },
          { label: t("transformMenu.cropToContent"), onClick: () => run("transform.crop") },
          { label: t("transformMenu.extendCanvas"), onClick: () => run("transform.requestExtend") },
          { label: t("transformMenu.resize"), onClick: () => run("pattern.requestResize") },
        ]}
      />
      <button type="button" className={cx(btn, checksOpen && ui.on)} title={t("header.checkTitle")} onClick={() => run("checks.toggle")}>{t("header.check")}</button>
      <ViewSwitch />
      <Dropdown
        label={t("header.export")}
        items={[
          { label: t("exportMenu.pngBoth"), onClick: () => run("file.export", "png-both") },
          { label: t("exportMenu.pngSymbols"), onClick: () => run("file.export", "png-symbols") },
          { label: t("exportMenu.pngColor"), onClick: () => run("file.export", "png-color") },
          { label: t("exportMenu.csv"), onClick: () => run("file.export", "csv") },
          { label: t("exportMenu.oxs"), onClick: () => run("file.export", "oxs") },
          { label: t("exportMenu.json"), onClick: () => run("file.export", "json") },
          { label: t("exportMenu.load"), onClick: () => run("file.pickToLoad") },
        ]}
      />
      <LanguageSwitch />
    </header>
  );
}
