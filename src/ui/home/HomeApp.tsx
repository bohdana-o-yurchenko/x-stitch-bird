"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { accountUsage, createLibrary, type AccountUsage, type AttachedPhoto, type Library } from "@/editor/library";
import type { PatternDetails } from "@/core/pattern/stats";
import { splitDuration } from "@/core/time/workTime";
import { requestStart } from "@/editor/startRequest";
import type { PatternSummary } from "@/editor/types";
import { Link, useRouter } from "@/i18n/navigation";
import { pickFile } from "@/platform/files";
import { useSignedInOnly } from "../account/useSignedInOnly";
import { PageLoading } from "../common/AppBrand";
import { Dropdown, Modal, cx, ui, type MenuItem } from "../common/widgets";
import { HomeFooter, HomeHeader } from "./HomeHeader";
import s from "./home.module.css";

type Current = NonNullable<Awaited<ReturnType<Library["current"]>>>;

/** From this many patterns on, the list gets search and sorting. */
const MANY = 8;

/**
 * The main page (SPEC §15.26, §15.37), signed in only (§15.39): the logo leads here from the editor. At the top, the
 * pattern last worked on — Continue, with its figures and the same actions as every pattern; below, every pattern of
 * the account (and of this browser) as a gallery or a list, with New ▾, and search and sorting once there are many.
 */
export default function HomeApp() {
  const t = useTranslations("home");
  const lib = useMemo(() => createLibrary(), []);
  const { session, isPending, allowed } = useSignedInOnly();
  const u = session?.user;
  const user = u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const signedIn = !!user;
  const [items, setItems] = useState<PatternSummary[] | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [moving, setMoving] = useState<{ done: number; count: number } | null>(null);
  /** The account filled up while moving: how many it holds at most. */
  const [full, setFull] = useState<number | null>(null);
  /** A word after an action ("the copy is only in this browser"). */
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useView();
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const router = useRouter();
  /** When the page was opened: "edited" for the last pattern while its saved copy isn't listed yet. */
  const [openedAt] = useState(Date.now);

  const refresh = () => {
    void lib.list().then(setItems).catch(() => setItems([]));
    void lib.current().then(setCurrent);
    if (u) void accountUsage().then(setUsage);
  };
  useEffect(() => {
    if (isPending) return;
    lib.setSignedIn(!!u);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, isPending, u?.id]);

  const onlyHere = signedIn ? (items ?? []).filter((p) => p.where === "browser") : [];
  const move = async () => {
    setMoving({ done: 0, count: onlyHere.length });
    const r = await lib.moveToAccount(onlyHere.map((p) => p.id), (done) => setMoving({ done, count: onlyHere.length }));
    setFull(r.limit ?? null);
    setMoving(null);
    refresh();
  };

  // signed out there is one pattern, the one to continue (SPEC §15.37); signed in it isn't listed again below
  const others = signedIn ? (items ?? []).filter((p) => p.id !== current?.id) : [];
  const q = query.trim().toLocaleLowerCase();
  const shown = others
    .filter((p) => !q || p.name.toLocaleLowerCase().includes(q) || p.designer?.toLocaleLowerCase().includes(q))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt));
  const currentItem: PatternSummary | null = current ? (items?.find((p) => p.id === current.id) ?? { id: current.id, name: current.name, w: current.w, h: current.h, updatedAt: openedAt }) : null;
  const nothing = !!items && !current && !others.length;
  const actions = { lib, signedIn, onChanged: refresh, onNotice: setNotice };

  // signed out there is only the editor (SPEC §15.39)
  if (!allowed) return <PageLoading />;
  return (
    <div className={s.page}>
      <HomeHeader section="patterns" user={user} pending={isPending} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />

      <main className={s.main}>
        {current && currentItem && (
          <section className={s.continue} data-testid="home-continue">
            <Link href="/" className={s.continuePreview} aria-label={t("continueTo", { name: current.name })}>
              {/* a picture drawn here (data: URL): nothing for the image optimiser */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {current.preview && <img src={current.preview} alt="" />}
            </Link>
            <div className={s.continueText}>
              <span className={s.kicker}>{t("continue")}</span>
              <h1>{current.name}</h1>
              <PatternFacts p={currentItem} lib={lib} />
              <div className={s.continueButtons}>
                <Link href="/" className={cx(ui.btn, ui.primary, s.go)}>{t("continueButton")}</Link>
                <PatternMenu p={currentItem} onlyHere={signedIn && currentItem.where === "browser"} isCurrent {...actions} />
              </div>
            </div>
          </section>
        )}

        {notice && (
          <div className={s.banner} role="status" data-testid="home-notice">
            <p>{notice}</p>
            <button type="button" className={cx(ui.btn, ui.sm, ui.ghost)} onClick={() => setNotice(null)}>{t("ok")}</button>
          </div>
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
          </section>
        ) : (
          <section>
            <div className={s.listHead}>
              <h2>
                {t("all")}
              </h2>
              <span className={s.spacer} />
              {usage && <StorageButton usage={usage} />}
              <div className={cx(ui.seg, s.viewSwitch)} role="group" aria-label={t("view")}>
                <button type="button" className={cx(view === "gallery" && ui.on)} aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>{t("viewGallery")}</button>
                <button type="button" className={cx(view === "list" && ui.on)} aria-pressed={view === "list"} onClick={() => setView("list")} data-testid="home-view-list">{t("viewList")}</button>
              </div>
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
              <div className={view === "list" ? s.rows : s.grid}>
                {shown.map((p) => {
                  const Item = view === "list" ? PatternRow : PatternCard;
                  return <Item key={p.id} p={p} onlyHere={p.where === "browser"} {...actions} />;
                })}
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

const VIEW_KEY = "stitchwork.patternsView";

/** Gallery or list, remembered in this browser (SPEC §15.36). */
function useView(): ["gallery" | "list", (v: "gallery" | "list") => void] {
  const [view, set] = useState<"gallery" | "list">("gallery");
  useEffect(() => {
    try {
      // read once after the first render (the server has no localStorage)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(VIEW_KEY) === "list") set("list");
    } catch {}
  }, []);
  return [
    view,
    (v) => {
      set(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {}
    },
  ];
}

const mb = (bytes: number) => (bytes ? Math.max(0.1, Math.round(bytes / 104857.6) / 10) : 0);
const kb = (bytes: number) => Math.max(1, Math.round(bytes / 1024));

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

/** Start something new: a blank pattern, from a photo, an .oxs or a PDF chart, or a work file — then on to the editor. */
function useStarts() {
  const router = useRouter();
  return {
    blank: () => router.push({ pathname: "/", query: { new: "1" } }),
    // the editor says first what this is (SPEC §15.46), then the PDF is picked
    pdf: () => router.push({ pathname: "/", query: { new: "pdf" } }),
    oxs: async () => {
      const f = await pickFile(".oxs");
      if (!f) return;
      requestStart({ kind: "file", file: f });
      router.push("/");
    },
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
          { label: t("newOxs"), onClick: () => void go.oxs() },
          { label: t("newPdf"), onClick: go.pdf },
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

type Actions = { lib: Library; signedIn: boolean; onChanged: () => void; onNotice: (text: string) => void };
type ItemProps = Actions & { p: PatternSummary; onlyHere: boolean };

const openHref = (p: PatternSummary) => ({ pathname: "/", query: { open: p.id } });

/** The pattern's picture: the account's, or drawn here from this browser's copy. */
function usePreview(lib: Library, p: PatternSummary) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void lib.previewUrl(p).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [lib, p]);
  return src;
}

/** Its figures (SPEC §15.36), worked out once shown. */
function useDetails(lib: Library, p: PatternSummary) {
  const [d, setD] = useState<PatternDetails | null>(null);
  useEffect(() => {
    let live = true;
    void lib.details(p).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [lib, p]);
  return d;
}

/**
 * What a pattern is, as label / value lines that read like a sentence (SPEC §15.37): size (and on its fabric),
 * stitches, time (and the last change), space it takes.
 */
function PatternFacts({ p, lib }: { p: PatternSummary; lib: Library }) {
  const t = useTranslations("home");
  const tw = useTranslations("work");
  const locale = useLocale();
  const d = useDetails(lib, p);
  const ago = useAgo(p.updatedAt);
  const n = (v: number) => v.toLocaleString(locale);
  const spent = d ? splitDuration(d.spent) : null;
  const time = spent ? (spent.h ? tw("hm", spent) : spent.m ? tw("m", spent) : tw("none")) : null;
  const line = (label: string, parts: (string | null | false | undefined)[], testId?: string) => (
    <div className={s.fact}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{parts.filter(Boolean).join(" · ") || "…"}</dd>
    </div>
  );
  return (
    <dl className={s.facts}>
      {line(t("factSize"), [t("size", { w: p.w, h: p.h }), d && t("factCm", { w: cm(p.w, d.count), h: cm(p.h, d.count), count: Math.floor(d.count) })])}
      {line(t("factStitches"), d ? [t("factColours", { colours: d.colours, stitches: n(d.stitches) }), d.beads > 0 && t("factBeads", { n: n(d.beads) }), d.backstitch > 0 && t("factBackstitch", { n: n(d.backstitch) })] : [])}
      {line(t("factWork"), [time, t("factEdited", { when: ago })])}
      {line(t("factSpace"), d ? [t("factFile", { kb: kb(d.bytes) }), d.photos.count ? t("factPhotos", { count: d.photos.count, mb: mb(d.photos.bytes) }) : t("factNoPhotos"), t("factVersions", { count: d.versions })] : [], "home-space")}
    </dl>
  );
}

/**
 * ⋯ — every action on a saved pattern (SPEC §15.37), the same on the Continue card, in the gallery and the list:
 * open, download its .xbird, rename, duplicate, its photos, keep it in the account, delete.
 */
function PatternMenu({ p, lib, signedIn, onlyHere, isCurrent = false, onChanged, onNotice }: ItemProps & { isCurrent?: boolean }) {
  const t = useTranslations("home");
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "rename" | "photos" | "delete">(null);
  const download = async () => {
    if (!(await lib.downloadXbird(p))) onNotice(t("downloadFailed"));
  };
  const duplicate = async () => {
    const name = t("copyName", { name: p.name });
    const r = await lib.duplicate(p, name);
    if (!r) return onNotice(t("downloadFailed"));
    onNotice(r.limit ? t("copyNotInAccount", { max: r.limit }) : t("copied", { name }));
    onChanged();
  };
  const keep = async () => {
    const r = await lib.moveToAccount([p.id]);
    if (r.limit) onNotice(t("accountFull", { max: r.limit }));
    onChanged();
  };
  const items: MenuItem[] = [
    ...(isCurrent ? [] : [{ label: t("openIt"), onClick: () => router.push(openHref(p)) }, "-" as const]),
    { label: t("download"), onClick: () => void download() },
    { label: t("rename"), onClick: () => setDialog("rename") },
    ...(signedIn ? [{ label: t("duplicate"), onClick: () => void duplicate() }] : []),
    { label: t("photos"), onClick: () => setDialog("photos") },
    ...(onlyHere ? [{ label: t("keepInAccount"), onClick: () => void keep() }] : []),
    ...(signedIn ? ["-" as const, { label: t("delete"), onClick: () => setDialog("delete") }] : []),
  ];
  return (
    <>
      <Dropdown className={s.more} title={t("more", { name: p.name })} label="⋯" items={items} />
      {dialog === "rename" && <RenameDialog p={p} lib={lib} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === "photos" && <PhotosDialog p={p} lib={lib} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === "delete" && <DeleteDialog p={p} lib={lib} onClose={() => setDialog(null)} onDone={onChanged} />}
    </>
  );
}

type DialogProps = { p: PatternSummary; lib: Library; onClose: () => void; onDone: () => void };

function RenameDialog({ p, lib, onClose, onDone }: DialogProps) {
  const t = useTranslations("home");
  const td = useTranslations("dialogs");
  const [name, setName] = useState(p.name);
  const save = async () => {
    if (await lib.rename(p, name)) onDone();
  };
  return (
    <Modal title={t("renameTitle")} onClose={onClose} buttons={[{ label: td("cancel") }, { label: t("save"), primary: true, disabled: !name.trim(), onClick: save }]}>
      <label className={ui.field}>
        {t("renameLabel")}
        <input className={ui.input} autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && void save().then(onClose)} data-testid="rename-input" />
      </label>
    </Modal>
  );
}

/** The pattern's photos, each with Remove, and Remove all — to free room in the account (SPEC §15.37). */
function PhotosDialog({ p, lib, onClose, onDone }: DialogProps) {
  const t = useTranslations("home");
  const [list, setList] = useState<AttachedPhoto[] | null>(null);
  useEffect(() => {
    let live = true;
    void lib.photos(p).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [lib, p]);
  // the pictures' object URLs go with the dialog
  useEffect(() => () => list?.forEach((x) => x.url && URL.revokeObjectURL(x.url)), [list]);
  const remove = async (keys: string[]) => {
    await lib.removePhotos(p, keys);
    setList((l) => l?.filter((x) => !keys.includes(x.key)) ?? null);
    onDone();
  };
  const total = (list ?? []).reduce((a, x) => a + x.bytes, 0);
  return (
    <Modal
      title={t("photosTitle", { name: p.name })}
      onClose={onClose}
      buttons={[
        ...(list?.length ? [{ label: t("photosRemoveAll", { mb: mb(total) }), danger: true, onClick: async () => { await remove(list.map((x) => x.key)); return false as const; } }] : []),
        { label: t("ok"), primary: true },
      ]}
    >
      {!list && <p className={ui.hint}>{t("loading")}</p>}
      {list && !list.length && <p className={ui.hint}>{t("photosNone")}</p>}
      {list && list.length > 0 && (
        <>
          <p className={ui.hint} style={{ marginTop: 0 }}>{t("photosHint")}</p>
          <ul className={s.photoList} data-testid="photos-list">
            {list.map((x) => (
              <li key={x.key}>
                <span className={s.photoThumb} style={x.url ? { backgroundImage: `url(${x.url})` } : undefined} />
                <span className={s.photoName}>
                  <b>{x.kind === "underlay" ? t("photoUnderlay") : x.name || t("photoWindow")}</b>
                  <span className={ui.hint}>{mb(x.bytes)} MB</span>
                </span>
                <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => void remove([x.key])}>{t("photoRemove")}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/** Delete, asked first — with a way to keep it as a file to load later (SPEC §15.37). */
function DeleteDialog({ p, lib, onClose, onDone }: DialogProps) {
  const t = useTranslations("home");
  const td = useTranslations("dialogs");
  const remove = async () => {
    await lib.remove(p.id);
    onDone();
  };
  return (
    <Modal
      title={td("deleteSavedTitle", { name: p.name })}
      onClose={onClose}
      buttons={[
        { label: td("cancel") },
        { label: t("deleteDownload"), onClick: async () => { if (await lib.downloadXbird(p)) await remove(); } },
        { label: td("deleteSaved"), danger: true, onClick: remove },
      ]}
    >
      <p data-testid="confirm-delete">{t.rich("deleteBody", { name: p.name, b: (c) => <b>{c}</b> })}</p>
    </Modal>
  );
}

/** Gallery: the picture, the name, when it was changed. */
function PatternCard(props: ItemProps) {
  const { p, lib, onlyHere } = props;
  const t = useTranslations("home");
  const src = usePreview(lib, p);
  const ago = useAgo(p.updatedAt);
  const open = openHref(p);
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
        <PatternMenu {...props} />
      </div>
    </div>
  );
}

/** List (SPEC §15.37): a big picture, the name as the title, then its figures as label / value lines. */
function PatternRow(props: ItemProps) {
  const { p, lib, onlyHere } = props;
  const t = useTranslations("home");
  const src = usePreview(lib, p);
  const open = openHref(p);
  const where = onlyHere ? null : p.where === "account" ? t("whereAccount") : p.where === "both" ? t("whereBoth") : null;
  return (
    <div className={s.row} data-testid="home-pattern">
      <Link href={open} className={s.rowPreview} aria-label={t("open", { name: p.name })}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : null}
      </Link>
      <div className={s.rowBody}>
        <div className={s.rowHead}>
          <div className={s.rowTitle}>
            <Link href={open} className={s.rowName}>{p.name}</Link>
            <span className={ui.hint}>
              {[p.designer, where].filter(Boolean).join(" · ")}
              {onlyHere && <span className={s.warn}>{t("onlyHereChip")}</span>}
            </span>
          </div>
          <Link href={open} className={cx(ui.btn, ui.sm, s.openBtn)}>{t("openIt")}</Link>
          <PatternMenu {...props} />
        </div>
        <PatternFacts p={p} lib={lib} />
      </div>
    </div>
  );
}

/**
 * The account's storage in one number (SPEC §15.40): how full its closer-to-full limit is — patterns or photos,
 * whichever is nearer its end (that's the one that stops you). A small bar, amber from 80 %, red when full; the
 * details on hover; it leads to the Account page with both limits.
 */
function StorageButton({ usage }: { usage: AccountUsage }) {
  const t = useTranslations("home");
  const share = Math.min(1, Math.max(usage.patterns / usage.maxPatterns, usage.photos / usage.maxPhotos));
  const level = share >= 1 ? "full" : share >= 0.8 ? "high" : "ok";
  const details = t("storageHint", { patterns: usage.patterns, maxPatterns: usage.maxPatterns, photos: mb(usage.photos), maxPhotos: Math.round(usage.maxPhotos / 1048576) });
  return (
    <Link href="/account" className={s.storage} data-level={level} title={details} aria-label={`${t("storage", { percent: Math.round(share * 100) })} — ${details}`} data-testid="home-usage">
      <span className={s.storageBar}><span style={{ width: `${Math.max(share * 100, 3)}%` }} /></span>
      {t("storage", { percent: Math.round(share * 100) })}
    </Link>
  );
}
