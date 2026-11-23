import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EDITOR, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { SOURCE_URL } from "../common/source";
import { AutofillArt, CheckArt, ChecksArt, EditorShot, FilesArt, InstallArt, PalettesArt, RefsArt, StraightenArt, VersionsArt } from "./art";
import s from "./landing.module.css";

/** Each language in itself, so it can be found whichever one is on. */
const LANGUAGE_NAMES: Record<string, string> = { uk: "Українська", en: "English" };

/**
 * The landing page (SPEC §15.53): what пташечка is, one big way into the editor, then what it does — a line or two
 * and a picture each. Static: no account, no storage; a signed-in visitor never sees it (src/proxy.ts).
 */
export function Landing({ locale }: { locale: string }) {
  const t = useTranslations("landing");
  const app = useTranslations("app");
  const home = useTranslations("home");
  const m = (key: string) => t(`mock.${key}`);
  const features: [string, ReactNode][] = [
    ["install", <InstallArt key="a" saved={m("saved")} everywhere={m("everywhere")} />],
    ["refs", <RefsArt key="a" keyTitle={m("key")} page={m("page")} />],
    ["straighten", <StraightenArt key="a" edit={m("edit")} />],
    ["autofill", <AutofillArt key="a" found={m("found")} accept={m("accept")} decline={m("decline")} />],
    ["palettes", <PalettesArt key="a" keyTitle={m("key")} blend={m("blend")} bead={m("bead")} flossBead={m("flossBead")} own={m("own")} />],
    ["checks", <ChecksArt key="a" title={m("checks")} holes={m("holes")} lone={m("lone")} symmetry={m("symmetry")} />],
    ["versions", <VersionsArt key="a" title={m("versions")} restore={m("restore")} autosave={m("autosave")} beforeImport={m("beforeImport")} />],
    ["files", <FilesArt key="a" yourApp={m("yourApp")} print={m("print")} work={m("work")} />],
    ["check", <CheckArt key="a" file={m("checkFile")} progress={m("checkProgress")} items={[m("checkFull"), m("checkCombo"), m("checkBeads"), m("checkBack")]} ok={m("ok")} issue={m("issue")} />],
  ];
  /** The two ways in, side by side and the same size: the editor, and the check of one's app. */
  const ways = (testId?: string) => (
    <div className={s.ways}>
      <Link href={EDITOR} className={s.cta} data-testid={testId && `${testId}-open`}>{t("open")} →</Link>
      <Link href="/check" className={`${s.cta} ${s.ctaAlt}`} data-testid={testId && `${testId}-check`}>{t("openCheck")} →</Link>
    </div>
  );
  return (
    <div className={s.page} data-testid="landing">
      {/* the installed app opens in the editor; one installed before the editor moved may still start here */}
      <script dangerouslySetInnerHTML={{ __html: `if(matchMedia("(display-mode: standalone)").matches)location.replace("/${locale}/editor")` }} />
      <header className={s.top}>
        <span className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the static logo, as in every page's bar */}
          <img src="/icon.svg" alt="" width={30} height={30} />
          пташечка
        </span>
        <nav className={s.langs} aria-label={app("language")}>
          {routing.locales.map((l) => (
            <Link key={l} href="/" locale={l} aria-current={l === locale ? "true" : undefined} lang={l} title={LANGUAGE_NAMES[l]}>
              <span className={s.long}>{LANGUAGE_NAMES[l]}</span>
              <span className={s.short}>{l.toUpperCase()}</span>
            </Link>
          ))}
        </nav>
        <Link href="/check" className={`${s.topOpen} ${s.topAlt}`}>
          <span className={s.long}>{t("openCheck")}</span>
          <span className={s.short}>{t("openCheckShort")}</span>
        </Link>
        <Link href={EDITOR} className={s.topOpen}>
          <span className={s.long}>{t("open")}</span>
          <span className={s.short}>{t("openShort")}</span>
        </Link>
      </header>

      <main>
        <section className={s.hero}>
          <h1>{t("title")}</h1>
          <p className={s.lead}>{t("lead")}</p>
          {ways("landing")}
          <p className={s.note}>{t("note")}</p>
          <div className={s.heroShot}>
            <EditorShot keyTitle={m("key")} />
          </div>
        </section>

        <section className={s.features} aria-label={t("features")}>
          {features.map(([id, art]) => (
            <article key={id} className={s.feature}>
              <div className={s.featureText}>
                <h2>{t(`${id}.title`)}</h2>
                <p>{t(`${id}.text`)}</p>
              </div>
              <div className={s.featureArt}>{art}</div>
            </article>
          ))}
        </section>

        <section className={s.again}>
          <h2>{t("again")}</h2>
          {ways()}
        </section>
      </main>

      <footer className={s.footer}>
        <span>{home("freeSoftware")}</span>
        <a href={SOURCE_URL} target="_blank" rel="noopener">{home("source")}</a>
        <Link href="/support">{t("support")}</Link>
        <Link href="/privacy">{home("privacy")}</Link>
      </footer>
    </div>
  );
}
