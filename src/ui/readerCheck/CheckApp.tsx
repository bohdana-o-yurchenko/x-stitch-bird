"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Translate } from "@/core/labels/keyLabel";
import { summarize } from "@/core/readerCheck/summary";
import { CHECK_KINDS, MAX_APP_NAME, type Mark, type Marks } from "@/core/readerCheck/types";
import { checkStore, checkSuite, downloadCheckFile, newCheckId, type CheckKind, type CheckRun, type CheckStore } from "@/editor/readerChecks";
import { Link } from "@/i18n/navigation";
import { AccountMenu } from "../account/AccountButton";
import { authClient } from "../account/authClient";
import { AppBrand } from "../common/AppBrand";
import appBar from "../common/appBar.module.css";
import { ConfirmDelete, Modal, cx, ui } from "../common/widgets";
import { PagesMenu } from "../header/PagesMenu";
import { HomeFooter, HomeHeader } from "../home/HomeHeader";
import home from "../home/home.module.css";
import { CheckChart } from "./CheckChart";
import { CheckList } from "./CheckList";
import { CheckResults } from "./CheckResults";
import s from "./check.module.css";

/** The tab and each kind's check last open, remembered in this browser. */
const PREFS = "stitchwork.checkPage";
function readPrefs(): { kind: CheckKind; current: Partial<Record<CheckKind, string>> } {
  const fromUrl = new URLSearchParams(window.location.search).get("file") as CheckKind | null;
  try {
    const v = JSON.parse(localStorage.getItem(PREFS) ?? "{}") as { kind?: CheckKind; current?: Partial<Record<CheckKind, string>> };
    return { kind: fromUrl && CHECK_KINDS.includes(fromUrl) ? fromUrl : v.kind && CHECK_KINDS.includes(v.kind) ? v.kind : "oxs", current: v.current ?? {} };
  } catch {
    return { kind: fromUrl && CHECK_KINDS.includes(fromUrl) ? fromUrl : "oxs", current: {} };
  }
}

const blank = (kind: CheckKind): CheckRun => ({ id: newCheckId(), kind, app: kind === "pk" ? "Pattern Keeper" : "", marks: {}, updated: Date.now() });

/**
 * "Does my app read it?" (SPEC §15.51): a test file per kind (the .oxs, the PDF for Pattern Keeper, the PDF chart to
 * print), its chart as this app shows it, and the list of what's on it, numbered. Picking a number on the chart picks
 * it in the list and back; each is marked fine or with issues; once all are marked, the results in a few lines.
 * Signed out one check per kind is kept in this browser; signed in, as many as wanted, in the account.
 */
export default function CheckApp() {
  const t = useTranslations("readerCheck");
  const root = useTranslations();
  const locale = useLocale();
  const lang = locale === "uk" ? "uk" : "en";
  const { data: session, isPending } = authClient.useSession();
  const u = session?.user;
  const user = u ? { email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [signInOpen, setSignInOpen] = useState(false);

  const [prefs] = useState(readPrefs);
  const [kind, setKind] = useState<CheckKind>(prefs.kind);
  const [currentIds, setCurrentIds] = useState<Partial<Record<CheckKind, string>>>(prefs.current);
  const [store, setStore] = useState<CheckStore | null>(null);
  const [runs, setRuns] = useState<CheckRun[] | null>(null);
  /** The account: couldn't be reached (the checks are then kept in this browser), or keeps as many as it may. */
  const [problem, setProblem] = useState<"down" | "full" | null>(null);
  /** Each kind's new check, not saved until something is put in it. */
  const [drafts, setDrafts] = useState<Record<CheckKind, CheckRun>>(() => ({ oxs: blank("oxs"), pk: blank("pk"), pdf: blank("pdf") }));
  const [selected, setSelected] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "delete" | null>(null);
  const [downloading, setDownloading] = useState(false);

  // the store: the account signed in (this browser's checks move into it), else this browser
  useEffect(() => {
    if (isPending) return;
    let gone = false;
    void (async () => {
      const local = checkStore(false);
      const mine = await local.list();
      const use = (st: CheckStore, list: CheckRun[], failed: boolean) => {
        if (gone) return;
        setStore(st);
        setRuns(list);
        setProblem(failed ? "down" : null);
      };
      if (!u) return use(local, mine ?? [], false);
      const remote = checkStore(true);
      let list = await remote.list();
      if (list) {
        // checks made signed out go into the account, once
        for (const c of mine ?? []) if (Object.keys(c.marks).length && !list.some((r) => r.id === c.id) && (await remote.save(c))) await local.remove(c.id);
        if ((mine ?? []).length) list = (await remote.list()) ?? list;
      }
      if (list) use(remote, list, false);
      else use(checkStore(false), (await local.list()) ?? [], true);
    })();
    return () => {
      gone = true;
    };
  }, [isPending, u?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ kind, current: currentIds }));
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set("file", kind);
    window.history.replaceState(null, "", url);
  }, [kind, currentIds]);

  const suite = useMemo(() => checkSuite(kind), [kind]);
  const ofKind = useMemo(() => (runs ?? []).filter((r) => r.kind === kind), [runs, kind]);
  const draft = drafts[kind];
  const run: CheckRun = ofKind.find((r) => r.id === currentIds[kind]) ?? (draft.id === currentIds[kind] || !ofKind.length ? draft : ofKind[0]!);

  // saving: this browser at once, the account a moment after the last change
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<CheckRun | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const c = pending.current;
    pending.current = null;
    if (c && store) void store.save(c).then((r) => store.many && setProblem(r === "saved" ? null : r === "full" ? "full" : "down"));
  }, [store]);
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);

  const update = (change: Partial<Pick<CheckRun, "app" | "marks">>) => {
    const next: CheckRun = { ...run, ...change, updated: Date.now() };
    setRuns((list) => [next, ...(list ?? []).filter((r) => r.id !== next.id && (store?.many || r.kind !== next.kind))]);
    setCurrentIds((c) => ({ ...c, [kind]: next.id }));
    if (next.id === draft.id) setDrafts((d) => ({ ...d, [kind]: blank(kind) }));
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, store?.many ? 700 : 0);
    return next;
  };

  const items = suite.items;
  const left = (m: Marks) => items.filter((i) => !m[i.id]).length;
  const mark = (id: string, m: Mark | null) => {
    const marks = { ...run.marks };
    if (m) marks[id] = m;
    else delete marks[id];
    const was = left(run.marks);
    update({ marks });
    // the last one marked: the results
    if (was > 0 && left(marks) === 0) setResultsOpen(true);
    // "all good": on to the next one not marked yet
    if (m?.v === "ok") {
      const at = items.findIndex((i) => i.id === id);
      const next = [...items.slice(at + 1), ...items.slice(0, at)].find((i) => !marks[i.id]);
      if (next) setSelected(next.id);
    }
  };

  const startNew = () => {
    flush();
    const c = blank(kind);
    setDrafts((d) => ({ ...d, [kind]: c }));
    setCurrentIds((ids) => ({ ...ids, [kind]: c.id }));
    setSelected(null);
  };
  const clear = () => {
    update({ marks: {} });
    setSelected(null);
  };
  const remove = async () => {
    flush();
    if (store) await store.remove(run.id);
    setRuns((list) => (list ?? []).filter((r) => r.id !== run.id));
    setCurrentIds((ids) => ({ ...ids, [kind]: undefined }));
    setSelected(null);
  };
  const download = async () => {
    setDownloading(true);
    try {
      await downloadCheckFile(kind, root as unknown as Translate);
    } finally {
      setDownloading(false);
    }
  };

  const sum = useMemo(() => summarize(items, run.marks), [items, run.marks]);
  const done = sum.total - sum.left;
  const saved = ofKind.some((r) => r.id === run.id);

  const header = user
    ? <HomeHeader section="check" user={user} pending={isPending} signInOpen={signInOpen} setSignInOpen={setSignInOpen} />
    : (
      <header className={cx(appBar.bar, home.top)}>
        <AppBrand link={false} />
        <Link href="/" className={cx(ui.btn, ui.ghost, s.toEditor)}>{t("toEditor")}</Link>
        <span className={home.spacer} />
        <PagesMenu />
        {!isPending && <AccountMenu user={null} signInOpen={signInOpen} setSignInOpen={setSignInOpen} />}
      </header>
    );

  return (
    <div className={cx(home.page, s.page)}>
      {header}
      <main className={s.main} data-testid="reader-check">
        <section className={s.intro}>
          <div>
            <p className={home.kicker}>{t("kicker")}</p>
            <h1>{t("title")}</h1>
            <p className={s.lead}>{t("lead")}</p>
          </div>
          <ol className={s.steps}>
            <li><b>1</b><span>{t.rich("step1", { b: (c) => <strong>{c}</strong> })}</span></li>
            <li><b>2</b><span>{t.rich("step2", { b: (c) => <strong>{c}</strong> })}</span></li>
            <li><b>3</b><span>{t.rich("step3", { b: (c) => <strong>{c}</strong> })}</span></li>
          </ol>
        </section>

        <nav className={s.tabs} role="tablist" aria-label={t("files")}>
          {CHECK_KINDS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === kind} className={cx(s.tab, k === kind && s.tabOn)} data-testid={`check-tab-${k}`} onClick={() => { flush(); setKind(k); setSelected(null); }}>
              <span className={s.tabName}>{t(`kinds.${k}.name`)}</span>
              <span className={s.tabHint}>{t(`kinds.${k}.hint`)}</span>
            </button>
          ))}
        </nav>

        {problem && <p className={s.banner} data-testid="check-problem">{t(problem === "full" ? "accountFull" : "accountDown")}</p>}

        <section className={s.bar}>
          {store?.many && ofKind.length > 0 && (
            <div className={s.runs} role="list" aria-label={t("checks")}>
              {ofKind.map((r) => (
                <button key={r.id} type="button" role="listitem" className={cx(s.run, r.id === run.id && s.runOn)} onClick={() => { flush(); setCurrentIds((ids) => ({ ...ids, [kind]: r.id })); setSelected(null); }}>
                  {r.app || t("unnamed")}<small>{items.length - left(r.marks)}/{items.length}</small>
                </button>
              ))}
              {!saved && <span className={cx(s.run, s.runOn)}>{run.app || t("newOne")}</span>}
              {saved && <button type="button" className={cx(s.run, s.runNew)} onClick={startNew} data-testid="check-new">+ {t("newCheck")}</button>}
            </div>
          )}
          <div className={s.barRow}>
            <label className={s.app}>
              <span>{t("app")}</span>
              <input className={ui.input} value={run.app} maxLength={MAX_APP_NAME} placeholder={t(`kinds.${kind}.appPlaceholder`)} autoComplete="off" onChange={(e) => update({ app: e.target.value })} data-testid="check-app" />
            </label>
            <button type="button" className={cx(ui.btn, ui.primary, s.download)} disabled={downloading} onClick={download} data-testid="check-download">
              ⤓ {downloading ? t("downloading") : t(`kinds.${kind}.download`)}
            </button>
            <div className={s.progress} title={t("progress", { done, total: sum.total })}>
              <div className={s.meter}>
                <i className={s.meterOk} style={{ width: `${(sum.ok / sum.total) * 100}%` }} />
                <i className={s.meterBad} style={{ width: `${(sum.issues / sum.total) * 100}%` }} />
              </div>
              <span>{t("progress", { done, total: sum.total })}</span>
            </div>
            <span className={home.spacer} />
            <button type="button" className={ui.btn} disabled={!done} onClick={() => setResultsOpen(true)} data-testid="check-results">{t("results")}</button>
            <button type="button" className={cx(ui.btn, ui.ghost)} disabled={!done} onClick={() => setConfirm("clear")} data-testid="check-clear">{t("clear")}</button>
            {store?.many && saved && <button type="button" className={cx(ui.btn, ui.ghost, ui.deleteText)} onClick={() => setConfirm("delete")}>{t("delete")}</button>}
          </div>
          {!u && kind === "oxs" && !isPending && <p className={s.hint}>{t.rich("oneOnly", { a: (c) => <button type="button" className={s.linkBtn} onClick={() => setSignInOpen(true)}>{c}</button> })}</p>}
        </section>

        <section className={s.work}>
          <CheckChart suite={suite} marks={run.marks} selected={selected} onSelect={setSelected} lang={lang} />
          <CheckList suite={suite} marks={run.marks} selected={selected} onSelect={setSelected} onMark={mark} lang={lang} />
        </section>
      </main>
      <HomeFooter />

      {resultsOpen && <CheckResults suite={suite} run={run} lang={lang} onClose={() => setResultsOpen(false)} />}
      {confirm === "clear" && (
        <Modal title={t("clearTitle")} onClose={() => setConfirm(null)} buttons={[{ label: t("cancel") }, { label: t("clearConfirm"), danger: true, onClick: clear }]}>
          <p>{t("clearText", { app: run.app || t("unnamed") })}</p>
        </Modal>
      )}
      {confirm === "delete" && (
        <ConfirmDelete title={t("deleteTitle")} confirm={t("delete")} onConfirm={remove} onClose={() => setConfirm(null)}>
          <p>{t("deleteText", { app: run.app || t("unnamed") })}</p>
        </ConfirmDelete>
      )}
    </div>
  );
}
