import { CHANGELOG } from "@/core/release/changelog";
import { CONTACT_EMAIL } from "../privacy/policy";
import { SUPPORT } from "./support";
import s from "../privacy/privacy.module.css";
import own from "./support.module.css";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? CHANGELOG[0]!.version;

/** "Something went wrong?" (static; ☰ ▸ Something went wrong?, next to the privacy policy). */
export function SupportPage({ locale }: { locale: string }) {
  const p = SUPPORT[locale === "uk" ? "uk" : "en"];
  const mail = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(p.subject(VERSION))}`;
  return (
    <main className={s.page} data-testid="support">
      <article className={s.doc}>
        <a className={s.back} href={`/${locale}`}>← {p.back}</a>
        <h1>{p.title}</h1>
        <p>{p.intro}</p>
        <p>
          <a className={own.button} href={mail} data-testid="support-mail">{p.write}</a>
        </p>
        <h2>{p.helps}</h2>
        <ul className={own.list}>{p.helpList.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2>{p.terms}</h2>
        {p.termsBody.map((t) => <p key={t}>{t}</p>)}
        <p>
          <a className={own.link} href={`/${locale}/privacy`}>{p.privacy}</a>
        </p>
      </article>
    </main>
  );
}
