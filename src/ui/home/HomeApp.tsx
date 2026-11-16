"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createLibrary, type Library } from "@/editor/library";
import type { PatternSummary } from "@/editor/types";
import { Link, useRouter } from "@/i18n/navigation";
import { AccountMenu } from "../account/AccountButton";
import { authClient } from "../account/authClient";
import { DeleteButton, cx, ui } from "../common/widgets";
import { LanguageSwitch } from "../header/LanguageSwitch";
import s from "./home.module.css";

/**
 * The main page (SPEC §15.26): the logo leads here from the editor. My patterns — previews, open, delete, a new one;
 * signed out, the pattern(s) in this browser and an invitation to sign in; signed in, this browser's patterns can
 * move into the account. The left column will grow (threads, stash).
 */
export default function HomeApp() {
  const t = useTranslations("home");
  const lib = useMemo(() => createLibrary(), []);
  const { data: session, isPending } = authClient.useSession();
  const u = session?.user;
  const user = u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [items, setItems] = useState<PatternSummary[] | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [moving, setMoving] = useState<{ done: number; count: number } | null>(null);
  const router = useRouter();

  const refresh = () => void lib.list().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    if (isPending) return;
    lib.setSignedIn(!!u);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, isPending, u?.id]);

  const onlyHere = user ? (items ?? []).filter((p) => p.where === "browser") : [];
  const move = async () => {
    setMoving({ done: 0, count: onlyHere.length });
    await lib.moveToAccount(onlyHere.map((p) => p.id), (done) => setMoving({ done, count: onlyHere.length }));
    setMoving(null);
    refresh();
  };

  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/patterns" className={s.brand}>
          <Image src="/icon.svg" alt="" width={30} height={30} unoptimized priority />
          <span>пташечка</span>
        </Link>
        <span className={s.spacer} />
        <LanguageSwitch compact />
        {!isPending && <AccountMenu user={user} signInOpen={signInOpen} setSignInOpen={setSignInOpen} onSignedOut={() => router.refresh()} />}
        <Link href="/" className={cx(ui.btn, ui.primary)} data-testid="to-editor">{t("openEditor")}</Link>
      </header>
      <div className={s.body}>
        <nav className={s.nav} aria-label={t("nav")}>
          <Link href="/patterns" aria-current="page">{t("patterns")}</Link>
        </nav>
        <main className={s.main}>
          <h1>{t("title")}</h1>
          {!isPending && !user && (
            <div className={s.banner} data-testid="home-signed-out">
              <p>{t("signedOut")}</p>
              <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setSignInOpen(true)}>{t("signIn")}</button>
            </div>
          )}
          {onlyHere.length > 0 && (
            <div className={s.banner} data-testid="home-move">
              <p>{t("onlyHere", { count: onlyHere.length })}</p>
              <button type="button" className={cx(ui.btn, ui.primary)} disabled={!!moving} onClick={() => void move()}>
                {moving ? t("moving", { done: moving.done, count: moving.count }) : t("move")}
              </button>
            </div>
          )}
          {!items ? (
            <p className={ui.hint}>{t("loading")}</p>
          ) : (
            <div className={s.grid}>
              <Link href={{ pathname: "/", query: { new: "1" } }} className={cx(s.card, s.newCard)} data-testid="home-new">
                <span className={s.plus}>+</span>
                <b>{t("newPattern")}</b>
                <span className={ui.hint}>{t("newPatternHint")}</span>
              </Link>
              {items.map((p) => (
                <PatternCard key={p.id} p={p} lib={lib} onDeleted={() => setItems((list) => list?.filter((i) => i.id !== p.id) ?? null)} />
              ))}
            </div>
          )}
          {items && !items.length && <p className={ui.hint}>{t("empty")}</p>}
        </main>
      </div>
    </div>
  );
}

function PatternCard({ p, lib, onDeleted }: { p: PatternSummary; lib: Library; onDeleted: () => void }) {
  const t = useTranslations("home");
  const td = useTranslations("dialogs");
  const [src, setSrc] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    let live = true;
    void lib.previewUrl(p).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [lib, p]);
  const remove = async () => {
    await lib.remove(p.id);
    onDeleted();
  };
  return (
    <div className={s.card} data-testid="home-pattern">
      <Link href={{ pathname: "/", query: { open: p.id } }} className={s.open} aria-label={t("open", { name: p.name })}>
        <span className={s.preview}>
          {/* a picture drawn here (data: URL) or a short-lived signed link: nothing for the image optimiser */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" /> : null}
        </span>
        <b className={s.name}>{p.name}</b>
        <span className={ui.hint}>
          {`${p.w}×${p.h} · ${new Date(p.updatedAt).toLocaleDateString()}`}
          <br />
          {t(p.where === "account" ? "inAccount" : p.where === "both" ? "inBoth" : "inBrowser")}
        </span>
      </Link>
      {confirming ? (
        <div className={ui.warn} role="alertdialog" aria-label={td("deleteSavedTitle", { name: p.name })} data-testid="confirm-delete">
          <p style={{ margin: "0 0 8px" }}>{td.rich("deleteSavedBody", { name: p.name, b: (c) => <b>{c}</b> })}</p>
          <div className={ui.row}>
            <button type="button" className={cx(ui.btn, ui.sm)} autoFocus onClick={() => setConfirming(false)}>{td("cancel")}</button>
            <button type="button" className={cx(ui.btn, ui.sm, ui.dangerBtn)} onClick={() => void remove()}>{td("deleteSaved")}</button>
          </div>
        </div>
      ) : (
        <span className={s.del}>
          <DeleteButton label={td("deleteSavedTitle", { name: p.name })} onClick={() => setConfirming(true)} />
        </span>
      )}
    </div>
  );
}
