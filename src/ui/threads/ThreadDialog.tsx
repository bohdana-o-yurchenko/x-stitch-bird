"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import type { ThreadFields } from "./ThreadForm";
import s from "./threadDialog.module.css";

const HEX = /^#?[0-9a-f]{6}$/i;
const asHex = (v: string) => `#${v.replace("#", "").toUpperCase()}`;

/**
 * Add or change one of your own threads / beads on the Threads and Beads pages: the usual form dialog — a title with
 * ✕, labelled fields (required ones starred, errors under the field), the destructive action on the left of the
 * footer, Cancel and the main action on the right. Enter saves, Esc closes.
 *
 * Not the editor's own thread form (`ThreadForm`, in the key picker) — that one is a different thing.
 * Fields are rows of the form body, so more can be added there later.
 */
export function ThreadDialog({ kind, brands, initial, editing, onSave, onDelete, onDuplicate, onClose }: {
  kind: "thread" | "bead";
  brands: readonly string[];
  initial: ThreadFields;
  /** Changing an existing one (Save, Delete…) rather than adding (Add). */
  editing: boolean;
  onSave: (f: ThreadFields) => void | Promise<void>;
  onDelete?: () => void;
  /** A new one like this: the same brand, name and colour, a code of its own. */
  onDuplicate?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("threadsPage");
  const f = useTranslations("threadForm");
  const id = useId();
  const [v, set] = useState(initial);
  const [hex, setHex] = useState(initial.hex);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const listId = `${id}-brands`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => first.current?.focus(), []);

  const errors = {
    brand: v.brand.trim() ? null : f("needBrand"),
    code: v.code.trim() ? null : f("needCode"),
    hex: HEX.test(hex) ? null : t("needColour"),
  };
  const submit = async () => {
    setTried(true);
    if (errors.brand || errors.code || errors.hex) return;
    setBusy(true);
    await onSave({ brand: v.brand.trim(), code: v.code.trim(), name: v.name.trim(), hex: asHex(hex) });
    setBusy(false);
  };
  const shown = HEX.test(hex) ? asHex(hex) : v.hex;
  const title = editing ? t("editTitle") : t(kind === "bead" ? "newBead" : "newThread");
  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);

  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        data-testid="thread-dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className={s.head}>
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className={s.close} onClick={onClose} aria-label={t("close")} title={t("close")}>✕</button>
        </header>

        <div className={s.body}>
          <div className={s.field}>
            <label htmlFor={`${id}-brand`}>{f("brand")}<i aria-hidden="true">*</i></label>
            <input
              id={`${id}-brand`}
              className={cx(ui.input, s.input)}
              list={listId}
              required
              aria-required="true"
              aria-invalid={!!err("brand")}
              placeholder={f(kind === "bead" ? "brandBeadExample" : "brandExample")}
              autoComplete="off"
              value={v.brand}
              onChange={(e) => set({ ...v, brand: e.target.value })}
            />
            <datalist id={listId}>{brands.map((b) => <option key={b} value={b} />)}</datalist>
            {err("brand") ? <p className={s.error} role="alert">{err("brand")}</p> : <p className={s.help}>{t("brandHelp")}</p>}
          </div>

          <div className={s.pair}>
            <div className={s.field}>
              <label htmlFor={`${id}-code`}>{f("code")}<i aria-hidden="true">*</i></label>
              <input
                id={`${id}-code`}
                ref={first}
                className={cx(ui.input, s.input)}
                required
                aria-required="true"
                aria-invalid={!!err("code")}
                autoComplete="off"
                value={v.code}
                onChange={(e) => set({ ...v, code: e.target.value })}
              />
              {err("code") && <p className={s.error} role="alert">{err("code")}</p>}
            </div>
            <div className={s.field}>
              <label htmlFor={`${id}-hex`}>{f("colour")}<i aria-hidden="true">*</i></label>
              <div className={s.colour}>
                <label className={cx(s.chip, kind === "bead" && s.round)} style={{ background: shown }} title={f("colour")}>
                  <input
                    type="color"
                    aria-label={f("colour")}
                    value={HEX.test(hex) ? asHex(hex).toLowerCase() : "#000000"}
                    onChange={(e) => setHex(e.target.value.toUpperCase())}
                  />
                </label>
                <input
                  id={`${id}-hex`}
                  className={cx(ui.input, s.input, s.hex)}
                  aria-invalid={!!err("hex")}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  onBlur={() => HEX.test(hex) && setHex(asHex(hex))}
                />
              </div>
              {err("hex") && <p className={s.error} role="alert">{err("hex")}</p>}
            </div>
          </div>

          <div className={s.field}>
            <label htmlFor={`${id}-name`}>{f("name")}<span>{f("optional")}</span></label>
            <input id={`${id}-name`} className={cx(ui.input, s.input)} autoComplete="off" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} />
          </div>
        </div>

        <footer className={s.foot}>
          {editing && onDelete && (
            <button type="button" className={cx(ui.btn, ui.deleteText, s.delete)} onClick={onDelete}>{t("delete")}</button>
          )}
          {editing && onDuplicate && <button type="button" className={ui.btn} onClick={onDuplicate} data-testid="thread-duplicate">{t("duplicate")}</button>}
          <span className={s.spacer} />
          <button type="button" className={ui.btn} onClick={onClose}>{t("cancel")}</button>
          <button type="submit" className={cx(ui.btn, ui.primary)} disabled={busy}>{editing ? t("save") : t("add")}</button>
        </footer>
      </form>
    </div>
  );
}
