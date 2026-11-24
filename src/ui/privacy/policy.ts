/** The privacy policy's text (SPEC §15.23): one entry per language, the same sections in the same order. */
export const CONTACT_EMAIL = "ptashechka.app@gmail.com";
export const POLICY_UPDATED = "2026-11-24";

export type Section = { title: string; body: string[] };
export interface Policy {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
  back: string;
}

export const POLICY: Record<"en" | "uk", Policy> = {
  en: {
    title: "Privacy policy",
    updated: `Last updated: ${POLICY_UPDATED}`,
    intro:
      "пташечка (https://www.x-stitch-bird.app) is a free editor for cross stitch and bead patterns. This page explains what data the app collects, why, where it is kept, and how you can have it deleted.",
    sections: [
      {
        title: "Without an account",
        body: [
          "You can use the whole editor without signing in. Then your patterns, photos, settings and drafts are stored only in your own browser (local storage and IndexedDB). They are not sent to us, and we cannot see them.",
        ],
      },
      {
        title: "With an account (optional)",
        body: [
          "If you sign in, we collect: your email address; your name and profile picture, if you sign in with Google; the patterns you save while signed in — the pattern file (its key, chart, notes and pattern information you entered), its name and size, a small preview picture of it and its earlier versions; the photos, scans and PDFs you add to a pattern (behind the chart or in floating windows) with the marks you make on them; and the threads and beads of your own you add; and, for the tip of the day, which tips you have seen and how many times you have used each of the editor's features, by button and by keyboard shortcut.",
          "We use this only to let you sign in, to show who is signed in, to keep your patterns so you can open them on any device, and to pick tips of the day you'd find new. We do not use it for advertising or profiling.",
        ],
      },
      {
        title: "Who can see your patterns",
        body: [
          "Your patterns, photos and PDFs are private to your account: the app has no way to publish or share them. We don’t look at them. Stored data is accessed only to run the service, to look into a problem you report and ask us to check, or when the law requires it.",
        ],
      },
      {
        title: "Google sign-in and Google user data",
        body: [
          "Sign in with Google asks Google only for your basic profile: email address, name and profile picture (the openid, email and profile scopes). We do not access your Gmail, Drive, contacts or any other Google data.",
          "This data is used only to sign you in and identify your account. It is not sold, not shared with anyone for their own purposes, not used for advertising, and not used to train AI models. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
        ],
      },
      {
        title: "Sign-in codes by email",
        body: ["If you sign in with a code by email, we send that code to your address through our email provider. Your address is used for sign-in codes only — no newsletters or marketing."],
      },
      {
        title: "Where data is stored, and who processes it",
        body: [
          "Accounts, saved patterns, their versions, pictures and PDFs are stored with Neon (Neon, Inc.: database, sign-in and file storage), on servers in Frankfurt, Germany (EU). The app is hosted by Vercel (Vercel Inc.). Google provides Google sign-in; our email provider sends sign-in codes.",
          "These providers process data only to run these services for us. We do not sell or rent personal data to anyone.",
        ],
      },
      {
        title: "Analytics and cookies",
        body: [
          "We use Vercel Web Analytics and Speed Insights to count page views and measure how fast the app loads. They do not use cookies, do not collect personal data, and do not track you across other websites.",
          "The editor also counts how often each of its buttons and keyboard shortcuts is used, to learn which features matter. Only the totals are sent — which feature, how many times, and whether you were signed in — added to everyone's counts per day. Nothing that identifies you, your device or your patterns is sent or kept.",
          "For the tip of the day, the editor also keeps its own count of the features you use and the tips you have seen — in your browser, and in your account when you are signed in — only to choose tips that are new to you. It is never added to the shared counts or shown to anyone.",
          "When you sign in, a sign-in session cookie keeps you signed in. We use no advertising or tracking cookies.",
        ],
      },
      {
        title: "How long we keep data, and how to delete it",
        body: [
          "Your account and saved patterns are kept while you have the account. You can delete any saved pattern yourself, at any time (My patterns ▸ ⋯ ▸ Delete); this also removes it from your account, with its photos, PDFs and versions. A photo or PDF can also be removed on its own: close its floating window, or remove the image behind the chart (References).",
          `You can delete your account and everything stored with it yourself, at once (account menu ▸ Account ▸ Delete account). You can also email ${CONTACT_EMAIL} from the address you sign in with, and we delete it within 30 days. Signing out does not delete anything.`,
          "Data kept only in your browser stays there until you clear it (for example by clearing the site's data in your browser settings).",
        ],
      },
      {
        title: "Your rights",
        body: [
          "You can ask us what data we hold about you, to correct it, to delete it, or to receive a copy. Your patterns can be downloaded at any time as .xbird files (Pattern ▾ ▸ Download work file). If you are in the EU, you can also complain to your data protection authority.",
        ],
      },
      {
        title: "Children",
        body: ["The app is not directed at children under 13, and we do not knowingly collect their personal data."],
      },
      {
        title: "Changes and contact",
        body: [
          "If this policy changes, the new version will be posted on this page with a new date.",
          `Questions, requests or account deletion: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
    back: "Back to the editor",
  },
  uk: {
    title: "Політика конфіденційності",
    updated: `Оновлено: ${POLICY_UPDATED}`,
    intro:
      "пташечка (https://www.x-stitch-bird.app) — безкоштовний редактор схем для вишивки хрестиком і бісером. Тут пояснено, які дані збирає застосунок, навіщо, де вони зберігаються і як їх видалити.",
    sections: [
      {
        title: "Без облікового запису",
        body: [
          "Увесь редактор можна використовувати без входу. Тоді ваші схеми, фото, налаштування й чернетки зберігаються лише у вашому браузері (local storage та IndexedDB). Нам вони не надсилаються, і ми їх не бачимо.",
        ],
      },
      {
        title: "З обліковим записом (за бажанням)",
        body: [
          "Якщо ви входите, ми збираємо: вашу електронну адресу; ім’я та фото профілю, якщо ви входите через Google; схеми, які ви зберігаєте після входу, — файл схеми (ключ, схему, нотатки й інформацію про схему, яку ви ввели), її назву й розмір, невелике зображення-прев’ю та попередні версії; фото, скани й PDF, які ви додаєте до схеми (під схему чи в плаваючі вікна), з позначками на них; і ваші власні нитки та бісер; а для поради дня — які поради ви вже бачили й скільки разів ви користувалися кожною можливістю редактора, кнопкою чи гарячою клавішею.",
          "Ми використовуємо це лише для входу, щоб показувати, хто увійшов, щоб зберігати ваші схеми для відкриття на будь-якому пристрої й щоб добирати поради дня, нові для вас. Не для реклами й не для профілювання.",
        ],
      },
      {
        title: "Хто бачить ваші схеми",
        body: [
          "Ваші схеми, фото й PDF приватні для вашого облікового запису: застосунок не вміє їх публікувати чи поширювати. Ми їх не переглядаємо. До збережених даних звертаємося лише для роботи сервісу, щоб розібратися з проблемою, про яку ви повідомили й попросили перевірити, або коли цього вимагає закон.",
        ],
      },
      {
        title: "Вхід через Google і дані Google",
        body: [
          "Вхід через Google запитує в Google лише базовий профіль: електронну адресу, ім’я та фото профілю (області openid, email і profile). Ми не маємо доступу до вашої пошти Gmail, Диска, контактів чи інших даних Google.",
          "Ці дані використовуються лише для входу й визначення вашого облікового запису. Вони не продаються, не передаються нікому для власних цілей, не використовуються для реклами й для навчання моделей ШІ. Використання інформації, отриманої через API Google, відповідає Політиці щодо даних користувачів сервісів Google API, зокрема вимогам обмеженого використання (Limited Use).",
        ],
      },
      {
        title: "Коди для входу поштою",
        body: ["Якщо ви входите з кодом на пошту, ми надсилаємо цей код на вашу адресу через нашого поштового провайдера. Адреса використовується лише для кодів входу — жодних розсилок чи реклами."],
      },
      {
        title: "Де зберігаються дані й хто їх обробляє",
        body: [
          "Облікові записи, збережені схеми, їхні версії, зображення й PDF зберігаються в Neon (Neon, Inc.: база даних, вхід і сховище файлів) на серверах у Франкфурті, Німеччина (ЄС). Застосунок розміщено на Vercel (Vercel Inc.). Google забезпечує вхід через Google; наш поштовий провайдер надсилає коди входу.",
          "Ці провайдери обробляють дані лише для роботи цих сервісів. Ми не продаємо й не здаємо в оренду персональні дані.",
        ],
      },
      {
        title: "Аналітика й файли cookie",
        body: [
          "Ми використовуємо Vercel Web Analytics і Speed Insights, щоб рахувати перегляди сторінок і вимірювати швидкість завантаження. Вони не використовують cookie, не збирають персональних даних і не відстежують вас на інших сайтах.",
          "Редактор також рахує, як часто використовують кожну його кнопку й клавіатурне скорочення, щоб знати, які функції потрібні. Надсилаються лише підсумки — яка функція, скільки разів і чи ви увійшли, — і додаються до спільних лічильників за день. Нічого, що визначає вас, ваш пристрій чи ваші схеми, не надсилається й не зберігається.",
          "Для поради дня редактор ще й сам рахує, якими можливостями ви користуєтеся і які поради вже бачили, — у вашому браузері, а якщо ви увійшли, то й в обліковому записі, — лише щоб добирати нові для вас поради. До спільних лічильників це не додається й нікому не показується.",
          "Коли ви входите, cookie сеансу зберігає вхід. Рекламних чи відстежувальних cookie ми не використовуємо.",
        ],
      },
      {
        title: "Скільки зберігаються дані й як їх видалити",
        body: [
          "Обліковий запис і збережені схеми зберігаються, доки існує обліковий запис. Будь-яку збережену схему можна видалити самостійно будь-коли (Мої схеми ▸ ⋯ ▸ Видалити); вона зникає й з облікового запису разом із фото, PDF і версіями. Фото чи PDF можна прибрати й окремо: закрийте його плаваюче вікно або приберіть зображення під схемою (Референси).",
          `Обліковий запис і все, що з ним збережено, можна видалити самостійно, одразу (меню облікового запису ▸ Обліковий запис ▸ Видалити обліковий запис). Або напишіть на ${CONTACT_EMAIL} з адреси, якою ви входите, — ми видалимо все протягом 30 днів. Вихід нічого не видаляє.`,
          "Дані, що зберігаються лише в браузері, лишаються там, доки ви їх не очистите (наприклад, очистивши дані сайту в налаштуваннях браузера).",
        ],
      },
      {
        title: "Ваші права",
        body: [
          "Ви можете попросити нас повідомити, які дані про вас ми маємо, виправити їх, видалити або надати копію. Схеми можна будь-коли завантажити файлами .xbird (Схема ▾ ▸ Завантажити робочий файл). Якщо ви в ЄС, ви також можете звернутися до органу із захисту даних.",
        ],
      },
      {
        title: "Діти",
        body: ["Застосунок не призначений для дітей до 13 років, і ми свідомо не збираємо їхніх персональних даних."],
      },
      {
        title: "Зміни й контакти",
        body: [
          "Якщо політика зміниться, нова версія з’явиться на цій сторінці з новою датою.",
          `Питання, запити чи видалення облікового запису: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
    back: "Повернутися до редактора",
  },
};
