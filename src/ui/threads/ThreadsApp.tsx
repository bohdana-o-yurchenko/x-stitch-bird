"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BEAD_CATALOGUES } from "@/core/catalog/catalog";
import { BUILT_IN_THREAD_BRANDS } from "@/core/pattern/brands";
import type { CustomColor } from "@/core/pattern/types";
import { createLibrary } from "@/editor/library";
import { useRouter } from "@/i18n/navigation";
import { useSignedInOnly } from "../account/useSignedInOnly";
import { PageLoading } from "../common/AppBrand";
import { Modal, cx, ui } from "../common/widgets";
import { HomeFooter, HomeHeader } from "../home/HomeHeader";
import home from "../home/home.module.css";
import { SORTS, VIEWS, sortColours, type InventorySort, type InventoryView } from "./inventoryView";
import { ThreadDialog } from "./ThreadDialog";
import type { ThreadFields } from "./ThreadForm";
import { ThreadList } from "./ThreadList";
import s from "./threads.module.css";

/** Built-in brands: your threads and beads can be added to them, but they can't be renamed or deleted. */
const BUILT_IN = new Set([...BUILT_IN_THREAD_BRANDS, ...Object.keys(BEAD_CATALOGUES)]);

type Editing = { kind: "thread" | "bead"; thread?: CustomColor; brand?: string } | null;

/** The view and the sort are remembered in this browser, apart for threads and beads. */
function useChoice<T extends string>(key: string, options: readonly T[], fallback: T) {
  const [value, set] = useState<T>(fallback);
  useEffect(() => {
    // read once after the first render (the server has no localStorage)
    try {
      const v = localStorage.getItem(key) as T | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v && options.includes(v)) set(v);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, (v: T) => {
    set(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  }] as const;
}

const newId = () => `custom:${Math.random().toString(36).slice(2, 10)}`;

/**
 * Threads (SPEC §15.28): your own threads and beads, signed in — by brand; add, change (also its brand), delete.
 * Your own brands can be renamed or deleted. Signed out there is no inventory: custom colours live in their pattern.
 */
export default function ThreadsApp({ kind }: { kind: "thread" | "bead" }) {
  const t = useTranslations("threadsPage");
  const lib = useMemo(() => createLibrary(), []);
  const router = useRouter();
  const { user: u, isPending, offline, allowed } = useSignedInOnly();
  const user = u ? { email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [signInOpen, setSignInOpen] = useState(false);
  const [threads, setThreads] = useState<CustomColor[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
  const [view, setView] = useChoice<InventoryView>(`stitchwork.${kind}sView`, VIEWS, "gallery");
  const [sort, setSort] = useChoice<InventorySort>(`stitchwork.${kind}sSort`, SORTS, "code");
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CustomColor | null>(null);
  const [brandAction, setBrandAction] = useState<{ kind: "rename" | "delete"; brand: string } | null>(null);

  useEffect(() => {
    if (isPending) return;
    lib.setSignedIn(!!u);
    if (!u) return;
    // offline they come once the internet is back (SPEC §15.53)
    if (offline) return;
    void lib.threads().then((list) => {
      setFailed(!list);
      if (list) setThreads(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, isPending, u?.id, offline]);

  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of threads ?? []) if (c.kind === kind) counts.set(c.brand, (counts.get(c.brand) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [threads, kind]);
  const mine = (threads ?? []).filter((c) => c.kind === kind);
  const shown = sortColours(mine.filter((c) => !brand || c.brand === brand), sort);

  const save = async (f: ThreadFields) => {
    if (!editing) return;
    const c: CustomColor = { ...(editing.thread ?? { id: newId(), kind: editing.kind }), brand: f.brand, code: f.code, name: f.name || f.code, hex: f.hex, ...(editing.kind === "bead" ? { series: "Custom" } : {}) };
    if (!(await lib.saveThread(c))) return;
    setThreads((list) => [...(list ?? []).filter((x) => x.id !== c.id), c]);
    setEditing(null);
  };
  const remove = async (c: CustomColor) => {
    if (!(await lib.removeThread(c.id))) return false;
    setThreads((list) => (list ?? []).filter((x) => x.id !== c.id));
  };
  const renameBrand = async (from: string, to: string) => {
    const name = to.trim();
    if (!name || name === from) return;
    const moved = mine.filter((c) => c.brand === from).map((c) => ({ ...c, brand: name }));
    for (const c of moved) await lib.saveThread(c);
    setThreads((list) => (list ?? []).map((c) => (c.kind === kind && c.brand === from ? { ...c, brand: name } : c)));
    if (brand === from) setBrand(name);
  };
  const deleteBrand = async (b: string) => {
    for (const c of mine.filter((x) => x.brand === b)) await lib.removeThread(c.id);
    setThreads((list) => (list ?? []).filter((c) => !(c.kind === kind && c.brand === b)));
    if (brand === b) setBrand(null);
  };

  const builtIn = kind === "thread" ? BUILT_IN_THREAD_BRANDS : Object.keys(BEAD_CATALOGUES);
  const brandChoices = (k: "thread" | "bead") => [...new Set([...(brand && k === kind ? [brand] : []), ...(k === "thread" ? BUILT_IN_THREAD_BRANDS : Object.keys(BEAD_CATALOGUES)), ...(threads ?? []).filter((c) => c.kind === k).map((c) => c.brand)])];

  // signed out there is only the editor (SPEC §15.39)
  if (!allowed) return <PageLoading />;
  return (
    <div className={home.page}>
      <HomeHeader section={kind === "thread" ? "threads" : "beads"} user={user} pending={isPending} offline={offline} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />
      <main className={home.main}>
          <div className={s.layout}>
            <nav className={s.brandList} aria-label={t("brands")} data-testid="thread-brands">
              <button type="button" className={cx(s.brandItem, !brand && s.on)} onClick={() => setBrand(null)}>
                <span>{t(kind === "thread" ? "all" : "allBeads")}</span>
                <small>{threads ? mine.length : ""}</small>
              </button>
              {brands.map(([b, n]) => (
                <div key={b} className={cx(s.brandItem, brand === b && s.on)}>
                  <button type="button" className={s.brandPick} onClick={() => setBrand(b)}>
                    <span>{b}</span>
                    <small>{n}</small>
                  </button>
                  {!BUILT_IN.has(b) && (
                    <span className={s.brandTools}>
                      <button type="button" title={t("renameBrand", { brand: b })} aria-label={t("renameBrand", { brand: b })} onClick={() => setBrandAction({ kind: "rename", brand: b })}>✎</button>
                      <button type="button" title={t("deleteBrand", { brand: b })} aria-label={t("deleteBrand", { brand: b })} onClick={() => setBrandAction({ kind: "delete", brand: b })}>🗑</button>
                    </span>
                  )}
                </div>
              ))}
            </nav>
            <section className={s.listSide}>
              <div className={home.listHead}>
                <h2>{brand ?? t(kind === "thread" ? "all" : "allBeads")}</h2>
                <span className={home.spacer} />
                {shown.length > 0 && (
                  <>
                    <div className={cx(ui.seg, home.viewSwitch)} role="group" aria-label={t("view")}>
                      {VIEWS.map((v) => (
                        <button key={v} type="button" className={cx(view === v && ui.on)} aria-pressed={view === v} onClick={() => setView(v)} data-testid={`view-${v}`}>{t(`view_${v}`)}</button>
                      ))}
                    </div>
                    <select className={home.sort} aria-label={t("sort")} value={sort} onChange={(e) => setSort(e.target.value as InventorySort)} data-testid="thread-sort">
                      {SORTS.map((o) => <option key={o} value={o}>{t(`sort_${o}`)}</option>)}
                    </select>
                  </>
                )}
                <button type="button" className={cx(ui.btn, ui.primary)} disabled={offline} title={offline ? t("needsInternet") : undefined} onClick={() => setEditing({ kind, brand: brand ?? builtIn[0] })}>{t(kind === "thread" ? "addThread" : "addBead")}</button>
              </div>
              {offline ? <p className={ui.hint} data-testid="threads-offline">{t(kind === "thread" ? "offline" : "offlineBeads")}</p> : failed && <p className={ui.warn}>{t("unreachable")}</p>}
              {!threads && !failed && !offline && <p className={ui.hint}>{t("loading")}</p>}
              {threads && !mine.length && <p className={ui.hint}>{t(kind === "thread" ? "empty" : "emptyBeads")}</p>}
              <ThreadList items={shown} view={view} onPick={(c) => !offline && setEditing({ kind: c.kind, thread: c })} />
            </section>
          </div>
      </main>
      <HomeFooter />

      {editing && (
        <ThreadDialog
          kind={editing.kind}
          brands={brandChoices(editing.kind)}
          initial={editing.thread ? { brand: editing.thread.brand, code: editing.thread.code, name: editing.thread.name === editing.thread.code ? "" : editing.thread.name, hex: editing.thread.hex } : { brand: editing.brand ?? "", code: "", name: "", hex: "#7A9CC6" }}
          editing={!!editing.thread}
          onSave={(f) => save(f)}
          onDelete={editing.thread ? () => {
            setDeleting(editing.thread!);
            setEditing(null);
          } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Modal title={t("deleteTitle", { brand: deleting.brand, code: deleting.code })} onClose={() => setDeleting(null)} buttons={[{ label: t("cancel") }, { label: t("delete"), danger: true, onClick: () => remove(deleting) }]}>
          <p>{t("deleteBody")}</p>
        </Modal>
      )}
      {brandAction?.kind === "rename" && <RenameBrand from={brandAction.brand} onClose={() => setBrandAction(null)} onRename={(to) => renameBrand(brandAction.brand, to)} />}
      {brandAction?.kind === "delete" && (
        <Modal title={t("deleteBrandTitle", { brand: brandAction.brand })} onClose={() => setBrandAction(null)} buttons={[{ label: t("cancel") }, { label: t("delete"), danger: true, onClick: () => deleteBrand(brandAction.brand) }]}>
          <p>{t("deleteBrandBody", { count: mine.filter((c) => c.brand === brandAction.brand).length })}</p>
        </Modal>
      )}
    </div>
  );
}

function RenameBrand({ from, onClose, onRename }: { from: string; onClose: () => void; onRename: (to: string) => Promise<void> }) {
  const t = useTranslations("threadsPage");
  const [name, setName] = useState(from);
  return (
    <Modal title={t("renameBrand", { brand: from })} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("save"), primary: true, onClick: () => onRename(name) }]}>
      <label className={ui.field}>
        {t("brandName")}
        <input className={ui.input} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className={ui.hint}>{t("renameBody")}</p>
    </Modal>
  );
}
