import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { AppBrand } from "../common/AppBrand";
import { PagesMenu } from "../header/PagesMenu";
import { HomeFooter } from "../home/HomeHeader";
import appBar from "../common/appBar.module.css";
import { HELP_EN } from "./content.en";
import { HELP_UK } from "./content.uk";
import { allQuestions, helpHref, helpLocale, parseInline, type HelpPage, type HelpTexts } from "./help";
import { HelpSearch } from "./HelpSearch";
import { HelpToc } from "./HelpToc";
import s from "./help.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export const helpTexts = (locale: string): HelpTexts => (helpLocale(locale) === "uk" ? HELP_UK : HELP_EN);

/** The text of an answer line: names highlighted, keys as keys, links to other questions. */
function Line({ locale, text }: { locale: string; text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        p.t === "ui" ? <b key={i} className={s.ui}>{p.s}</b>
        : p.t === "key" ? <kbd key={i} className={s.key}>{p.s}</kbd>
        : p.t === "link" ? <a key={i} className={s.link} href={helpHref(locale, p.to)}>{p.s}</a>
        : <span key={i}>{p.s}</span>,
      )}
    </>
  );
}

/** A screenshot's size in CSS pixels (they're taken at 2×), read off the PNG at build time so nothing jumps. */
function shotSize(file: string): { width: number; height: number } | null {
  try {
    const b = readFileSync(file);
    return { width: Math.round(b.readUInt32BE(16) / 2), height: Math.round(b.readUInt32BE(20) / 2) };
  } catch {
    return null;
  }
}

/** The bar and the list of pages around every help page; `toc`: the page's own contents, on the right. */
function Shell({ locale, current, children, toc }: { locale: string; current: string | null; children: ReactNode; toc?: ReactNode }) {
  const texts = helpTexts(locale);
  return (
    <div className={s.page}>
      <header className={cx(appBar.bar, s.top)}>
        <AppBrand link={false} />
        <a className={s.crumb} href={`/${helpLocale(locale)}/help`}>{texts.title}</a>
        <span className={s.spacer} />
        <a className={s.toEditor} href={`/${helpLocale(locale)}/editor`}>{texts.back}</a>
        <PagesMenu />
      </header>
      <div className={cx(s.layout, toc ? s.withToc : undefined)}>
        <nav className={s.nav} aria-label={texts.title}>
          <a className={cx(s.navItem, s.navAll)} href={`/${helpLocale(locale)}/help`} aria-current={current === null ? "page" : undefined}>{texts.contents}</a>
          {texts.pages.map((p) => (
            <a key={p.id} className={s.navItem} href={helpHref(locale, p.id)} aria-current={p.id === current ? "page" : undefined}>{p.title}</a>
          ))}
        </nav>
        <div className={s.scroll} data-help-scroll>
          <main className={s.content} data-testid="help">{children}</main>
        </div>
        {toc}
      </div>
      <HomeFooter />
    </div>
  );
}

/** `/[locale]/help`: search every question, then each page with its questions. */
export function HelpIndex({ locale }: { locale: string }) {
  const texts = helpTexts(locale);
  const items = allQuestions(texts).map((q) => ({ href: helpHref(locale, `${q.page}#${q.id}`), q: q.q, page: q.pageTitle, text: q.a.join(" ") }));
  return (
    <Shell locale={locale} current={null}>
      <h1 className={s.title}>{texts.title}</h1>
      <p className={s.intro}>{texts.intro}</p>
      <HelpSearch items={items} placeholder={texts.search} noMatch={texts.noMatch} />
      <div className={s.cards}>
        {texts.pages.map((p, n) => (
          <section key={p.id} className={s.card}>
            <span className={s.cardNum}>{n + 1}</span>
            <h2><a href={helpHref(locale, p.id)}>{p.title}</a></h2>
            <p>{p.intro}</p>
            <ul>
              {p.groups.flatMap((g) => g.qs).map((q) => (
                <li key={q.id}><a href={helpHref(locale, `${p.id}#${q.id}`)}>{q.q}</a></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}

/** `/[locale]/help/<page>`: its questions, each with its anchor, answer and screenshot. */
export function HelpPageView({ locale, page }: { locale: string; page: HelpPage }) {
  const texts = helpTexts(locale);
  const lang = helpLocale(locale);
  const n = texts.pages.findIndex((p) => p.id === page.id);
  const next = texts.pages[n + 1];
  return (
    <Shell locale={locale} current={page.id} toc={<HelpToc title={texts.onThisPage} groups={page.groups.map((g) => ({ title: g.title, qs: g.qs.map((q) => ({ id: q.id, q: q.q })) }))} />}>
      <p className={s.kicker}>{n + 1} / {texts.pages.length}</p>
      <h1 className={s.title}>{page.title}</h1>
      <p className={s.intro}>{page.intro}</p>
      {page.groups.map((g) => (
        <section key={g.title} className={s.group}>
          <h2 className={s.groupTitle}>{g.title}</h2>
          {g.qs.map((q) => {
            const src = `/help/${lang}/${q.id}.png`;
            const size = q.shot ? shotSize(join(process.cwd(), "public", src)) : null;
            return (
              <section key={q.id} id={q.id} className={s.q}>
                <h3 className={s.qTitle}><a href={`#${q.id}`}>{q.q}</a></h3>
                <ul className={s.answer}>
                  {q.a.map((line) => <li key={line}><Line locale={locale} text={line} /></li>)}
                </ul>
                {size && (
                  <figure className={s.shot}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a plain picture of the app, already sized */}
                    <img src={src} alt="" width={size.width} height={size.height} loading="lazy" />
                  </figure>
                )}
              </section>
            );
          })}
        </section>
      ))}
      {next && (
        <div className={s.next}>
          <a href={helpHref(locale, next.id)}>{texts.next}: {next.title} →</a>
        </div>
      )}
    </Shell>
  );
}
