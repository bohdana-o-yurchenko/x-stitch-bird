"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import common from "../common/common.module.css";
import { authClient } from "./authClient";
import s from "./account.module.css";

/** Digits in the emailed code (Better Auth's default). */
const CODE_LENGTH = 6;
/** Seconds before another code can be asked for. */
const RESEND_AFTER = 30;

/**
 * Sign in (SPEC §15.23, §15.39) the way most apps do it: one column, the main action right under its field, full
 * width; no buttons at the bottom — ✕ (or Esc, or a click outside) closes. Step 1: Continue with Google, or an email
 * and Continue with email. Step 2: the code from the email — it signs in by itself once all its digits are in; the
 * email can be changed, a new code asked for after a while. The first sign-in makes the account.
 */
export function SignInDialog({ onClose, onSignedIn }: { onClose: () => void; onSignedIn?: (email: string) => void }) {
  const t = useTranslations("account");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  // the resend countdown
  useEffect(() => {
    if (!wait) return;
    const id = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  /** A request to the sign-in service: its error message, or null. A thrown error counts too — never stuck busy. */
  const attempt = async (run: () => Promise<{ error?: { message?: string } | null }>, fallback: string): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await run();
      return e ? e.message || fallback : null;
    } catch (e) {
      return (e as { message?: string })?.message || fallback;
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const e = await attempt(() => authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" }), t("sendFailed"));
    if (e) return setError(e);
    setSent(true);
    setCode("");
    setWait(RESEND_AFTER);
    setTimeout(() => codeInput.current?.focus(), 0);
  };
  const signIn = async (otp = code) => {
    if (busy) return;
    const e = await attempt(() => authClient.signIn.emailOtp({ email: email.trim(), otp: otp.trim() }), t("codeFailed"));
    if (e) {
      setError(e);
      setCode("");
      codeInput.current?.focus();
      return;
    }
    onSignedIn?.(email.trim());
    onClose();
  };
  const google = async () => {
    const e = await attempt(() => authClient.signIn.social({ provider: "google", callbackURL: window.location.href }), t("googleFailed"));
    if (e) setError(e);
  };
  const typeCode = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    // all digits in (typed or pasted): straight in
    if (digits.length === CODE_LENGTH) void signIn(digits);
  };

  return (
    <div className={common.backdrop} onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className={cx(common.modal, s.signIn)} role="dialog" aria-modal="true" aria-label={t("title")} data-testid="sign-in-dialog">
        <button type="button" className={s.close} aria-label={t("close")} title={t("close")} onClick={onClose} disabled={busy}>✕</button>
        <div className={s.signInHead}>
          <Image src="/icon.svg" alt="" width={44} height={44} unoptimized />
          <h2>{sent ? t("checkEmail") : t("title")}</h2>
          <p className={ui.hint}>{sent ? t.rich("codeSent", { email: email.trim(), b: (c) => <b>{c}</b> }) : t("why")}</p>
        </div>
        {!sent ? (
          <>
            <button type="button" className={cx(ui.btn, s.wide, s.google)} data-testid="sign-in-google" onClick={() => void google()}>
              <GoogleMark />
              {t("google")}
            </button>
            <div className={s.or}><span>{t("or")}</span></div>
            <form className={s.form} onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
              <label className={ui.field}>
                {t("email")}
                <input type="email" autoComplete="email" required autoFocus placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="sign-in-email" />
              </label>
              {error && <p className={s.error} role="alert">{error}</p>}
              <button type="submit" className={cx(ui.btn, ui.primary, s.wide)} disabled={busy || !email.trim()} data-testid="sign-in-submit">{busy ? t("sending") : t("sendCode")}</button>
            </form>
          </>
        ) : (
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
            <label className={ui.field}>
              {t("code")}
              <input ref={codeInput} className={s.code} inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={CODE_LENGTH} placeholder={"•".repeat(CODE_LENGTH)} value={code} onChange={(e) => typeCode(e.target.value)} data-testid="sign-in-code" />
            </label>
            {error && <p className={s.error} role="alert">{error}</p>}
            <button type="submit" className={cx(ui.btn, ui.primary, s.wide)} disabled={busy || code.length < CODE_LENGTH} data-testid="sign-in-code-submit">{busy ? t("signingIn") : t("signInWithCode")}</button>
            <div className={s.codeLinks}>
              <button type="button" className={s.textBtn} onClick={() => { setSent(false); setCode(""); setError(null); }}>{t("otherEmail")}</button>
              <button type="button" className={s.textBtn} disabled={wait > 0 || busy} onClick={() => void sendCode()}>{wait ? t("resendIn", { s: wait }) : t("resend")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Google's "G", in its colours (as sign-in buttons show it). */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
