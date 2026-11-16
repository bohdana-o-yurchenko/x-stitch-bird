import { POLICY } from "./policy";
import s from "./privacy.module.css";

/** The privacy policy page (static; a link to it sits at the bottom of the main menu). */
export function PrivacyPolicy({ locale }: { locale: string }) {
  const p = POLICY[locale === "uk" ? "uk" : "en"];
  return (
    <main className={s.page} data-testid="privacy">
      <article className={s.doc}>
        <a className={s.back} href={`/${locale}`}>← {p.back}</a>
        <h1>{p.title}</h1>
        <p className={s.updated}>{p.updated}</p>
        <p>{p.intro}</p>
        {p.sections.map((sec) => (
          <section key={sec.title}>
            <h2>{sec.title}</h2>
            {sec.body.map((t, i) => <p key={i}>{t}</p>)}
          </section>
        ))}
      </article>
    </main>
  );
}
