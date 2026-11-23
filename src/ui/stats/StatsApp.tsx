"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createLibrary, usageTotals, type UsageTotal } from "@/editor/library";
import { useRouter } from "@/i18n/navigation";
import { cx, ui } from "../common/widgets";
import { HomeFooter, HomeHeader } from "../home/HomeHeader";
import { PageLoading } from "../common/AppBrand";
import { useSignedInOnly } from "../account/useSignedInOnly";
import { useIsAdmin } from "../account/useIsAdmin";
import home from "../home/home.module.css";
import s from "./stats.module.css";

const RANGES = ["all", "7", "30", "90", "custom"] as const;
type Range = (typeof RANGES)[number];
const WHO = ["all", "in", "out"] as const;
type Who = (typeof WHO)[number];
type SortKey = "feature" | "clicks" | "keys" | "total";

/** A UTC day, `back` days before today. */
const day = (back = 0) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

/** The days a range asks for: null = open. */
function bounds(range: Range, from: string, to: string): [string | null, string | null] {
  if (range === "all") return [null, null];
  if (range === "custom") return [from || null, to || null];
  return [day(Number(range) - 1), null];
}

interface Row {
  feature: string;
  clicks: number;
  keys: number;
  total: number;
}

const rowFor = (t: UsageTotal, who: Who): Row => {
  const clicks = who === "in" ? t.clicksIn : who === "out" ? t.clicksOut : t.clicksIn + t.clicksOut;
  const keys = who === "in" ? t.keysIn : who === "out" ? t.keysOut : t.keysIn + t.keysOut;
  return { feature: t.feature, clicks, keys, total: clicks + keys };
};

/**
 * Feature usage (SPEC §15.55), for admins: how often each button and shortcut was used, summed over everyone —
 * all time or a range of days, everyone or signed in / signed out only. Anyone else is sent to their patterns.
 */
export default function StatsApp() {
  const t = useTranslations("statsPage");
  const locale = useLocale();
  const router = useRouter();
  const lib = useMemo(() => createLibrary(), []);
  const { session, isPending, allowed } = useSignedInOnly();
  const admin = useIsAdmin();
  const u = session?.user;
  const user = u ? { email: u.email, ...(u.name ? { name: u.name } : {}) } : null;
  const [signInOpen, setSignInOpen] = useState(false);
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState(day(29));
  const [to, setTo] = useState(day());
  const [who, setWho] = useState<Who>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "total", desc: true });
  // the answer for one range of days: while another range is asked for, the page says it's loading
  const [answer, setAnswer] = useState<{ query: string; totals: UsageTotal[] | null } | null>(null);

  useEffect(() => {
    if (allowed && !admin) router.replace("/patterns");
  }, [allowed, admin, router]);

  const [qFrom, qTo] = bounds(range, from, to);
  const query = `${qFrom}…${qTo}`;
  useEffect(() => {
    if (!allowed || !admin) return;
    let live = true;
    void usageTotals(qFrom, qTo).then((totals) => live && setAnswer({ query: `${qFrom}…${qTo}`, totals }));
    return () => {
      live = false;
    };
  }, [allowed, admin, qFrom, qTo]);
  const loaded = answer?.query === query ? answer : null;
  const failed = !!loaded && !loaded.totals;
  const totals = loaded?.totals;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (totals ?? []).map((x) => rowFor(x, who)).filter((r) => r.total > 0 && (!q || r.feature.toLowerCase().includes(q)));
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => (sort.key === "feature" ? a.feature.localeCompare(b.feature) : a[sort.key] - b[sort.key] || a.feature.localeCompare(b.feature)) * dir);
  }, [totals, who, search, sort]);
  const sum = rows.reduce((acc, r) => ({ clicks: acc.clicks + r.clicks, keys: acc.keys + r.keys }), { clicks: 0, keys: 0 });
  const most = Math.max(1, ...rows.map((r) => r.total));
  const n = (v: number) => v.toLocaleString(locale);

  if (!allowed || !admin) return <PageLoading />;
  const head = (key: SortKey, label: string, num = true) => (
    <th className={cx(num && s.num)} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => setSort((o) => ({ key, desc: o.key === key ? !o.desc : key !== "feature" }))}>
        {label}
        {sort.key === key && <span aria-hidden> {sort.desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
  return (
    <div className={home.page}>
      <HomeHeader section="stats" user={user} pending={isPending} signInOpen={signInOpen} setSignInOpen={setSignInOpen} beforeSignOut={() => lib.forgetAccountHere()} onSignedOut={() => router.refresh()} />
      <main className={s.main} data-testid="stats-page">
        <h1 className={s.title}>{t("title")}</h1>
        <p className={ui.hint}>{t("intro")}</p>

        <div className={s.controls}>
          <div className={ui.seg} role="group" aria-label={t("range")}>
            {RANGES.map((r) => (
              <button key={r} type="button" className={cx(range === r && ui.on)} aria-pressed={range === r} onClick={() => setRange(r)} data-testid={`stats-range-${r}`}>
                {t(`range_${r}`)}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className={s.dates}>
              <label>
                {t("from")}
                <input className={ui.input} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                {t("to")}
                <input className={ui.input} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          )}
          <div className={ui.seg} role="group" aria-label={t("who")}>
            {WHO.map((w) => (
              <button key={w} type="button" className={cx(who === w && ui.on)} aria-pressed={who === w} onClick={() => setWho(w)} data-testid={`stats-who-${w}`}>
                {t(`who_${w}`)}
              </button>
            ))}
          </div>
          <input className={cx(ui.input, s.search)} type="search" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {!loaded ? (
          <p className={ui.hint}>{t("loading")}</p>
        ) : failed ? (
          <p className={ui.hint} role="alert">{t("failed")}</p>
        ) : (
          <>
            <p className={s.summary} data-testid="stats-summary">
              <span><b>{n(sum.clicks + sum.keys)}</b> {t("total")}</span>
              <span><b>{n(sum.clicks)}</b> {t("clicks")}</span>
              <span><b>{n(sum.keys)}</b> {t("keys")}</span>
              <span><b>{n(rows.length)}</b> {t("features")}</span>
            </p>
            {rows.length === 0 ? (
              <p className={ui.hint}>{t("empty")}</p>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table} data-testid="stats-table">
                  <thead>
                    <tr>
                      {head("feature", t("feature"), false)}
                      {head("clicks", t("clicks"))}
                      {head("keys", t("keys"))}
                      {head("total", t("total"))}
                      <th className={s.barCol} aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const [command, arg] = r.feature.split(":");
                      return (
                        <tr key={r.feature}>
                          <td className={s.feature}>
                            {command}
                            {arg && <span className={s.arg}>: {arg}</span>}
                          </td>
                          <td className={s.num}>{n(r.clicks)}</td>
                          <td className={s.num}>{n(r.keys)}</td>
                          <td className={cx(s.num, s.total)}>{n(r.total)}</td>
                          <td className={s.barCol}>
                            <span className={s.bar} style={{ width: `${(r.total / most) * 100}%` }}>
                              <span className={s.barKeys} style={{ width: `${r.total ? (r.keys / r.total) * 100 : 0}%` }} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
