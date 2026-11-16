"use client";

import type { PkReport } from "@/core/formats/pdf/patternKeeper";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { parseCellRef } from "@/core/grid/numbering";
import { META_FIELDS } from "@/core/pattern/meta";
import { symbolText } from "@/core/symbols/lineStyles";
import type { PatternMeta } from "@/core/pattern/types";
import { mirrorTargetHasContent, type MirrorFromCentre } from "@/core/transform/wholeChart";
import { copyText } from "@/platform/files";
import { TimeSpent } from "../common/TimeSpent";
import { ConfirmDelete, KeyIcon, Modal, cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { useEntryLabel } from "../i18n/labels";

type Close = { onClose: () => void };

/** Deleting a key entry, used or not, names it and says what happens to its stitches. */
export function DeleteEntryDialog({ index, count, onClose }: Close & { index: number; count: number }) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const label = useEntryLabel();
  const slot = useEditorState((st) => st.palette[index]);
  const { title, sub } = label(index);
  return (
    <ConfirmDelete title={t("deleteEntryTitle", { title })} confirm={t("delete")} onConfirm={() => run("key.delete", index)} onClose={onClose}>
      <div className={ui.row} style={{ flexWrap: "nowrap", gap: 12 }}>
        {slot && <KeyIcon slot={slot} size={36} />}
        <div><b>{title}</b><div className={ui.hint}>{sub}</div></div>
      </div>
      <p className={ui.hint}>{count ? t("deleteEntryUsed", { count }) : t("deleteEntryUnused")}</p>
    </ConfirmDelete>
  );
}

export function NewPatternDialog({ onClose }: Close) {
  const signedIn = useEditorState((st) => !!st.account);
  const t = useTranslations("dialogs");
  const tf = useTranslations("fabric");
  const run = useCommand();
  const [o, set] = useState({ name: "Untitled pattern", w: 80, h: 80, count: 14, keepKey: false });
  return (
    <Modal title={t("newTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("create"), primary: true, onClick: () => run("file.create", o) }]}>
      <div className={ui.grid2}>
        <label className={ui.field}>{t("name")}<input value={o.name} onChange={(e) => set({ ...o, name: e.target.value })} /></label>
        <label className={ui.field}>
          {t("fabric")}
          <select value={o.count} onChange={(e) => set({ ...o, count: Number(e.target.value) })}>
            {[11, 14, 16, 18, 20, 24, 31].map((c) => <option key={c} value={c}>{tf(`ct${c}`)}</option>)}
          </select>
        </label>
        <label className={ui.field}>{t("width")}<input type="number" min={5} max={500} value={o.w} onChange={(e) => set({ ...o, w: Number(e.target.value) })} /></label>
        <label className={ui.field}>{t("height")}<input type="number" min={5} max={500} value={o.h} onChange={(e) => set({ ...o, h: Number(e.target.value) })} /></label>
      </div>
      <label className={ui.chk}><input type="checkbox" checked={o.keepKey} onChange={(e) => set({ ...o, keepKey: e.target.checked })} />{t("keepKey")}</label>
      <p className={ui.hint}>{t(signedIn ? "newHint" : "newHintSignedOut")}</p>
    </Modal>
  );
}

export function ResizeDialog({ onClose }: Close) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const p = useEditorState((st) => st.doc);
  const [o, set] = useState({ w: p.w, h: p.h, anchor: "centre" as "centre" | "topLeft" });
  return (
    <Modal title={t("resizeTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("resize"), primary: true, onClick: () => run("pattern.resize", o) }]}>
      <div className={ui.grid2}>
        <label className={ui.field}>{t("width")}<input type="number" min={5} max={500} value={o.w} onChange={(e) => set({ ...o, w: Number(e.target.value) })} /></label>
        <label className={ui.field}>{t("height")}<input type="number" min={5} max={500} value={o.h} onChange={(e) => set({ ...o, h: Number(e.target.value) })} /></label>
        <label className={ui.field}>
          {t("anchor")}
          <select value={o.anchor} onChange={(e) => set({ ...o, anchor: e.target.value as "centre" | "topLeft" })}>
            <option value="centre">{t("anchorCentre")}</option>
            <option value="topLeft">{t("anchorTopLeft")}</option>
          </select>
        </label>
      </div>
      <p className={ui.hint}>{t("resizeHint")}</p>
    </Modal>
  );
}

/** Pattern info (SPEC §15.1): what goes into .oxs first, the rest (kept only in .xbird) folded away. */
export function PatternInfoDialog({ onClose }: Close) {
  const t = useTranslations();
  const run = useCommand();
  const meta = useEditorState((st) => st.doc.meta);
  const docName = useEditorState((st) => st.doc.name);
  const [m, set] = useState<PatternMeta>({ ...meta });
  const [name, setName] = useState(docName);
  const field = (f: (typeof META_FIELDS)[number]) => (
    <label key={f.id} className={ui.field} style={f.multiline ? { gridColumn: "1 / -1" } : undefined}>
      {t(`meta.${f.id}`)}
      {f.multiline ? <textarea value={m[f.id] ?? ""} onChange={(e) => set({ ...m, [f.id]: e.target.value })} /> : <input value={m[f.id] ?? ""} onChange={(e) => set({ ...m, [f.id]: e.target.value })} />}
    </label>
  );
  const own = META_FIELDS.filter((f) => !f.oxs);
  const save = () => {
    if (name.trim() && name !== docName) run("pattern.rename", name);
    run("pattern.setInfo", m);
  };
  return (
    <Modal title={t("dialogs.infoTitle")} wide onClose={onClose} buttons={[{ label: t("dialogs.cancel") }, { label: t("dialogs.ok"), primary: true, onClick: save }]}>
      <TimeSpent />
      <h4 className={ui.sectionTitle}>{t("dialogs.infoOxs")}</h4>
      <p className={ui.hint} style={{ margin: "0 0 10px" }}>{t("dialogs.infoOxsHint")}</p>
      <div className={ui.grid2}>
        <label className={ui.field}>
          {t("header.patternName")}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {META_FIELDS.filter((f) => f.oxs).map(field)}
      </div>
      <details style={{ marginTop: 16 }} open={own.some((f) => !!meta[f.id])}>
        <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0" }}>{t("dialogs.infoOwn")}</summary>
        <p className={ui.hint} style={{ margin: "0 0 10px" }}>{t("dialogs.infoOwnHint")}</p>
        <div className={ui.grid2}>{own.map(field)}</div>
      </details>
    </Modal>
  );
}

export function GoToCellDialog({ onClose }: Close) {
  const t = useTranslations("dialogs");
  const ed = useEditor();
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const go = () => {
    const p = ed.doc, c = parseCellRef(text, p.grid, p);
    if (!c) {
      setError(true);
      return false;
    }
    ed.viewport.centreOn(c.y * p.w + c.x);
  };
  return (
    <Modal title={t("gotoTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("go"), primary: true, onClick: go }]}>
      <input className={ui.input} autoFocus value={text} placeholder="12, 40" onChange={(e) => { setText(e.target.value); setError(false); }} onKeyDown={(e) => { if (e.key === "Enter" && go() !== false) onClose(); }} />
      <p className={ui.hint}>{error ? t("badCell") : t("gotoHint")}</p>
    </Modal>
  );
}

const MIRRORS: [MirrorFromCentre, string][] = [["leftToRight", "mirrorLeftToRight"], ["rightToLeft", "mirrorRightToLeft"], ["topToBottom", "mirrorTopToBottom"], ["bottomToTop", "mirrorBottomToTop"], ["quad", "mirrorQuad"]];

export function MirrorFromCentreDialog({ onClose }: Close) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const ed = useEditor();
  const [dir, setDir] = useState<MirrorFromCentre>("leftToRight");
  return (
    <Modal title={t("mirrorTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("mirror"), primary: true, onClick: () => run("transform.mirror", dir) }]}>
      {MIRRORS.map(([d, k]) => (
        <label key={d} className={ui.chk}><input type="radio" name="mirror" checked={dir === d} onChange={() => setDir(d)} />{t(k)}</label>
      ))}
      {mirrorTargetHasContent(ed.doc, dir) && <div className={ui.warn}>{t("mirrorTargetFull")}</div>}
    </Modal>
  );
}

export function ExtendCanvasDialog({ onClose }: Close) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const [m, set] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  return (
    <Modal title={t("extendTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("extend"), primary: true, onClick: () => run("transform.extend", m) }]}>
      <div className={ui.grid2}>
        {(["left", "right", "top", "bottom"] as const).map((side) => (
          <label key={side} className={ui.field}>{t(side)}<input type="number" min={0} max={200} value={m[side]} onChange={(e) => set({ ...m, [side]: Math.max(0, Number(e.target.value) || 0) })} /></label>
        ))}
      </div>
    </Modal>
  );
}

export function ReplaceKeyDialog({ onClose }: Close) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const key = useEditorState((st) => st.doc.key);
  const active = useEditorState((st) => st.activeEntry);
  const label = useEntryLabel();
  const entries = key.flatMap((e, i) => (e && i ? [i] : []));
  const [from, setFrom] = useState(active || entries[0] || 0);
  const [to, setTo] = useState(entries.find((i) => i !== from) ?? 0);
  const option = (i: number) => <option key={i} value={i}>{`${symbolText(key[i]!.sym)}  ${label(i).title} — ${label(i).sub}`}</option>;
  return (
    <Modal title={t("replaceKeyTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("replace"), primary: true, disabled: !from || !to || from === to, onClick: () => run("selection.replaceKey", { from, to }) }]}>
      <label className={ui.field}>{t("replaceFrom")}<select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{entries.map(option)}</select></label>
      <label className={ui.field}>{t("replaceTo")}<select value={to} onChange={(e) => setTo(Number(e.target.value))}>{entries.map(option)}</select></label>
    </Modal>
  );
}

export function DropChoiceDialog({ file, onClose }: Close & { file: File }) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  return (
    <Modal title={t("dropChoiceTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("openAsReference"), onClick: () => run("reference.open", file) }, { label: t("putBehind"), onClick: () => run("underlay.open", file) }, { label: t("turnIntoPattern"), primary: true, onClick: () => run("image.open", file) }]}>
      <p className={ui.hint}>“{file.name}”</p>
    </Modal>
  );
}

export function TextFallbackDialog({ ext, text, onClose }: Close & { ext: string; text: string }) {
  const t = useTranslations();
  const ed = useEditor();
  return (
    <Modal title={t("dialogs.saveToFileTitle")} onClose={onClose} buttons={[{ label: t("dialogs.copy"), primary: true, onClick: async () => { ed.toast((await copyText(text)) ? "toasts.copied" : "toasts.pressCopy"); return false; } }, { label: t("dialogs.close") }]}>
      <p className={ui.hint}>{t("dialogs.copyFallback", { ext })}</p>
      <textarea readOnly className={cx(ui.input)} style={{ width: "100%", height: 200, font: "12px monospace" }} value={text} />
    </Modal>
  );
}

/** Before a Pattern Keeper PDF: what the app can't track in this pattern, and what the file will hold instead. */
export function PatternKeeperDialog({ issues, onClose }: Close & { issues: PkReport["issues"] }) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  return (
    <Modal title={t("pkTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("pkExport"), primary: true, onClick: () => run("file.exportPatternKeeper", true) }]}>
      <p>{t("pkIntro")}</p>
      <ul data-testid="pk-issues" style={{ margin: "0 0 4px", paddingLeft: 20, lineHeight: 1.6 }}>
        {issues.map((i) => <li key={i.kind}>{t(`pkIssue.${i.kind}`, { count: i.count })}</li>)}
      </ul>
      <p className={ui.hint}>{t("pkTwoCharts")}</p>
    </Modal>
  );
}
