"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cx, Modal, ui } from "../common/widgets";
import { authClient } from "./authClient";
import s from "./account.module.css";

/** Sign in: Google, or a code sent by email (the first sign-in makes the account). */
export function SignInDialog({ onClose, onSignedIn }: { onClose: () => void; onSignedIn?: (email: string) => void }) {
  const t = useTranslations("account");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (e) return setError(e.message || t("sendFailed"));
    setSent(true);
  };
  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (e) return setError(e.message || t("codeFailed"));
    onSignedIn?.(email.trim());
    onClose();
  };
  const google = async () => {
    setError(null);
    const { error: e } = await authClient.signIn.social({ provider: "google", callbackURL: window.location.href });
    if (e) setError(e.message || t("googleFailed"));
  };

  return (
    <Modal title={t("title")} onClose={onClose} buttons={[{ label: t("cancel") }]}>
      <p className={ui.hint}>{t("why")}</p>
      <button type="button" className={cx(ui.btn, s.google)} data-testid="sign-in-google" onClick={() => void google()}>{t("google")}</button>
      <div className={s.or}><span>{t("or")}</span></div>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); void (sent ? signIn() : sendCode()); }}>
        <label className={ui.field}>
          {t("email")}
          <input type="email" autoComplete="email" required autoFocus value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} data-testid="sign-in-email" />
        </label>
        {sent && (
          <label className={ui.field}>
            {t("code")}
            <input inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} data-testid="sign-in-code" />
            <span className={ui.hint}>{t("codeSent", { email: email.trim() })}</span>
          </label>
        )}
        {error && <p className={ui.warn} role="alert">{error}</p>}
        <button type="submit" className={cx(ui.btn, ui.primary)} disabled={busy} data-testid="sign-in-submit">{sent ? t("signInWithCode") : t("sendCode")}</button>
        {sent && <button type="button" className={cx(ui.btn, ui.ghost, ui.sm)} onClick={() => { setSent(false); setCode(""); }}>{t("otherEmail")}</button>}
      </form>
    </Modal>
  );
}
