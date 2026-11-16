"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cx, Dropdown, Modal, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import { authClient } from "./authClient";
import s from "./account.module.css";

/**
 * The account, in the header (SPEC §15.23): "Sign in" opens the sign-in dialog — Google, or a code sent by email
 * (the first sign-in makes the account). Signed in: the email, and Sign out. Signing in and out tells the editor,
 * so saved patterns also go to the account.
 */
export function AccountButton() {
  const t = useTranslations("account");
  const ed = useEditor();
  const { data: session, isPending } = authClient.useSession();
  const user = useEditorState((st) => st.account);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isPending) return;
    const u = session?.user;
    ed.setAccount(u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) } : null);
  }, [ed, session, isPending]);

  if (isPending) return null;
  if (!user)
    return (
      <>
        <button type="button" className={cx(ui.btn, ui.ghost)} data-testid="sign-in" onClick={() => setOpen(true)}>{t("signIn")}</button>
        {open && <SignInDialog onClose={() => setOpen(false)} />}
      </>
    );
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() ?? "?";
  return (
    <span data-testid="account">
      <Dropdown
        className={s.avatarBtn}
        label={<span className={s.avatar} title={user.email} aria-label={t("menu", { email: user.email })}>{initial}</span>}
        items={[
          { label: user.email, hint: t("signedInHint"), onClick: () => {} },
          "-",
          { label: t("signOut"), onClick: async () => { await authClient.signOut(); ed.setAccount(null); ed.toast("account.signedOut"); } },
        ]}
      />
    </span>
  );
}

function SignInDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("account");
  const ed = useEditor();
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
    ed.toast("account.signedIn", { email: email.trim() });
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
