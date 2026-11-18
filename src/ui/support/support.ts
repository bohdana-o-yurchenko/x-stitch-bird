import { CONTACT_EMAIL } from "../privacy/policy";

/** "Something went wrong?" (SPEC §15.49): where to write, what helps, and the terms the app is used on. */
export interface Support {
  title: string;
  intro: string;
  write: string;
  helps: string;
  helpList: string[];
  terms: string;
  termsBody: string[];
  privacy: string;
  back: string;
  /** The email's subject, with the app's version. */
  subject: (version: string) => string;
}

export const SUPPORT: Record<"en" | "uk", Support> = {
  en: {
    title: "Something went wrong?",
    intro: `If something doesn’t work as it should, or you’d like the app to do something it doesn’t yet, write to ${CONTACT_EMAIL}. We’ll look into it.`,
    write: "Write an email",
    helps: "It helps to know",
    helpList: [
      "what you did, what you expected, and what happened instead;",
      "a screenshot, if you can;",
      "the app’s version (☰ ▸ What’s new), your browser and device;",
      "for a problem with a pattern, its work file (Pattern ▾ ▸ Download work file).",
    ],
    terms: "Using пташечка",
    termsBody: [
      "пташечка is free software, provided as it is, without any warranty (GNU AGPL, version 3 or later). Keep a copy of work that matters to you — the work file can be downloaded at any time.",
      "You are responsible for the patterns you make with it. Many charts are protected by copyright: when you copy a chart, respect its designer’s terms — usually, a copy for your own stitching only.",
      "The app has no way to publish or share patterns: what you make stays in your browser, or in your own account when you sign in. We don’t look at your patterns.",
    ],
    privacy: "What data the app keeps, and where: the privacy policy.",
    back: "Back to the editor",
    subject: (v) => `пташечка ${v}: `,
  },
  uk: {
    title: "Щось пішло не так?",
    intro: `Якщо щось працює не так, як має, або ви хочете, щоб застосунок умів те, чого ще не вміє, напишіть на ${CONTACT_EMAIL}. Ми розберемося.`,
    write: "Написати листа",
    helps: "Допоможе, якщо ви напишете",
    helpList: [
      "що ви робили, чого очікували і що сталося натомість;",
      "знімок екрана, якщо можна;",
      "версію застосунку (☰ ▸ Що нового), ваш браузер і пристрій;",
      "якщо проблема зі схемою — її робочий файл (Схема ▾ ▸ Завантажити робочий файл).",
    ],
    terms: "Користування пташечкою",
    termsBody: [
      "пташечка — вільне програмне забезпечення, надане «як є», без жодних гарантій (GNU AGPL, версія 3 чи новіша). Зберігайте копію важливої роботи — робочий файл можна завантажити будь-коли.",
      "Ви відповідаєте за схеми, які створюєте в застосунку. Багато схем захищені авторським правом: копіюючи схему, дотримуйтеся умов її автора — зазвичай це копія лише для власної вишивки.",
      "Застосунок не вміє публікувати чи поширювати схеми: створене лишається у вашому браузері або, після входу, у вашому власному обліковому записі. Ми не переглядаємо ваших схем.",
    ],
    privacy: "Які дані зберігає застосунок і де — у політиці конфіденційності.",
    back: "Повернутися до редактора",
    subject: (v) => `пташечка ${v}: `,
  },
};
