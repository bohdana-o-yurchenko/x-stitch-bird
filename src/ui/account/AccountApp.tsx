"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { accountUsage, createLibrary, type AccountUsage } from "@/editor/library";
import { Link, useRouter } from "@/i18n/navigation";
import { Modal, cx, ui } from "../common/widgets";
import { HomeFooter, HomeHeader } from "../home/HomeHeader";
import { PageLoading } from "../common/AppBrand";
import { authClient } from "./authClient";
import { useSignedInOnly } from "./useSignedInOnly";
import home from "../home/home.module.css";
import s from "./accountPage.module.css";

/** The page's sections, in the side navigation (more to come: preferences, profile…). */
const SECTIONS = ["account"] as const;

/**
 * The account page (SPEC §15.38), like most apps' settings: sections in a navigation on the left, the chosen one on
 * the right. For now one section, Account: who is signed in, and deleting the account (asked first, the email typed
 * to confirm).
 */
export default function AccountApp() {
  const t = useTranslations("accountPage");
  const locale = useLocale();
  const router = useRouter();
  const lib = useMemo(() => createLibrary(), []);
  const [deleted, setDeleted] = useState(false);
  // signed out there is only the editor (SPEC §15.39) — except right after deleting the account, to say so
  const { user: u, isPending, offline, allowed } = useSignedInOnly(deleted);
  const user = u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [signInOpen, setSignInOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const signedIn = !!u;
  useEffect(() => lib.setSignedIn(signedIn), [lib, signedIn]);
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  useEffect(() => {
    if (signedIn && !offline) void accountUsage().then(setUsage);
  }, [signedIn, offline]);
  const since = u?.createdAt ? new Date(u.createdAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) : null;

  if (!allowed && !deleted) return <PageLoading />;
  return (
    <div className={home.page}>
      <HomeHeader section="account" user={user} pending={isPending} offline={offline} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />
      <div className={s.layout}>
        <nav className={s.nav} aria-label={t("nav")}>
          {SECTIONS.map((id) => (
            <Link key={id} href="/account" className={s.navItem} aria-current="page">{t(id)}</Link>
          ))}
        </nav>
        <main className={s.content} data-testid="account-page">
          <h1 className={s.title}>{t("account")}</h1>
          {deleted ? (
            <section className={s.card} data-testid="account-deleted">
              <p>{t("deleted")}</p>
              <Link href="/" className={cx(ui.btn, ui.primary, s.linkBtn)}>{t("toEditor")}</Link>
            </section>
          ) : !user ? null : (
            <>
              <section className={s.card}>
                <h2>{t("signedInAs")}</h2>
                <dl className={s.facts}>
                  <dt>{t("email")}</dt>
                  <dd data-testid="account-email">{user.email}</dd>
                  {user.name && (
                    <>
                      <dt>{t("name")}</dt>
                      <dd>{user.name}</dd>
                    </>
                  )}
                  {since && (
                    <>
                      <dt>{t("since")}</dt>
                      <dd>{since}</dd>
                    </>
                  )}
                </dl>
              </section>
              {offline && <p className={ui.hint} data-testid="account-offline">{t("offline")}</p>}
              {usage && !offline && <UsageCard usage={usage} />}
              <section className={cx(s.card, s.danger)}>
                <h2>{t("deleteTitle")}</h2>
                <p className={ui.hint}>{t("deleteHint")}</p>
                <button type="button" className={cx(ui.btn, ui.dangerBtn, s.dangerBtn)} disabled={offline} onClick={() => setConfirming(true)} data-testid="account-delete">{t("deleteButton")}</button>
              </section>
            </>
          )}
        </main>
      </div>
      <HomeFooter />
      {confirming && user && (
        <DeleteAccountDialog
          email={user.email}
          onDelete={(typed) => lib.deleteAccount(typed)}
          onClose={() => setConfirming(false)}
          onDeleted={() => {
            setConfirming(false);
            setDeleted(true);
            // the session went with the account; the page and its bar learn it
            void authClient.signOut().catch(() => {}).finally(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

/** Deleting the account can't be undone: the user types the account's email to confirm (SPEC §15.38). */
function DeleteAccountDialog({ email, onDelete, onClose, onDeleted }: { email: string; onDelete: (typed: string) => Promise<boolean>; onClose: () => void; onDeleted: () => void }) {
  const t = useTranslations("accountPage");
  const td = useTranslations("dialogs");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();
  const go = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onDelete(typed.trim());
    setBusy(false);
    if (ok) onDeleted();
    else setFailed(true);
    return false as const;
  };
  return (
    <Modal title={t("confirmTitle")} onClose={() => !busy && onClose()} buttons={[{ label: td("cancel"), disabled: busy }, { label: busy ? t("deleting") : t("confirmButton"), danger: true, disabled: !matches || busy, onClick: go }]}>
      <p style={{ marginTop: 0 }}>{t.rich("confirmBody", { email, b: (c) => <b>{c}</b> })}</p>
      <label className={ui.field}>
        {t("confirmLabel")}
        <input className={ui.input} type="email" autoComplete="off" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} data-testid="account-delete-email" />
      </label>
      {failed && <p className={ui.hint} style={{ color: "var(--danger, #b42318)" }} role="alert">{t("failed")}</p>}
    </Modal>
  );
}

const NEARLY_FULL = 0.8;
const mb = (bytes: number) => (bytes ? Math.max(0.1, Math.round(bytes / 104857.6) / 10) : 0);

/**
 * What the account holds against its limits (SPEC §15.38): patterns and photos as bars — amber from 80 %, red when
 * full — and what to do about it: remove photos or patterns, downloading them first as .xbird files to keep them.
 */
function UsageCard({ usage }: { usage: AccountUsage }) {
  const t = useTranslations("accountPage");
  const parts = [
    { id: "patterns", label: t("usagePatterns"), value: usage.patterns, max: usage.maxPatterns, text: t("usageOf", { n: usage.patterns, max: usage.maxPatterns }) },
    { id: "photos", label: t("usagePhotos"), value: usage.photos, max: usage.maxPhotos, text: t("usageOfMb", { n: mb(usage.photos), max: Math.round(usage.maxPhotos / 1048576) }) },
  ];
  const nearlyFull = parts.some((p) => p.value / p.max >= NEARLY_FULL);
  return (
    <section className={s.card} data-testid="account-space">
      <h2>{t("usageTitle")}</h2>
      {parts.map((p) => {
        const share = Math.min(1, p.value / p.max), level = share >= 1 ? "full" : share >= NEARLY_FULL ? "high" : "ok";
        return (
          <div key={p.id} className={s.meter} data-level={level} data-testid={`account-space-${p.id}`}>
            <div className={s.meterHead}>
              <span>{p.label}</span>
              <span className={s.meterValue}>{p.text}</span>
            </div>
            <div className={s.meterTrack} role="progressbar" aria-label={p.label} aria-valuemin={0} aria-valuemax={p.max} aria-valuenow={p.value} aria-valuetext={p.text}>
              <div className={s.meterFill} style={{ width: `${Math.max(share * 100, p.value ? 1.5 : 0)}%` }} />
            </div>
          </div>
        );
      })}
      <p className={cx(ui.hint, nearlyFull && s.meterWarn)} data-testid="account-space-hint">
        {nearlyFull && <b>{t("usageNearlyFull")} </b>}
        {t("usageHint")}
      </p>
    </section>
  );
}
