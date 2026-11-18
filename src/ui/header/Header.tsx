"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Dropdown, cx, ui, type MenuItem } from "../common/widgets";
import { Icon } from "../common/Icon";
import { LanguageSwitch } from "./LanguageSwitch";
import { APP_VERSION } from "../dialogs/ChangelogDialog";
import { ShortcutsPanel } from "./ShortcutsInfo";
import { AccountButton } from "../account/AccountButton";
import { ToolBar } from "./ToolBar";
import type { HeaderMenu } from "@/editor/store/editorStore";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";
import { savedToolbarHide, setToolbarHide } from "./toolbarPrefs";
import { SOURCE_URL } from "../common/source";
import { AppBrand } from "../common/AppBrand";
import appBar from "../common/appBar.module.css";
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

/** "Glory to Ukraine" at the bottom of ☰: just words, not a command. The flag is drawn (Windows has no flag emoji). */
function Glory() {
  const t = useTranslations("app");
  return (
    <div className={s.glory} data-testid="glory">
      {t("glory")}
      <span className={s.flag} aria-hidden />
    </div>
  );
}

/** ☰ ▸ Toolbar: hide the groups this person never uses. */
function ToolbarOptions() {
  const t = useTranslations("fileMenu");
  const ed = useEditor();
  const hide = useEditorState((st) => st.toolbarHide);
  const row = (k: keyof typeof hide, label: string) => (
    <label className={s.optionRow}>
      <input type="checkbox" checked={hide[k]} onChange={(e) => setToolbarHide(ed, { ...hide, [k]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <div className={s.options} data-testid="toolbar-options">
      <span>{t("toolbar")}</span>
      {row("shapes", t("hideShapes"))}
      {row("partials", t("hidePartials"))}
    </div>
  );
}

/** The guide holding this menu open, if it does. */
function useReveal(menu: HeaderMenu) {
  return useEditorState((st) => (st.menuReveal?.menu === menu ? st.menuReveal.path : null));
}

/** Pattern ▾ — the pattern as a file: new, open, the work file. Its state lives in the side panel. */
function PatternMenu() {
  const t = useTranslations("fileMenu");
  const run = useCommand();
  const go = (command: string, args?: unknown) => () => void run(command, args);
  const reveal = useReveal("pattern");
  const ed = useEditor();
  const router = useRouter();
  const signedIn = useEditorState((st) => !!st.account);
  // Open: the patterns page (SPEC §15.36) — changes so far go to the library first
  const openPatterns = () => {
    ed.flush();
    router.push("/patterns");
  };
  // signed out there is one pattern, the open one (SPEC §15.37): Open… is for the account's
  const canOpen = signedIn;
  const items: MenuItem[] = [
    { id: "new", label: t("new"), items: [
      { id: "newBlank", label: t("newBlank"), hint: t("newBlankHint"), onClick: go("file.new") },
      { label: t("newFromImage"), hint: t("newFromImageHint"), onClick: go("image.pick") },
    ] },
    ...(canOpen ? [{ id: "open", label: t("open"), hint: t(signedIn ? "openHintAccount" : "openHint"), onClick: openPatterns }] : []),
    "-",
    { id: "download", label: t("download"), hint: t("downloadHint"), onClick: go("file.export", "pattern") },
    { id: "loadFile", label: t("loadFile"), hint: t("loadFileHint"), onClick: go("file.pickToLoad") },
  ];
  return (
    <span data-guide="menu">
      <Dropdown className={cx(ui.btn, ui.ghost)} label={t("label")} items={items} reveal={reveal} />
    </span>
  );
}

/** 🖨 Print & share — the finished chart, to stitch from or for other apps. */
function PrintMenu() {
  const t = useTranslations("fileMenu");
  const run = useCommand();
  const go = (command: string, args?: unknown) => () => void run(command, args);
  const reveal = useReveal("print");
  const items: MenuItem[] = [
    { id: "pdfChart", label: t("pdfChart"), hint: t("pdfChartHint"), onClick: go("file.exportChartPdf") },
    { id: "pdfPk", label: t("pdfPk"), hint: t("pdfPkHint"), onClick: go("file.exportPatternKeeper") },
    "-",
    { id: "pngCharts", label: t("pngCharts"), items: [
      { label: t("pngBoth"), onClick: go("file.export", "png-both") },
      { label: t("pngSymbols"), onClick: go("file.export", "png-symbols") },
      { label: t("pngSymbolsInk"), hint: t("pngSymbolsInkHint"), onClick: go("file.export", "png-symbols-ink") },
    ] },
    { id: "pngPreviews", label: t("pngPreviews"), items: [
      { label: t("pngColor"), onClick: go("file.export", "png-color") },
      { label: t("pngStitched"), onClick: go("file.export", "png-stitched") },
    ] },
    "-",
    { id: "csv", label: t("csv"), onClick: go("file.export", "csv") },
    { id: "oxs", label: t("oxs"), hint: t("oxsHint"), onClick: go("file.export", "oxs") },
  ];
  return (
    <span data-guide="print-menu">
      <Dropdown className={ui.tool} title={t("print")} label={<Icon name="print" size={18} />} items={items} reveal={reveal} />
    </span>
  );
}

/** ☰ — what isn't needed while stitching: help, shortcuts, language, theme, privacy. */
function AppMenu() {
  const t = useTranslations("fileMenu");
  const run = useCommand();
  const ed = useEditor();
  const go = (command: string, args?: unknown) => () => void run(command, args);
  const reveal = useReveal("app");
  const locale = useLocale();
  const items: MenuItem[] = [
    { label: t("guide"), hint: t("guideHint"), onClick: go("help.guide") },
    { id: "shortcuts", label: t("shortcuts"), onClick: () => ed.store.setState({ shortcutsOpen: true }) },
    { id: "changelog", label: t("changelog"), hint: t("changelogHint", { version: APP_VERSION }), onClick: go("help.changelog") },
    "-",
    { id: "language", node: <LanguageSwitch before={() => ed.flush()} /> },
    { id: "theme", node: <ThemeSwitcher /> },
    { id: "toolbar", node: <ToolbarOptions /> },
    "-",
    { id: "privacy", label: t("privacy"), onClick: () => void window.open(`/${locale}/privacy`, "_blank", "noopener") },
    { id: "source", label: t("source"), hint: t("sourceHint"), onClick: () => void window.open(SOURCE_URL, "_blank", "noopener") },
    "-",
    { id: "glory", node: <Glory /> },
  ];
  return (
    <span data-guide="app-menu">
      <Dropdown className={ui.tool} title={t("more")} label={<Icon name="menu" size={18} />} items={items} reveal={reveal} />
    </span>
  );
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
  const ed = useEditor();
  useEffect(() => ed.store.setState({ toolbarHide: savedToolbarHide() }), [ed]);
  const t = useTranslations();
  const run = useCommand();
  const btn = cx(ui.btn, ui.ghost);
  const bar = useRef<HTMLElement>(null);
  const stacked = useStacked(bar);
  const signedIn = useEditorState((st) => !!st.account);
  return (
    <header ref={bar} className={cx(appBar.bar, s.bar, stacked && s.stacked)}>
      {/* signed in, the logo leads to the main page, My patterns (the open pattern is saved first); signed out it's
          just the logo — there is only the editor (SPEC §15.39) */}
      <AppBrand compact link={signedIn} title={t("home.title")} testId="to-home" onClick={() => ed.flush()} />
      <PatternMenu />
      <PatternName />
      <div className={s.spacer} data-slot="spacer" />
      <div className={s.toolSlot} data-slot="tools">
        <div className={s.toolGroup}>
          <ToolBar />
          <span className={s.sep} />
          <Dropdown
            className={btn}
            label={t("header.transform")}
            items={[
              ...(["flipH", "flipV", "rot90cw", "rot90ccw", "rot180"] as const).map((id) => ({ label: t(`transformMenu.${id}`), onClick: () => run("transform.apply", id) })),
              "-",
              { label: t("transformMenu.mirrorFromCentre"), onClick: () => run("transform.requestMirror") },
            ]}
          />
        </div>
      </div>
      <div className={s.spacer} data-slot="spacer" />
      <PrintMenu />
      <AppMenu />
      <AccountButton />
      <PanelToggle />
      <ShortcutsPanel />
    </header>
  );
}
