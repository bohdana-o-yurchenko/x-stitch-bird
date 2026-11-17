"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { createLibrary, type Library } from "@/editor/library";
import { requestStart } from "@/editor/startRequest";
import type { PatternSummary } from "@/editor/types";
import { Link, useRouter } from "@/i18n/navigation";
import { pickFile } from "@/platform/files";
import { authClient } from "../account/authClient";
import { Dropdown, Modal, cx, ui } from "../common/widgets";
import { HomeFooter, HomeHeader } from "./HomeHeader";
import s from "./home.module.css";

type Current = NonNullable<Awaited<ReturnType<Library["current"]>>>;

/** From this many patterns on, the list gets search and sorting. */
const MANY = 8;

/**
 * The main page (SPEC §15.26): the logo leads here from the editor. At the top, the pattern last worked on —
 * Continue; below, every saved pattern as a card (preview, name, when it was changed), with New ▾, and search and
 * sorting once there are many. Signed out: a line inviting to sign in. Signed in: patterns only in this browser are
 * marked, and can move to the account.
 */
export default function HomeApp() {
  const t = useTranslations("home");
  const lib = useMemo(() => createLibrary(), []);
  const { data: session, isPending } = authClient.useSession();
  const u = session?.user;
  const user = u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [items, setItems] = useState<PatternSummary[] | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [moving, setMoving] = useState<{ done: number; count: number } | null>(null);
  /** The account filled up while moving: how many it holds at most. */
  const [full, setFull] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const router = useRouter();

  const refresh = () => void lib.list().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    if (isPending) return;
    lib.setSignedIn(!!u);
    refresh();
    void lib.current().then(setCurrent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, isPending, u?.id]);

  const onlyHere = user ? (items ?? []).filter((p) => p.where === "browser") : [];
  const move = async () => {
    setMoving({ done: 0, count: onlyHere.length });
    const r = await lib.moveToAccount(onlyHere.map((p) => p.id), (done) => setMoving({ done, count: onlyHere.length }));
    setFull(r.limit ?? null);
    setMoving(null);
    refresh();
  };

  // the one to continue is at the top, not again in the list
  const others = (items ?? []).filter((p) => p.id !== current?.id);
  const q = query.trim().toLocaleLowerCase();
  const shown = others
    .filter((p) => !q || p.name.toLocaleLowerCase().includes(q) || p.designer?.toLocaleLowerCase().includes(q))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt));
  const updated = (id: string) => items?.find((p) => p.id === id)?.updatedAt;
  const nothing = !!items && !items.length && !current;

  return (
    <div className={s.page}>
      <HomeHeader section="patterns" user={user} pending={isPending} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />

      <main className={s.main}>
        {current && (
          <section className={s.continue} data-testid="home-continue">
            <Link href="/" className={s.continuePreview} aria-label={t("continueTo", { name: current.name })}>
              {/* a picture drawn here (data: URL): nothing for the image optimiser */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {current.preview && <img src={current.preview} alt="" />}
            </Link>
            <div className={s.continueText}>
              <span className={s.kicker}>{t("continue")}</span>
              <h1>{current.name}</h1>
              <p className={ui.hint}>
                {t("size", { w: current.w, h: current.h })}
                {current.count > 0 && ` · ${t("finished", { w: cm(current.w, current.count), h: cm(current.h, current.count), count: current.count })}`}
              </p>
              {updated(current.id) && <Edited time={updated(current.id)!} />}
              <Link href="/" className={cx(ui.btn, ui.primary, s.go)}>{t("continueButton")}</Link>
              {!isPending && !user && (
                <p className={s.signedOut} data-testid="home-signed-out">
                  {t("signedOut")}{" "}
                  <button type="button" className={s.linkBtn} onClick={() => setSignInOpen(true)}>{t("signIn")}</button>
                </p>
              )}
            </div>
          </section>
        )}

        {onlyHere.length > 0 && (
          <div className={s.banner} data-testid="home-move">
            <p>{full ? t("accountFull", { max: full }) : t("onlyHere", { count: onlyHere.length })}</p>
            <button type="button" className={cx(ui.btn, ui.primary, ui.sm)} disabled={!!moving} onClick={() => void move()}>
              {moving ? t("moving", { done: moving.done, count: moving.count }) : t("move")}
            </button>
          </div>
        )}

        {nothing ? (
          <section className={s.empty} data-testid="home-empty">
            <Image src="/icon.svg" alt="" width={72} height={72} unoptimized />
            <h1>{t("emptyTitle")}</h1>
            <p className={ui.hint}>{t("emptyHint")}</p>
            <NewButtons />
            {!isPending && !user && (
              <p className={s.signedOut}>
                {t("signedOut")}{" "}
                <button type="button" className={s.linkBtn} onClick={() => setSignInOpen(true)}>{t("signIn")}</button>
              </p>
            )}
          </section>
        ) : (
          <section>
            <div className={s.listHead}>
              <h2>
                {t("all")} {items && <span className={s.count}>{others.length}</span>}
              </h2>
              <span className={s.spacer} />
              {others.length > MANY && (
                <>
                  <input className={s.search} type="search" placeholder={t("search")} aria-label={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
                  <select className={s.sort} aria-label={t("sort")} value={sort} onChange={(e) => setSort(e.target.value as "recent" | "name")}>
                    <option value="recent">{t("sortRecent")}</option>
                    <option value="name">{t("sortName")}</option>
                  </select>
                </>
              )}
              <NewMenu />
            </div>
            {!items ? (
              <p className={ui.hint}>{t("loading")}</p>
            ) : !others.length ? (
              <p className={ui.hint}>{t("noOthers")}</p>
            ) : (
              <div className={s.grid}>
                {shown.map((p) => (
                  <PatternCard key={p.id} p={p} lib={lib} onlyHere={!!user && p.where === "browser"} onDeleted={() => setItems((list) => list?.filter((i) => i.id !== p.id) ?? null)} />
                ))}
              </div>
            )}
            {q && !shown.length && <p className={ui.hint}>{t("noMatch")}</p>}
          </section>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}

/** Finished size in centimetres on the pattern's fabric. */
const cm = (stitches: number, count: number) => ((stitches / count) * 2.54).toFixed(1);

/** "2 hours ago", in the page's language. */
function useAgo(time: number): string {
  const locale = useLocale();
  // "now" as the page was opened: a time shown doesn't change under the reader
  const [now] = useState(Date.now);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const s = (time - now) / 1000;
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const)
    if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return rtf.format(0, "minute");
}

function Edited({ time }: { time: number }) {
  const t = useTranslations("home");
  return <p className={ui.hint}>{t("edited", { when: useAgo(time) })}</p>;
}

/** Start something new: a blank pattern, from a picture, or a work file — then on to the editor. */
function useStarts() {
  const router = useRouter();
  return {
    blank: () => router.push({ pathname: "/", query: { new: "1" } }),
    picture: async () => {
      const f = await pickFile("image/*");
      if (!f) return;
      requestStart({ kind: "image", file: f });
      router.push("/");
    },
    file: async () => {
      const f = await pickFile(".xbird,.oxs,.json,.xml");
      if (!f) return;
      requestStart({ kind: "file", file: f });
      router.push("/");
    },
  };
}

function NewMenu() {
  const t = useTranslations("home");
  const go = useStarts();
  return (
    <span data-testid="home-new">
      <Dropdown
        className={cx(ui.btn, ui.primary)}
        label={t("new")}
        items={[
          { label: t("newBlank"), onClick: go.blank },
          { label: t("newPicture"), onClick: () => void go.picture() },
          "-",
          { label: t("openFile"), hint: t("openFileHint"), onClick: () => void go.file() },
        ]}
      />
    </span>
  );
}

function NewButtons() {
  const t = useTranslations("home");
  const go = useStarts();
  return (
    <div className={s.emptyButtons}>
      <button type="button" className={cx(ui.btn, ui.primary)} onClick={go.blank}>{t("newBlank")}</button>
      <button type="button" className={ui.btn} onClick={() => void go.picture()}>{t("newPicture")}</button>
      <button type="button" className={cx(ui.btn, ui.ghost)} onClick={() => void go.file()}>{t("openFile")}</button>
    </div>
  );
}

function PatternCard({ p, lib, onlyHere, onDeleted }: { p: PatternSummary; lib: Library; onlyHere: boolean; onDeleted: () => void }) {
  const t = useTranslations("home");
  const td = useTranslations("dialogs");
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ago = useAgo(p.updatedAt);
  useEffect(() => {
    let live = true;
    void lib.previewUrl(p).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [lib, p]);
  const open = { pathname: "/", query: { open: p.id } };
  return (
    <div className={s.card} data-testid="home-pattern">
      <Link href={open} className={s.preview} aria-label={t("open", { name: p.name })}>
        {/* a picture drawn here (data: URL) or a short-lived signed link: nothing for the image optimiser */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : null}
        <span className={s.size}>{t("size", { w: p.w, h: p.h })}</span>
      </Link>
      <div className={s.cardFoot}>
        <div className={s.cardText}>
          <Link href={open} className={s.name}>{p.name}</Link>
          <span className={ui.hint}>
            {onlyHere ? <span className={s.warn}>{t("onlyHereChip")}</span> : ago}
          </span>
        </div>
        <Dropdown
          className={s.more}
          title={t("more", { name: p.name })}
          label="⋯"
          items={[
            { label: t("openIt"), onClick: () => router.push(open) },
            "-",
            { label: t("delete"), onClick: () => setConfirming(true) },
          ]}
        />
      </div>
      {confirming && (
        <Modal
          title={td("deleteSavedTitle", { name: p.name })}
          onClose={() => setConfirming(false)}
          buttons={[
            { label: td("cancel") },
            {
              label: td("deleteSaved"),
              danger: true,
              onClick: async () => {
                await lib.remove(p.id);
                onDeleted();
              },
            },
          ]}
        >
          <p data-testid="confirm-delete">{td.rich("deleteSavedBody", { name: p.name, b: (c) => <b>{c}</b> })}</p>
        </Modal>
      )}
    </div>
  );
}
