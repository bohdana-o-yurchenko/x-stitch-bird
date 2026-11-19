"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AccountMenu } from "../account/AccountButton";
import { PagesMenu } from "../header/PagesMenu";
import { SOURCE_URL } from "../common/source";
import { AppBrand } from "../common/AppBrand";
import appBar from "../common/appBar.module.css";
import { cx } from "../common/widgets";
import s from "./home.module.css";

type User = { email: string; name?: string } | null;

/** The main pages' bar (SPEC §15.26): logo, the sections as tabs, ☰ (language, theme, help — SPEC §15.49), account — like the editor's. */
export function HomeHeader({ section, user, pending, offline, signInOpen, setSignInOpen, beforeSignOut, onSignedOut }: {
  /** The tab shown as current; the account page has none. */
  section: "patterns" | "threads" | "beads" | "account" | "check";
  user: User;
  pending: boolean;
  /** Signed in, the account out of reach (SPEC §15.53). */
  offline?: boolean;
  signInOpen: boolean;
  setSignInOpen: (on: boolean) => void;
  beforeSignOut?: () => Promise<unknown>;
  onSignedOut?: () => void;
}) {
  const t = useTranslations("home");
  return (
    <header className={cx(appBar.bar, s.top)}>
      <AppBrand />
      <nav className={s.sections} aria-label={t("nav")}>
        <Link href="/patterns" aria-current={section === "patterns" ? "page" : undefined}>{t("patterns")}</Link>
        <Link href="/threads" aria-current={section === "threads" ? "page" : undefined}>{t("threads")}</Link>
        <Link href="/beads" aria-current={section === "beads" ? "page" : undefined}>{t("beads")}</Link>
        <Link href="/check" aria-current={section === "check" ? "page" : undefined}>{t("check")}</Link>
      </nav>
      <span className={s.spacer} />
      <PagesMenu />
      {!pending && <AccountMenu user={user} offline={offline} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={beforeSignOut} onSignedOut={onSignedOut} />}
    </header>
  );
}

/** The main pages' footer: free software, its source, privacy. */
export function HomeFooter() {
  const t = useTranslations("home");
  return (
    <footer className={s.footer}>
      <span>{t("freeSoftware")}</span>
      <a href={SOURCE_URL} target="_blank" rel="noopener">{t("source")}</a>
      <Link href="/privacy">{t("privacy")}</Link>
    </footer>
  );
}
