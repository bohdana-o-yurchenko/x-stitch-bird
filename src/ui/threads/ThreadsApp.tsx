"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BUILT_IN_THREAD_BRANDS } from "@/core/pattern/brands";
import type { CustomColor } from "@/core/pattern/types";
import { createLibrary } from "@/editor/library";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "../account/authClient";
import { Modal, cx, ui } from "../common/widgets";
import { HomeHeader } from "../home/HomeHeader";
import home from "../home/home.module.css";
import { ThreadForm, type ThreadFields } from "./ThreadForm";
import s from "./threads.module.css";

/** Built-in brands: your threads can be added to them, but they can't be renamed or deleted. */
const BUILT_IN = new Set([...BUILT_IN_THREAD_BRANDS, "Mill Hill"]);

type Editing = { kind: "thread" | "bead"; thread?: CustomColor; brand?: string } | null;

const newId = () => `custom:${Math.random().toString(36).slice(2, 10)}`;

/**
 * Threads (SPEC §15.28): your own threads and beads, signed in — by brand; add, change (also its brand), delete.
 * Your own brands can be renamed or deleted. Signed out there is no inventory: custom colours live in their pattern.
 */
export default function ThreadsApp() {
  const t = useTranslations("threadsPage");
  const lib = useMemo(() => createLibrary(), []);
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const u = session?.user;
  const user = u ? { email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [signInOpen, setSignInOpen] = useState(false);
  const [threads, setThreads] = useState<CustomColor[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
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

  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of threads ?? []) counts.set(c.brand, (counts.get(c.brand) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [threads]);
  const shown = (threads ?? []).filter((c) => !brand || c.brand === brand).sort((a, b) => a.brand.localeCompare(b.brand) || a.code.localeCompare(b.code, undefined, { numeric: true }));

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
    const moved = (threads ?? []).filter((c) => c.brand === from).map((c) => ({ ...c, brand: name }));
    for (const c of moved) await lib.saveThread(c);
    setThreads((list) => (list ?? []).map((c) => (c.brand === from ? { ...c, brand: name } : c)));
    if (brand === from) setBrand(name);
  };
  const deleteBrand = async (b: string) => {
    for (const c of (threads ?? []).filter((x) => x.brand === b)) await lib.removeThread(c.id);
    setThreads((list) => (list ?? []).filter((c) => c.brand !== b));
    if (brand === b) setBrand(null);
  };

  const brandChoices = [...new Set([...(brand ? [brand] : []), ...BUILT_IN_THREAD_BRANDS, ...brands.map(([b]) => b)])];

  return (
    <div className={home.page}>
      <HomeHeader section="threads" user={user} pending={isPending} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />
      <main className={home.main}>
        {!isPending && !user ? (
          <section className={home.empty} data-testid="threads-signed-out">
            <h1>{t("title")}</h1>
            <p className={ui.hint} style={{ maxWidth: 520 }}>{t("signedOut")}</p>
            <div className={home.emptyButtons}>
              <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setSignInOpen(true)}>{t("signIn")}</button>
            </div>
          </section>
        ) : (
          <div className={s.layout}>
            <nav className={s.brandList} aria-label={t("brands")} data-testid="thread-brands">
              <button type="button" className={cx(s.brandItem, !brand && s.on)} onClick={() => setBrand(null)}>
                <span>{t("all")}</span>
                <small>{threads?.length ?? ""}</small>
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
                <h2>{brand ?? t("all")}</h2>
                <span className={home.spacer} />
                <button type="button" className={ui.btn} onClick={() => setEditing({ kind: "bead", brand: brand ?? "Mill Hill" })}>{t("addBead")}</button>
                <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setEditing({ kind: "thread", brand: brand ?? undefined })}>{t("addThread")}</button>
              </div>
              {failed && <p className={ui.warn}>{t("unreachable")}</p>}
              {!threads && !failed && <p className={ui.hint}>{t("loading")}</p>}
              {threads && !threads.length && <p className={ui.hint}>{t("empty")}</p>}
              <div className={s.threadGrid} data-testid="thread-list">
                {shown.map((c) => (
                  <button key={c.id} type="button" className={s.thread} onClick={() => setEditing({ kind: c.kind, thread: c })} aria-label={t("edit", { brand: c.brand, code: c.code })}>
                    <span className={s.swatch} style={{ background: c.hex }} />
                    <span className={s.threadText}>
                      <b>{c.code}</b>
                      <span>{c.name !== c.code ? c.name : ""}</span>
                      <small>{c.kind === "bead" ? t("beadOf", { brand: c.brand }) : c.brand}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {editing && (
        <Modal title={editing.thread ? t("editTitle") : t(editing.kind === "bead" ? "newBead" : "newThread")} onClose={() => setEditing(null)} buttons={[]}>
          <ThreadForm
            kind={editing.kind}
            brands={brandChoices}
            initial={editing.thread ? { brand: editing.thread.brand, code: editing.thread.code, name: editing.thread.name, hex: editing.thread.hex } : { brand: editing.brand ?? brandChoices[0] ?? "DMC", code: "", name: "", hex: "#7A9CC6" }}
            saveLabel={editing.thread ? t("save") : t("add")}
            onSave={(f) => void save(f)}
            onCancel={() => setEditing(null)}
          />
          {editing.thread && (
            <button type="button" className={cx(ui.btn, ui.sm, ui.dangerBtn)} style={{ marginTop: 10 }} onClick={() => {
                setDeleting(editing.thread!);
                setEditing(null);
              }}>{t("delete")}</button>
          )}
        </Modal>
      )}
      {deleting && (
        <Modal title={t("deleteTitle", { brand: deleting.brand, code: deleting.code })} onClose={() => setDeleting(null)} buttons={[{ label: t("cancel") }, { label: t("delete"), danger: true, onClick: () => remove(deleting) }]}>
          <p>{t("deleteBody")}</p>
        </Modal>
      )}
      {brandAction?.kind === "rename" && <RenameBrand from={brandAction.brand} onClose={() => setBrandAction(null)} onRename={(to) => renameBrand(brandAction.brand, to)} />}
      {brandAction?.kind === "delete" && (
        <Modal title={t("deleteBrandTitle", { brand: brandAction.brand })} onClose={() => setBrandAction(null)} buttons={[{ label: t("cancel") }, { label: t("delete"), danger: true, onClick: () => deleteBrand(brandAction.brand) }]}>
          <p>{t("deleteBrandBody", { count: (threads ?? []).filter((c) => c.brand === brandAction.brand).length })}</p>
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
