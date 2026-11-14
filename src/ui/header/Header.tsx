"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { ChartView } from "@/render/chart";
import { Dropdown, cx, ui, type MenuItem } from "../common/widgets";
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

function FileMenu() {
  const t = useTranslations("fileMenu");
  const run = useCommand();
  const go = (command: string, args?: unknown) => () => void run(command, args);
  const items: MenuItem[] = [
    { label: t("new"), items: [
      { label: t("newBlank"), hint: t("newBlankHint"), onClick: go("file.new") },
      { label: t("newFromImage"), hint: t("newFromImageHint"), onClick: go("image.pick") },
    ] },
    { label: t("open"), hint: t("openHint"), onClick: go("file.open") },
    { label: t("loadFile"), hint: t("loadFileHint"), onClick: go("file.pickToLoad") },
    { label: t("versions"), hint: t("versionsHint"), onClick: go("file.versions") },
    "-",
    { label: t("save"), hint: t("saveHint"), onClick: go("file.save") },
    { label: t("download"), hint: t("downloadHint"), onClick: go("file.export", "json") },
    { label: t("export"), items: [
      { label: t("pngBoth"), onClick: go("file.export", "png-both") },
      { label: t("pngSymbols"), onClick: go("file.export", "png-symbols") },
      { label: t("pngColor"), onClick: go("file.export", "png-color") },
      "-",
      { label: t("oxs"), hint: t("oxsHint"), onClick: go("file.export", "oxs") },
      { label: t("csv"), onClick: go("file.export", "csv") },
    ] },
    "-",
    { label: t("references"), items: [
      { label: t("refWindow"), hint: t("refWindowHint"), onClick: go("reference.pick") },
      { label: t("refUnderlay"), hint: t("refUnderlayHint"), onClick: go("underlay.pick") },
    ] },
    "-",
    { label: t("info"), hint: t("infoHint"), onClick: go("pattern.editInfo") },
  ];
  return <Dropdown className={cx(ui.btn, ui.ghost)} label={t("label")} items={items} />;
}

export function Header() {
  const t = useTranslations();
  const run = useCommand();
  const btn = cx(ui.btn, ui.ghost);
  return (
    <header className={s.bar}>
      <div className={s.brand}>
        <Icon name="brand" size={24} />
        <span className={s.brandText}>{t("app.brand")}</span>
      </div>
      <PatternName />
      <FileMenu />
      <button type="button" className={btn} title={t("header.saveTitle")} onClick={() => run("file.save")}>{t("header.save")}</button>
      <div className={s.spacer} />
      <Dropdown
        className={btn}
        label={t("header.transform")}
        items={[
          ...(["flipH", "flipV", "rot90cw", "rot90ccw", "rot180"] as const).map((id) => ({ label: t(`transformMenu.${id}`), onClick: () => run("transform.apply", id) })),
          "-",
          { label: t("transformMenu.mirrorFromCentre"), onClick: () => run("transform.requestMirror") },
          "-",
          { label: t("transformMenu.cropToContent"), onClick: () => run("transform.crop") },
          { label: t("transformMenu.extendCanvas"), onClick: () => run("transform.requestExtend") },
          { label: t("transformMenu.resize"), onClick: () => run("pattern.requestResize") },
        ]}
      />
      {/* Chart checks are being redesigned (SPEC §15.4); the button stays as the placeholder */}
      <button type="button" className={btn} disabled title={t("header.checkSoon")}>{t("header.check")}</button>
      <ViewSwitch />
      <LanguageSwitch />
    </header>
  );
}
