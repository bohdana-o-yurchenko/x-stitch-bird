"use client";

import type { PkReport } from "@/core/formats/pdf/patternKeeper";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { parseCellRef } from "@/core/grid/numbering";
import { symbolText } from "@/core/symbols/lineStyles";
import { mirrorTargetHasContent, type MirrorFromCentre } from "@/core/transform/wholeChart";
import { stopAskingLargePhoto } from "@/editor/images/largePhoto";
import type { SamePatternChoice } from "@/editor/store/editorStore";
import { copyText, isPdfFile } from "@/platform/files";
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
  // a PDF is a reference only (SPEC §15.41): there's no picture to turn into a pattern
  const pdf = isPdfFile(file);
  return (
    <Modal title={t("dropChoiceTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("openAsReference"), onClick: () => run("reference.open", file) }, { label: t("putBehind"), primary: pdf, onClick: () => run("underlay.open", file) }, ...(pdf ? [] : [{ label: t("turnIntoPattern"), primary: true, onClick: () => run("image.open", file) }])]}>
      <p className={ui.hint}>“{file.name}”</p>
    </Modal>
  );
}

const mb = (bytes: number) => Math.max(1, Math.ceil(bytes / 1048576));

/** Signed in, a photo that doesn't fit in the account's room for photos (SPEC §15.35): what to remove first. */
export function PhotoRoomDialog({ used, max, size, onClose }: Close & { used: number; max: number; size: number }) {
  const t = useTranslations("dialogs");
  return (
    <Modal title={t("photoRoomTitle")} onClose={onClose} buttons={[{ label: t("ok"), primary: true }]}>
      <p className={ui.hint} data-testid="photo-room">{t("photoRoomBody", { used: mb(used), max: mb(max), size: mb(size) })}</p>
    </Modal>
  );
}

/** A very large photo (SPEC §15.33): kept at full quality, after a word that the app may pause with it. */
export function LargePhotoDialog({ w, h, answer, onClose }: Close & { w: number; h: number; answer: (use: boolean) => void }) {
  const t = useTranslations("dialogs");
  const [noAsk, setNoAsk] = useState(false);
  // closing any other way (Esc, outside, Cancel) is a no
  const close = () => {
    answer(false);
    onClose();
  };
  const use = () => {
    if (noAsk) stopAskingLargePhoto();
    answer(true);
    onClose();
    return false;
  };
  return (
    <Modal title={t("largePhotoTitle")} onClose={close} buttons={[{ label: t("cancel") }, { label: t("largePhotoUse"), primary: true, onClick: use }]}>
      <p className={ui.hint}>{t("largePhotoBody", { w, h, mp: Math.round((w * h) / 1e6) })}</p>
      <label className={ui.chk} data-testid="large-photo-no-ask"><input type="checkbox" checked={noAsk} onChange={(e) => setNoAsk(e.target.checked)} />{t("largePhotoNoAsk")}</label>
    </Modal>
  );
}

/** A .xbird of a pattern one already has (SPEC §15.43): replace one's own (kept in Versions), add as new, or not. */
export function SamePatternDialog({ name, age, answer, onClose }: Close & { name: string; age: "older" | "newer" | "other"; answer: (choice: SamePatternChoice) => void }) {
  const t = useTranslations("dialogs");
  // closing any other way (Esc, outside, Cancel) loads nothing
  const close = () => {
    answer(null);
    onClose();
  };
  const choose = (choice: SamePatternChoice) => () => {
    answer(choice);
    onClose();
    return false;
  };
  return (
    <Modal title={t("samePatternTitle")} onClose={close} buttons={[{ label: t("cancel") }, { label: t("samePatternReplace"), onClick: choose({ kind: "replace" }) }, { label: t("samePatternNew"), primary: true, onClick: choose({ kind: "new", name: t("samePatternNewName", { name }) }) }]}>
      <p className={ui.hint} data-testid="same-pattern">{t(`samePattern_${age}`, { name })}</p>
      <p className={ui.hint}>{t("samePatternKept")}</p>
    </Modal>
  );
}

/**
 * Before a work file or an .oxs is saved (SPEC §15.45): which is which — the two are easy to mix up — and where the
 * files to print or stitch from are. `prefer`: the one asked for, the main button.
 */
export function FileChoiceDialog({ prefer, onClose }: Close & { prefer: "xbird" | "oxs" }) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const b = (c: ReactNode) => <b>{c}</b>;
  const save = (format: "pattern" | "oxs") => () => {
    // closed first: saving may ask something of its own (copying the text where downloads are blocked)
    onClose();
    void run("file.export", format);
    return false as const;
  };
  const xbird = { label: t("fileChoiceXbird"), primary: prefer === "xbird", onClick: save("pattern") };
  const oxs = { label: t("fileChoiceOxs"), primary: prefer === "oxs", onClick: save("oxs") };
  return (
    <Modal title={t("fileChoiceTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, ...(prefer === "xbird" ? [oxs, xbird] : [xbird, oxs])]}>
      <div data-testid="file-choice">
        <p>{t.rich("fileChoiceXbirdText", { b })}</p>
        <p>{t.rich("fileChoiceOxsText", { b })}</p>
        <p className={ui.hint}>{t.rich("fileChoicePrint", { b })}</p>
      </div>
    </Modal>
  );
}

/** New ▸ From a PDF chart…: what this is — reading the pattern itself, not a reference to trace — before the PDF is picked. */
export function PdfPatternIntroDialog({ onClose }: Close) {
  const run = useCommand();
  return <PdfPatternIntro onClose={onClose} onPick={() => run("file.pickPdfPattern")} />;
}

/** The same, on the patterns page: the PDF picked there. */
export function PdfPatternIntro({ onClose, onPick }: Close & { onPick: () => void }) {
  const t = useTranslations("dialogs");
  const b = (c: ReactNode) => <b>{c}</b>;
  const pick = () => {
    onClose();
    onPick();
    return false as const;
  };
  return (
    <Modal title={t("pdfPatternTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("pdfPatternPick"), primary: true, onClick: pick }]}>
      <div data-testid="pdf-pattern-intro">
        <p>{t.rich("pdfPatternWhat", { b })}</p>
        <p>{t.rich("pdfPatternWhich", { b })}</p>
        <p className={ui.hint}>{t.rich("pdfPatternElse", { b })}</p>
      </div>
    </Modal>
  );
}

/** No pattern could be read from the PDF: the way to trace it instead. */
export function PdfUnreadableDialog({ name, onClose }: Close & { name: string }) {
  const t = useTranslations("dialogs");
  const b = (c: ReactNode) => <b>{c}</b>;
  return (
    <Modal title={t("pdfUnreadableTitle")} onClose={onClose} buttons={[{ label: t("close"), primary: true }]}>
      <div data-testid="pdf-unreadable">
        <p>{t("pdfUnreadableWhy", { name })}</p>
        <p>{t.rich("pdfPatternElse", { b })}</p>
      </div>
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
