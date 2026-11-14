"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Dropdown, cx, ui, type MenuItem } from "../common/widgets";
import { Icon } from "../common/Icon";
import { LanguageSwitch } from "./LanguageSwitch";
import { ToolBar } from "./ToolBar";
import { useCommand, useEditorState } from "../hooks/editor";
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

/** True when the header's items don't fit on one row; the toolbar then gets a row of its own. */
function useStacked(bar: RefObject<HTMLElement | null>) {
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const el = bar.current!;
    const measure = () => {
      const items = [...el.children] as HTMLElement[];
      // the toolbar's own width, not its (full-width) slot
      const widths = items.map((c) => (c.dataset.slot === "tools" ? (c.firstElementChild as HTMLElement).offsetWidth : c.dataset.slot === "spacer" ? 0 : c.offsetWidth));
      const style = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setStacked(widths.reduce((a, b) => a + b, 0) + parseFloat(style.columnGap) * (items.length - 1) > room);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [bar]);
  return stacked;
}

function PanelToggle() {
  const t = useTranslations("header");
  const run = useCommand();
  const open = useEditorState((st) => !st.panelCollapsed);
  const label = open ? t("hidePanel") : t("showPanel");
  return (
    <button type="button" className={cx(ui.tool, open && ui.on)} title={label} aria-label={label} aria-pressed={open} data-testid="panel-toggle" onClick={() => run("panel.toggle")}>
      <Icon name="panel" size={18} />
    </button>
  );
}

export function Header() {
  const t = useTranslations();
  const run = useCommand();
  const btn = cx(ui.btn, ui.ghost);
  const bar = useRef<HTMLElement>(null);
  const stacked = useStacked(bar);
  return (
    <header ref={bar} className={cx(s.bar, stacked && s.stacked)}>
      <div className={s.brand}>
        {/* app/icon.png, served by Next as the favicon too */}
        <Image src="/icon.png" alt="" width={28} height={28} unoptimized priority />
        <span className={s.brandText}>{t("app.brand")}</span>
      </div>
      <PatternName />
      <FileMenu />
      <div className={s.spacer} data-slot="spacer" />
      <div className={s.toolSlot} data-slot="tools">
        <ToolBar />
      </div>
      <div className={s.spacer} data-slot="spacer" />
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
      <LanguageSwitch />
      <PanelToggle />
    </header>
  );
}
