"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BEAD_CATALOGUES, THREAD_CATALOGUES } from "@/core/catalog/catalog";
import { FAMILIES, FAMILY_HEX, seriesOf, type Family } from "@/core/catalog/colourInfo";
import { makeColor, type ColorEntry } from "@/core/color/colorEntry";
import { BUILT_IN_THREAD_BRANDS } from "@/core/pattern/brands";
import type { CustomColor } from "@/core/pattern/types";
import type { PatternSummary } from "@/editor/types";
import { createLibrary } from "@/editor/library";
import { useRouter } from "@/i18n/navigation";
import { useSignedInOnly } from "../account/useSignedInOnly";
import { PageLoading } from "../common/AppBrand";
import { Modal, cx, ui } from "../common/widgets";
import { HomeFooter, HomeHeader } from "../home/HomeHeader";
import home from "../home/home.module.css";
import { ColourPanel } from "./ColourPanel";
import { SORTS, VIEWS, filterItems, sortItems, type InventorySort, type InventoryView, type Item } from "./inventoryView";
import { ThreadDialog } from "./ThreadDialog";
import type { ThreadFields } from "./ThreadForm";
import { ThreadList } from "./ThreadList";
import s from "./threads.module.css";

/** Built-in brands: your threads and beads can be added to them, but they can't be renamed or deleted. */
const BUILT_IN = new Set([...BUILT_IN_THREAD_BRANDS, ...Object.keys(BEAD_CATALOGUES)]);

type Editing = { kind: "thread" | "bead"; thread?: CustomColor; brand?: string; copyOf?: CustomColor } | null;

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
 * Floss and Beads (SPEC §15.28, §15.57), signed in: the whole catalogue of every brand with your own colours among
 * them (a dot marks them; "Only mine" leaves just those) — searched, filtered by colour family (and for beads by
 * series), sorted. Any colour can be duplicated into one of your own; your own are changed or deleted. Picking one
 * shows its panel. Your own brands can be renamed or deleted.
 */
export default function ThreadsApp({ kind }: { kind: "thread" | "bead" }) {
  const t = useTranslations("threadsPage");
  const lib = useMemo(() => createLibrary(), []);
  const router = useRouter();
  const { session, isPending, allowed } = useSignedInOnly();
  const u = session?.user;
  const user = u ? { email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [signInOpen, setSignInOpen] = useState(false);
  const [threads, setThreads] = useState<CustomColor[] | null>(null);
  const [failed, setFailed] = useState(false);
  const catalogues = kind === "thread" ? THREAD_CATALOGUES : BEAD_CATALOGUES;
  const builtIn = Object.keys(catalogues);
  const [brand, setBrand] = useState<string | null>(builtIn[0]!);
  const [view, setView] = useChoice<InventoryView>(`stitchwork.${kind}sView`, VIEWS, "gallery");
  const [sort, setSort] = useChoice<InventorySort>(`stitchwork.${kind}sSort`, SORTS, "code");
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [inPatterns, setInPatterns] = useState(false);
  const [family, setFamily] = useState<Family | null>(null);
  const [series, setSeries] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [uses, setUses] = useState<Map<string, PatternSummary[]> | null>(null);
  /** The quick filters, over every brand: your own; used in your patterns. */
  const keep = (i: Item) => (!onlyMine || !!i.own) && (!inPatterns || !!uses?.has(i.entry.id));
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CustomColor | null>(null);
  const [brandAction, setBrandAction] = useState<{ kind: "rename" | "delete"; brand: string } | null>(null);

  useEffect(() => {
    if (isPending) return;
    lib.setSignedIn(!!u);
    if (!u) return;
    void lib.threads().then((list) => (list ? setThreads(list) : setFailed(true)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, isPending, u?.id]);

  const mine = useMemo(() => (threads ?? []).filter((c) => c.kind === kind), [threads, kind]);
  // the catalogue, your own after it
  const items = useMemo<Item[]>(() => [
    ...Object.values(catalogues).flat().map((entry) => ({ entry, own: null })),
    ...mine.map((c, i) => ({ entry: makeColor({ id: c.id, kind: c.kind, brand: c.brand, code: c.code, name: c.name, hex: c.hex, order: 1e6 + i, ...(c.series ? { series: c.series } : {}) }), own: c })),
  ], [catalogues, mine]);
  const brands = useMemo(() => {
    const counts = new Map<string, number>(builtIn.map((b) => [b, 0]));
    for (const i of items) if (keep(i)) counts.set(i.entry.brand, (counts.get(i.entry.brand) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => (builtIn.includes(a) ? builtIn.indexOf(a) : 99) - (builtIn.includes(b) ? builtIn.indexOf(b) : 99) || a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, onlyMine, inPatterns, uses, builtIn]);
  // a bead brand's series (Mill Hill's series, Preciosa's glass): its branches in the brand list
  const seriesOfBrand = (b: string) => {
    const counts = new Map<string, number>();
    for (const i of items) {
      const x = i.entry.brand === b && keep(i) ? seriesOf(i.entry) : null;
      if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    return counts.size > 1 ? [...counts] : [];
  };
  const branches = kind === "bead" && brand ? seriesOfBrand(brand) : [];
  const inSeries = branches.some(([x]) => x === series) ? series : null;
  const shown = sortItems(filterItems(items.filter(keep), { brand, onlyMine: false, family, series: inSeries, query }), sort);
  const usedCount = uses ? items.filter((i) => uses.has(i.entry.id)).length : null;
  // the panel shows the colour looked at last (kept in this browser), else the list's first
  const pickedItem = (picked ? items.find((i) => i.entry.id === picked) : undefined) ?? shown[0] ?? null;
  const pool = pickedItem ? items.filter((i) => i.entry.brand === pickedItem.entry.brand).map((i) => i.entry) : [];
  const wide = useWide();
  const [sheetOpen, setSheetOpen] = useState(false);
  const panelShown = !!pickedItem && (wide || sheetOpen);
  useEffect(() => {
    try {
      // read once after the first render (the server has no localStorage)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPicked(localStorage.getItem(`stitchwork.${kind}sPicked`));
    } catch {}
  }, [kind]);
  // which patterns use what: read once, the first time the panel shows
  useEffect(() => {
    if ((panelShown || inPatterns) && !uses && threads) void lib.colourUses().then(setUses);
  }, [panelShown, inPatterns, uses, threads, lib]);
  const show = (e: ColorEntry) => {
    setPicked(e.id);
    setSheetOpen(true);
    try {
      localStorage.setItem(`stitchwork.${kind}sPicked`, e.id);
    } catch {}
  };
  const pickBrand = (b: string | null) => {
    setBrand(b);
    setSeries(null);
  };
  const ownOf = (c: CustomColor | null) => c ?? undefined;

  const save = async (f: ThreadFields) => {
    if (!editing) return;
    const c: CustomColor = { ...(editing.thread ?? { id: newId(), kind: editing.kind }), brand: f.brand, code: f.code, name: f.name || f.code, hex: f.hex, ...(editing.kind === "bead" ? { series: "Custom" } : {}) };
    if (!(await lib.saveThread(c))) return;
    setThreads((list) => [...(list ?? []).filter((x) => x.id !== c.id), c]);
    setEditing(null);
    setPicked(c.id);
  };
  const remove = async (c: CustomColor) => {
    if (!(await lib.removeThread(c.id))) return false;
    setThreads((list) => (list ?? []).filter((x) => x.id !== c.id));
    if (picked === c.id) setPicked(null);
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
    if (brand === b) setBrand(builtIn[0]!);
  };

  const brandChoices = (k: "thread" | "bead") => [...new Set([...(brand && k === kind ? [brand] : []), ...(k === "thread" ? BUILT_IN_THREAD_BRANDS : Object.keys(BEAD_CATALOGUES)), ...(threads ?? []).filter((c) => c.kind === k).map((c) => c.brand)])];

  // signed out there is only the editor (SPEC §15.39)
  if (!allowed) return <PageLoading />;
  return (
    <div className={cx(home.page, s.page)}>
      <HomeHeader section={kind === "thread" ? "threads" : "beads"} user={user} pending={isPending} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />
      <main className={cx(home.main, s.main)}>
          <div className={s.layout}>
            <nav className={s.brandList} aria-label={t("brands")} data-testid="thread-brands">
              {/* across every brand: which colours the brands below hold */}
              <div className={s.quick}>
                <label className={cx(s.switch, s.quickRow)} data-testid="only-mine">
                  <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                  <span>{t("onlyMine")}</span>
                  <small>{mine.length}</small>
                </label>
                <label className={cx(s.switch, s.quickRow)} data-testid="in-patterns">
                  <input type="checkbox" checked={inPatterns} onChange={(e) => setInPatterns(e.target.checked)} />
                  <span>{t("inMyPatterns")}</span>
                  <small>{usedCount ?? (inPatterns ? "…" : "")}</small>
                </label>
              </div>
              {brands.filter(([b, n]) => (!onlyMine && !inPatterns) || n > 0 || brand === b).map(([b, n]) => (
                <div key={b} className={s.brandGroup}>
                  <div className={cx(s.brandItem, brand === b && !inSeries && s.on)}>
                    <button type="button" className={s.brandPick} onClick={() => pickBrand(b)} aria-current={(brand === b && !inSeries) || undefined}>
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
                  {brand === b && branches.length > 0 && (
                    <div className={s.branches} role="group" aria-label={t("series")} data-testid="bead-series">
                      {branches.map(([x, c]) => (
                        <button key={x} type="button" className={cx(s.brandItem, s.branch, inSeries === x && s.on)} aria-current={inSeries === x || undefined} onClick={() => setSeries(x)}>
                          <span>{x}</span>
                          <small>{c}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className={cx(s.brandItem, !brand && s.on)} onClick={() => pickBrand(null)} aria-current={!brand || undefined}>
                <span>{t("allBrands")}</span>
                <small>{brands.reduce((n, [, c]) => n + c, 0)}</small>
              </button>
            </nav>
            <section className={s.listSide}>
              <div className={cx(home.listHead, s.listHead)}>
                <h2>
                  {brand ?? t("allBrands")}
                  {inSeries && <span className={s.subtitle}> · {inSeries}</span>}
                </h2>
                <span className={s.count}>{shown.length}</span>
                <span className={home.spacer} />
                <div className={cx(ui.seg, home.viewSwitch)} role="group" aria-label={t("view")}>
                  {VIEWS.map((v) => (
                    <button key={v} type="button" className={cx(view === v && ui.on)} aria-pressed={view === v} onClick={() => setView(v)} data-testid={`view-${v}`}>{t(`view_${v}`)}</button>
                  ))}
                </div>
                <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setEditing({ kind, brand: brand ?? builtIn[0] })}>{t(kind === "thread" ? "addThread" : "addBead")}</button>
              </div>
              <div className={s.tools} data-testid="thread-filters">
                <input className={cx(home.search, s.search)} type="search" placeholder={t(kind === "thread" ? "search" : "searchBeads")} aria-label={t("searchLabel")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} data-testid="thread-search" />
                <div className={cx(s.families, family && s.picked)} role="group" aria-label={t("families")}>
                  {FAMILIES.map((f) => (
                    <button key={f} type="button" className={cx(s.family, family === f && s.on)} style={{ background: FAMILY_HEX[f] }} title={t(`family_${f}`)} aria-label={t(`family_${f}`)} aria-pressed={family === f} onClick={() => setFamily(family === f ? null : f)} data-family={f} />
                  ))}
                  {family && (
                    <button type="button" className={s.familyName} onClick={() => setFamily(null)} title={t("clearFamily")}>
                      {t(`family_${family}`)}
                      <span aria-hidden>✕</span>
                    </button>
                  )}
                </div>
                <span className={home.spacer} />
                {/* on a phone the series aren't a branch of the brands: a choice here */}
                {branches.length > 0 && (
                  <select className={cx(home.sort, s.seriesSelect)} aria-label={t("series")} value={inSeries ?? ""} onChange={(e) => setSeries(e.target.value || null)}>
                    <option value="">{t("allSeries")}</option>
                    {branches.map(([x, c]) => <option key={x} value={x}>{`${x} (${c})`}</option>)}
                  </select>
                )}
                <select className={home.sort} aria-label={t("sort")} value={sort} onChange={(e) => setSort(e.target.value as InventorySort)} data-testid="thread-sort">
                  {SORTS.map((o) => <option key={o} value={o}>{t(`sort_${o}`)}</option>)}
                </select>
              </div>
              <div className={s.scroll} data-testid="thread-scroll">
              {failed && <p className={ui.warn}>{t("unreachable")}</p>}
              {!threads && !failed && <p className={ui.hint}>{t("loading")}</p>}
              {onlyMine && threads && !mine.length && <p className={ui.hint}>{t(kind === "thread" ? "empty" : "emptyBeads")}</p>}
              {inPatterns && !uses && <p className={ui.hint}>{t("readingPatterns")}</p>}
              {inPatterns && uses && !usedCount && <p className={ui.hint}>{t("noneInPatterns")}</p>}
              {!shown.length && (!onlyMine || mine.length > 0) && (!inPatterns || !!usedCount) && <p className={ui.hint}>{t("noMatch")}</p>}
              <ThreadList items={shown} view={view} picked={pickedItem?.entry.id ?? null} onPick={(i) => show(i.entry)} onDuplicate={(i) => setEditing({ kind, copyOf: ownOf(i.own) ?? asCustom(i.entry) })} />
              </div>
            </section>
            {panelShown && pickedItem && (
              <ColourPanel
                item={pickedItem}
                sheet={!wide}
                pool={pool}
                uses={uses}
                preview={lib.previewUrl}
                onPick={show}
                onClose={() => setSheetOpen(false)}
                onDuplicate={() => setEditing({ kind, copyOf: pickedItem.own ?? asCustom(pickedItem.entry) })}
                onEdit={pickedItem.own ? () => setEditing({ kind, thread: pickedItem.own! }) : undefined}
                onDelete={pickedItem.own ? () => setDeleting(pickedItem.own) : undefined}
              />
            )}
          </div>
      </main>
      <HomeFooter />

      {editing && (
        <ThreadDialog
          kind={editing.kind}
          brands={brandChoices(editing.kind)}
          key={editing.thread?.id ?? (editing.copyOf ? `copy:${editing.copyOf.id}` : "new")}
          initial={editing.thread ? { brand: editing.thread.brand, code: editing.thread.code, name: editing.thread.name === editing.thread.code ? "" : editing.thread.name, hex: editing.thread.hex }
            : editing.copyOf ? { brand: editing.copyOf.brand, code: "", name: editing.copyOf.name === editing.copyOf.code ? "" : editing.copyOf.name, hex: editing.copyOf.hex }
            : { brand: editing.brand ?? "", code: "", name: "", hex: "#7A9CC6" }}
          editing={!!editing.thread}
          onSave={(f) => save(f)}
          onDelete={editing.thread ? () => {
            setDeleting(editing.thread!);
            setEditing(null);
          } : undefined}
          onDuplicate={editing.thread ? () => setEditing({ kind: editing.kind, copyOf: editing.thread }) : undefined}
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

/** Room for the colour's panel as a column of its own (else it's a sheet from the bottom). */
const WIDE = "(min-width: 1100px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const q = window.matchMedia(WIDE);
      q.addEventListener("change", changed);
      return () => q.removeEventListener("change", changed);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/** A catalogue colour as the start of one of your own (Duplicate). */
const asCustom = (e: ColorEntry): CustomColor => ({ id: e.id, kind: e.kind === "bead" ? "bead" : "thread", brand: e.brand, code: e.code, name: e.name, hex: e.hex });

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
