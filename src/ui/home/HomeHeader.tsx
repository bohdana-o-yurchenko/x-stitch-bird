"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AccountMenu } from "../account/AccountButton";
import { LanguageSwitch } from "../header/LanguageSwitch";
import { SOURCE_URL } from "../common/source";
import s from "./home.module.css";

type User = { email: string; name?: string } | null;

/** The main pages' bar (SPEC §15.26): logo, the sections as tabs, languages, account — like the editor's. */
export function HomeHeader({ section, user, pending, signInOpen, setSignInOpen, beforeSignOut, onSignedOut }: {
  section: "patterns" | "threads";
  user: User;
  pending: boolean;
  signInOpen: boolean;
  setSignInOpen: (on: boolean) => void;
  beforeSignOut?: () => Promise<unknown>;
  onSignedOut?: () => void;
}) {
  const t = useTranslations("home");
  return (
    <header className={s.top}>
      <Link href="/patterns" className={s.brand}>
        <Image src="/icon.svg" alt="" width={30} height={30} unoptimized priority />
        <span>пташечка</span>
      </Link>
      <nav className={s.sections} aria-label={t("nav")}>
        <Link href="/patterns" aria-current={section === "patterns" ? "page" : undefined}>{t("patterns")}</Link>
        <Link href="/threads" aria-current={section === "threads" ? "page" : undefined}>{t("threads")}</Link>
      </nav>
      <span className={s.spacer} />
      <LanguageSwitch compact />
      {!pending && <AccountMenu user={user} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={beforeSignOut} onSignedOut={onSignedOut} />}
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
