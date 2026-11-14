import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "uk"],
  defaultLocale: "uk",
  // Ukrainian unless the address says otherwise (/en); the browser language is not used
  localeDetection: false,
});
